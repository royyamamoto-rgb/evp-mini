/**
 * EMFSensorEngine -- Device sensor engine for the EVP-MINI paranormal investigation PWA
 *
 * Reads device magnetometer, accelerometer, and barometer sensors and presents
 * them as "EMF readings" and "environmental sensors" for the investigation experience.
 *
 * Sensor access strategy:
 *   Magnetometer:  Generic Sensor API -> DeviceOrientationEvent fallback -> unavailable
 *   Accelerometer: DeviceMotionEvent (with iOS 13+ requestPermission) -> unavailable
 *   Barometer:     Barometer API -> AmbientLightSensor fallback -> simulated pressure
 *
 * All sensor access degrades gracefully. The app works with zero sensor access.
 */
class EMFSensorEngine {
  constructor() {
    // ── Sensor availability flags ──────────────────────────────────────────────
    this.magnetometerAvailable = false;
    this.accelerometerAvailable = false;
    this.barometerAvailable = false;
    this.gyroscopeAvailable = false;
    this.temperatureAvailable = false;
    this.isInitialized = false;

    // ── Magnetometer state ─────────────────────────────────────────────────────
    this.magX = 0;
    this.magY = 0;
    this.magZ = 0;
    this.magMagnitude = 0;
    this.magBaseline = 0;
    this.magBaselineValues = [];
    this.magBaselineFrames = 150;          // ~5 seconds at 30 fps
    this.magBaselineEstablished = false;
    this.emfAnomaly = false;
    this.emfDeviation = 0;
    this.emfThreshold = 5;                 // microTesla deviation
    this.magSource = 'none';               // 'api' | 'orientation' | 'none'
    this.magPeakDeviation = 0;
    this.magAnomalyCount = 0;
    this.magAnomalyTimestamps = [];

    // ── Accelerometer state ────────────────────────────────────────────────────
    this.accelX = 0;
    this.accelY = 0;
    this.accelZ = 0;
    this.vibrationLevel = 0;
    this.vibrationBaseline = 0;
    this.vibrationBaselineValues = [];
    this.vibrationBaselineEstablished = false;
    this.accelBuffer = [];                 // magnitude history for DFT
    this.accelBufferSize = 256;
    this.infrasoundDetected = false;
    this.fearFreqAlert = false;            // 18.98 Hz Tandy frequency
    this.dominantVibFreq = 0;
    this.vibrationAnomalyCount = 0;
    this.infrasoundEventCount = 0;
    this.fearFreqDetectionCount = 0;
    this.accelSource = 'none';             // 'api' | 'motion' | 'none'

    // ── Gyroscope state (from rotationRate in DeviceMotion) ────────────────────
    this.gyroAlpha = 0;
    this.gyroBeta = 0;
    this.gyroGamma = 0;

    // ── Barometer / pressure state ─────────────────────────────────────────────
    this.pressure = 1013.25;               // hPa standard atmosphere
    this.pressureBaseline = 0;
    this.pressureBaselineValues = [];
    this.pressureBaselineEstablished = false;
    this.pressureAnomaly = false;
    this.pressureAnomalyCount = 0;
    this.pressureMaxChange = 0;
    this.pressureSimulated = false;
    this.pressureThreshold = 2;            // hPa change in 10-second window
    this.barometerSource = 'none';         // 'api' | 'ambient' | 'simulated' | 'none'

    // Simulated barometer Perlin-like walk state
    this._simPressure = 1013.25;
    this._simVelocity = 0;
    this._simPhase = Math.random() * Math.PI * 2;

    // ── Temperature state ──────────────────────────────────────────────────────
    this.temperature = null;

    // ── History arrays (last 300 samples for trending) ─────────────────────────
    this.emfHistory = [];
    this.vibrationHistory = [];
    this.pressureHistory = [];
    this.historyMaxLength = 300;

    // ── Timeline events ────────────────────────────────────────────────────────
    this.events = [];
    this.maxEvents = 200;

    // ── Timing ─────────────────────────────────────────────────────────────────
    this.frameCount = 0;
    this.startTime = 0;

    // ── Sensor object references (for cleanup) ─────────────────────────────────
    this._magnetometer = null;
    this._barometer = null;
    this._ambientLight = null;
    this._orientationHandler = null;
    this._motionHandler = null;

    // ── DFT cache ──────────────────────────────────────────────────────────────
    this._dftResult = {
      dominantFreq: 0,
      peakAmplitude: 0,
      fearFreqAmplitude: 0,
      infrasoundPeaks: []
    };
    this._lastDFTFrame = 0;
    this._dftInterval = 10;                // recompute DFT every N frames
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Initialize all sensors. Call once after construction.
   * Returns availability summary.
   */
  async init() {
    this.startTime = performance.now();

    await this._initMagnetometer();
    await this._initAccelerometer();
    await this._initBarometer();

    this.isInitialized = true;

    const sensorsAvailable = (this.magnetometerAvailable ? 1 : 0) +
                             (this.accelerometerAvailable ? 1 : 0) +
                             (this.barometerAvailable ? 1 : 0);

    return {
      magnetometer: this.magnetometerAvailable,
      accelerometer: this.accelerometerAvailable,
      barometer: this.barometerAvailable,
      magSource: this.magSource,
      accelSource: this.accelSource,
      sensorsAvailable: sensorsAvailable
    };
  }

  /**
   * Try to initialize the magnetometer.
   * Strategy: Generic Sensor API -> DeviceOrientationEvent -> unavailable.
   */
  async _initMagnetometer() {
    // ── Try 1: Generic Sensor API (Chrome 67+ on Android) ────────────────────
    if (typeof Magnetometer !== 'undefined') {
      try {
        let permissionOk = true;
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const perm = await navigator.permissions.query({ name: 'magnetometer' });
            if (perm.state === 'denied') permissionOk = false;
          } catch (_e) {
            // permissions.query may not support 'magnetometer'; proceed anyway
          }
        }
        if (permissionOk) {
          const sensor = new Magnetometer({ frequency: 30 });
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              sensor.removeEventListener('reading', onReading);
              sensor.removeEventListener('error', onError);
              reject(new Error('Magnetometer timeout'));
            }, 2000);

            const onReading = () => {
              clearTimeout(timeout);
              sensor.removeEventListener('error', onError);
              resolve();
            };
            const onError = (e) => {
              clearTimeout(timeout);
              sensor.removeEventListener('reading', onReading);
              reject(e.error || e);
            };

            sensor.addEventListener('reading', onReading, { once: true });
            sensor.addEventListener('error', onError, { once: true });
            sensor.start();
          });

          // Sensor started and gave a first reading
          this._magnetometer = sensor;
          this._magnetometer.addEventListener('reading', () => {
            this.magX = this._magnetometer.x || 0;
            this.magY = this._magnetometer.y || 0;
            this.magZ = this._magnetometer.z || 0;
          });
          this.magnetometerAvailable = true;
          this.magSource = 'api';
          return;
        }
      } catch (_e) {
        // Fall through to DeviceOrientation fallback
      }
    }

    // ── Try 2: DeviceOrientationEvent (iOS / older Android) ──────────────────
    try {
      // iOS 13+ requires explicit permission from a user gesture.
      // If requestPermission exists but we are NOT inside a gesture, it will
      // throw or return 'denied'. We still attempt it here; the app can also
      // call requestPermissions() from a button handler later.
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== 'granted') {
            // Will try again later via requestPermissions()
            return;
          }
        } catch (_e) {
          // Not in a user gesture context; leave for requestPermissions()
          return;
        }
      }

      this._orientationHandler = (e) => {
        if (e.alpha !== null || e.beta !== null || e.gamma !== null) {
          const alpha = e.alpha || 0;   // compass heading 0-360
          const beta = e.beta || 0;     // front-back tilt -180..180
          const gamma = e.gamma || 0;   // left-right tilt -90..90

          // DeviceOrientation does not give raw magnetometer uT values.
          // We map orientation angles into an approximate uT-like range.
          // Earth's field is ~25-65 uT. We treat the angles as a proxy for
          // the magnetic vector direction and scale accordingly.
          //
          // Heading (alpha) in radians gives the horizontal component direction.
          // Beta/gamma give the device tilt, which changes the measured component.
          // This is NOT physically accurate but provides meaningful variation
          // that responds to real device movement near magnetic sources.
          const alphaRad = (alpha * Math.PI) / 180;
          const betaRad = (beta * Math.PI) / 180;
          const gammaRad = (gamma * Math.PI) / 180;

          // Approximate uT components (scaled to Earth-field-like range)
          const baseField = 48;  // approximate mid-range Earth field uT
          this.magX = baseField * Math.sin(alphaRad) * Math.cos(gammaRad);
          this.magY = baseField * Math.cos(alphaRad) * Math.cos(betaRad);
          this.magZ = baseField * Math.sin(betaRad);

          this.magnetometerAvailable = true;
          this.magSource = 'orientation';
        }
      };
      window.addEventListener('deviceorientation', this._orientationHandler);

      // Wait briefly to see if the event fires
      await new Promise(resolve => setTimeout(resolve, 600));
      if (!this.magnetometerAvailable) {
        window.removeEventListener('deviceorientation', this._orientationHandler);
        this._orientationHandler = null;
      }
    } catch (_e) {
      this.magnetometerAvailable = false;
      this.magSource = 'none';
    }
  }

  /**
   * Try to initialize the accelerometer via DeviceMotionEvent.
   * iOS 13+ requires requestPermission() from a user gesture.
   */
  async _initAccelerometer() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const perm = await DeviceMotionEvent.requestPermission();
          if (perm !== 'granted') return;
        } catch (_e) {
          // Not in a user gesture context; leave for requestPermissions()
          return;
        }
      }

      this._motionHandler = (e) => {
        // Prefer accelerationIncludingGravity for richer signal
        const accel = e.accelerationIncludingGravity || e.acceleration;
        if (accel) {
          this.accelX = accel.x || 0;
          this.accelY = accel.y || 0;
          this.accelZ = accel.z || 0;
          this.accelerometerAvailable = true;
          this.accelSource = 'motion';

          // Buffer magnitude (gravity removed) for DFT
          const rawMag = Math.sqrt(
            this.accelX * this.accelX +
            this.accelY * this.accelY +
            this.accelZ * this.accelZ
          );
          const vibSample = Math.abs(rawMag - 9.81);
          this.accelBuffer.push(vibSample);
          if (this.accelBuffer.length > this.accelBufferSize) {
            this.accelBuffer.shift();
          }
        }

        // Gyroscope from rotationRate
        const rot = e.rotationRate;
        if (rot && (rot.alpha !== null || rot.beta !== null || rot.gamma !== null)) {
          this.gyroAlpha = rot.alpha || 0;
          this.gyroBeta = rot.beta || 0;
          this.gyroGamma = rot.gamma || 0;
          this.gyroscopeAvailable = true;
        }
      };
      window.addEventListener('devicemotion', this._motionHandler);

      // Wait briefly to confirm readings arrive
      await new Promise(resolve => setTimeout(resolve, 600));
      if (!this.accelerometerAvailable) {
        window.removeEventListener('devicemotion', this._motionHandler);
        this._motionHandler = null;
      }
    } catch (_e) {
      this.accelerometerAvailable = false;
      this.accelSource = 'none';
    }
  }

  /**
   * Try to initialize the barometer.
   * Strategy: Barometer API -> AmbientLightSensor -> simulated smooth random walk.
   */
  async _initBarometer() {
    // ── Try 1: Barometer API (very limited browser support) ──────────────────
    if (typeof Barometer !== 'undefined') {
      try {
        const baro = new Barometer({ frequency: 1 });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            baro.removeEventListener('reading', onReading);
            baro.removeEventListener('error', onError);
            reject(new Error('Barometer timeout'));
          }, 3000);

          const onReading = () => {
            clearTimeout(timeout);
            baro.removeEventListener('error', onError);
            resolve();
          };
          const onError = (e) => {
            clearTimeout(timeout);
            baro.removeEventListener('reading', onReading);
            reject(e.error || e);
          };

          baro.addEventListener('reading', onReading, { once: true });
          baro.addEventListener('error', onError, { once: true });
          baro.start();
        });

        this._barometer = baro;
        this._barometer.addEventListener('reading', () => {
          this.pressure = this._barometer.pressure || 0;
          // Some barometer sensors also expose temperature
          if (typeof this._barometer.temperature === 'number') {
            this.temperature = this._barometer.temperature;
            this.temperatureAvailable = true;
          }
        });
        this.barometerAvailable = true;
        this.pressureSimulated = false;
        this.barometerSource = 'api';
        return;
      } catch (_e) {
        // Fall through
      }
    }

    // ── Try 2: AmbientLightSensor as environmental proxy ─────────────────────
    if (typeof AmbientLightSensor !== 'undefined') {
      try {
        let permOk = true;
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const p = await navigator.permissions.query({ name: 'ambient-light-sensor' });
            if (p.state === 'denied') permOk = false;
          } catch (_e) { /* proceed */ }
        }
        if (permOk) {
          const als = new AmbientLightSensor({ frequency: 1 });
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              als.removeEventListener('reading', onR);
              als.removeEventListener('error', onE);
              reject(new Error('ALS timeout'));
            }, 2000);
            const onR = () => { clearTimeout(timeout); als.removeEventListener('error', onE); resolve(); };
            const onE = (e) => { clearTimeout(timeout); als.removeEventListener('reading', onR); reject(e.error || e); };
            als.addEventListener('reading', onR, { once: true });
            als.addEventListener('error', onE, { once: true });
            als.start();
          });

          this._ambientLight = als;
          // AmbientLightSensor gives illuminance in lux. We store it but also
          // continue with simulated pressure since lux != hPa.
          this._ambientLight.addEventListener('reading', () => {
            // Store illuminance; not used as pressure but available for reports
          });
          this.barometerSource = 'ambient';
          // Still fall through to simulated pressure for barometric readings
        }
      } catch (_e) {
        // Fall through
      }
    }

    // ── Fallback: Simulated barometric pressure ──────────────────────────────
    // Smooth Perlin-like random walk centered on 1013.25 hPa
    this.pressureSimulated = true;
    this.barometerSource = 'simulated';
    this._simPressure = 1013.25 + (Math.random() - 0.5) * 2;
    this._simVelocity = 0;
    this._simPhase = Math.random() * Math.PI * 2;
    this.pressure = this._simPressure;
    // barometerAvailable stays false for simulated (real sensor not present)
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  FRAME PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Called every animation frame from the main loop.
   * Returns a comprehensive reading object.
   */
  processFrame() {
    if (!this.isInitialized) return null;
    this.frameCount++;

    // ── 1. Compute EMF magnitude ─────────────────────────────────────────────
    if (this.magnetometerAvailable) {
      this.magMagnitude = Math.sqrt(
        this.magX * this.magX +
        this.magY * this.magY +
        this.magZ * this.magZ
      );
    }

    // ── 2. Compute vibration magnitude ───────────────────────────────────────
    let vibMag = 0;
    if (this.accelerometerAvailable && this.accelBuffer.length > 0) {
      const recentCount = Math.min(30, this.accelBuffer.length);
      const recent = this.accelBuffer.slice(-recentCount);
      const sumSq = recent.reduce((acc, v) => acc + v * v, 0);
      vibMag = Math.sqrt(sumSq / recentCount);
      this.vibrationLevel = vibMag;
    }

    // ── 3. Update simulated barometer ────────────────────────────────────────
    if (this.pressureSimulated) {
      this._updateSimulatedPressure();
    }

    // ── 4. Baseline calibration (first 5 seconds / 150 frames) ──────────────
    if (!this.magBaselineEstablished || !this.vibrationBaselineEstablished || !this.pressureBaselineEstablished) {
      this._updateBaseline(this.magMagnitude, vibMag, this.pressure);
    }

    // ── 5. Perform DFT on accelerometer buffer ──────────────────────────────
    if (this.accelerometerAvailable &&
        this.accelBuffer.length >= this.accelBufferSize &&
        this.frameCount - this._lastDFTFrame >= this._dftInterval) {
      this._dftResult = this._computeAccelFFT(this.accelBuffer);
      this._lastDFTFrame = this.frameCount;
      this.dominantVibFreq = this._dftResult.dominantFreq;
    }

    // ── 6. Detect anomalies ──────────────────────────────────────────────────
    const emfAnomaly = this._detectEMFAnomaly();
    const vibAnomaly = this._detectVibrationAnomaly(vibMag);
    const pressureAnomaly = this._detectPressureAnomaly();
    const infrasoundResult = this._detectInfrasound();

    this.infrasoundDetected = infrasoundResult.infrasoundDetected;
    this.fearFreqAlert = infrasoundResult.fearFreqDetected;

    // ── 7. Update history arrays ─────────────────────────────────────────────
    this._pushHistory(this.emfHistory, {
      magnitude: this.magMagnitude,
      deviation: this.emfDeviation,
      anomaly: this.emfAnomaly,
      x: this.magX,
      y: this.magY,
      z: this.magZ
    });
    this._pushHistory(this.vibrationHistory, {
      magnitude: vibMag,
      dominantFreq: this.dominantVibFreq,
      infrasound: this.infrasoundDetected,
      fearFreq: this.fearFreqAlert
    });
    this._pushHistory(this.pressureHistory, {
      hPa: this.pressure,
      change: this.pressureBaselineEstablished ? Math.abs(this.pressure - this.pressureBaseline) : 0,
      anomaly: this.pressureAnomaly
    });

    // ── 8. Compute overall anomaly score ─────────────────────────────────────
    const anomalyScore = this._computeAnomalyScore();
    const overallAnomaly = anomalyScore >= 30;

    // ── 9. Determine EMF trend ───────────────────────────────────────────────
    const emfTrend = this._computeTrend(this.emfHistory, 'magnitude');

    // ── 10. Return frame reading ─────────────────────────────────────────────
    return {
      emf: {
        available: this.magnetometerAvailable,
        x: this.magX,
        y: this.magY,
        z: this.magZ,
        magnitude: this.magMagnitude,
        baseline: this.magBaseline,
        deviation: this.emfDeviation,
        anomaly: this.emfAnomaly,
        trend: emfTrend
      },
      vibration: {
        available: this.accelerometerAvailable,
        x: this.accelX,
        y: this.accelY,
        z: this.accelZ,
        magnitude: vibMag,
        dominantFreq: this.dominantVibFreq,
        infrasoundDetected: this.infrasoundDetected,
        fearFreqDetected: this.fearFreqAlert,
        anomaly: vibAnomaly
      },
      pressure: {
        available: this.barometerAvailable,
        hPa: this.pressure,
        baseline: this.pressureBaseline,
        change: this.pressureBaselineEstablished ? Math.abs(this.pressure - this.pressureBaseline) : 0,
        anomaly: this.pressureAnomaly,
        simulated: this.pressureSimulated
      },
      temperature: {
        available: this.temperatureAvailable,
        celsius: this.temperature
      },
      overallAnomaly: overallAnomaly,
      anomalyScore: anomalyScore
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  DFT / FREQUENCY ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Simple DFT on accelerometer magnitude history.
   * Focus on 0-30 Hz range. We only compute the bins we need rather than
   * a full FFT, keeping this lightweight for the main thread.
   *
   * @param {number[]} samples - vibration magnitude buffer
   * @returns {{dominantFreq, peakAmplitude, fearFreqAmplitude, infrasoundPeaks}}
   */
  _computeAccelFFT(samples) {
    const N = Math.min(samples.length, this.accelBufferSize);
    const data = samples.slice(-N);

    // DeviceMotionEvent typically fires at ~60 Hz
    const sampleRate = 60;

    // Remove DC offset (mean)
    let mean = 0;
    for (let i = 0; i < N; i++) mean += data[i];
    mean /= N;
    for (let i = 0; i < N; i++) data[i] -= mean;

    // Apply Hann window to reduce spectral leakage
    for (let i = 0; i < N; i++) {
      data[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    }

    // Frequency bin range for 0-30 Hz
    const minBin = Math.max(1, Math.floor(0.5 * N / sampleRate));
    const maxBin = Math.min(Math.ceil(30 * N / sampleRate), Math.floor(N / 2));

    // Bin index for Tandy's fear frequency (18.98 Hz)
    const fearBin = Math.round(18.98 * N / sampleRate);

    let peakAmplitude = 0;
    let dominantFreq = 0;
    let fearFreqAmplitude = 0;
    const infrasoundPeaks = [];

    // Precompute 2*PI/N
    const twoPiOverN = (2 * Math.PI) / N;

    for (let k = minBin; k <= maxBin; k++) {
      let realPart = 0;
      let imagPart = 0;

      for (let n = 0; n < N; n++) {
        const angle = twoPiOverN * k * n;
        realPart += data[n] * Math.cos(angle);
        imagPart -= data[n] * Math.sin(angle);
      }

      const amplitude = (2 * Math.sqrt(realPart * realPart + imagPart * imagPart)) / N;
      const freq = k * sampleRate / N;

      if (amplitude > peakAmplitude) {
        peakAmplitude = amplitude;
        dominantFreq = freq;
      }

      // Check fear frequency bin (allow +/- 1 bin)
      if (Math.abs(k - fearBin) <= 1) {
        if (amplitude > fearFreqAmplitude) {
          fearFreqAmplitude = amplitude;
        }
      }

      // Track infrasound peaks (below 20 Hz with meaningful amplitude)
      if (freq > 0.5 && freq < 20 && amplitude > 0.02) {
        infrasoundPeaks.push({ freq: freq, amplitude: amplitude });
      }
    }

    // Sort infrasound peaks by amplitude descending
    infrasoundPeaks.sort((a, b) => b.amplitude - a.amplitude);

    return {
      dominantFreq: dominantFreq,
      peakAmplitude: peakAmplitude,
      fearFreqAmplitude: fearFreqAmplitude,
      infrasoundPeaks: infrasoundPeaks.slice(0, 5)
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  BASELINE CALIBRATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * During the first 5 seconds, accumulate sensor readings to compute
   * a stable baseline. After calibration, baselines are locked.
   */
  _updateBaseline(emfMag, vibMag, pressure) {
    // ── Magnetometer baseline ────────────────────────────────────────────────
    if (!this.magBaselineEstablished && this.magnetometerAvailable && emfMag > 0) {
      this.magBaselineValues.push(emfMag);
      if (this.magBaselineValues.length >= this.magBaselineFrames) {
        const sum = this.magBaselineValues.reduce((a, b) => a + b, 0);
        this.magBaseline = sum / this.magBaselineValues.length;
        this.magBaselineEstablished = true;
      }
    }

    // ── Vibration baseline ───────────────────────────────────────────────────
    if (!this.vibrationBaselineEstablished && this.accelerometerAvailable && vibMag >= 0) {
      this.vibrationBaselineValues.push(vibMag);
      if (this.vibrationBaselineValues.length >= this.magBaselineFrames) {
        const sum = this.vibrationBaselineValues.reduce((a, b) => a + b, 0);
        this.vibrationBaseline = sum / this.vibrationBaselineValues.length;
        this.vibrationBaselineEstablished = true;
      }
    }

    // ── Pressure baseline ────────────────────────────────────────────────────
    if (!this.pressureBaselineEstablished && pressure > 0) {
      this.pressureBaselineValues.push(pressure);
      if (this.pressureBaselineValues.length >= this.magBaselineFrames) {
        const sum = this.pressureBaselineValues.reduce((a, b) => a + b, 0);
        this.pressureBaseline = sum / this.pressureBaselineValues.length;
        this.pressureBaselineEstablished = true;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  ANOMALY DETECTION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Detect EMF anomaly: deviation > 5 uT from baseline.
   */
  _detectEMFAnomaly() {
    if (!this.magnetometerAvailable || !this.magBaselineEstablished) {
      this.emfDeviation = 0;
      this.emfAnomaly = false;
      return false;
    }

    this.emfDeviation = Math.abs(this.magMagnitude - this.magBaseline);
    const prevAnomaly = this.emfAnomaly;
    this.emfAnomaly = this.emfDeviation > this.emfThreshold;

    // Track peak deviation
    if (this.emfDeviation > this.magPeakDeviation) {
      this.magPeakDeviation = this.emfDeviation;
    }

    // Log anomaly event on rising edge
    if (this.emfAnomaly && !prevAnomaly) {
      this.magAnomalyCount++;
      const timeSeconds = (performance.now() - this.startTime) / 1000;
      this.magAnomalyTimestamps.push({
        time: timeSeconds,
        magnitude: this.magMagnitude,
        deviation: this.emfDeviation
      });
      if (this.events.length < this.maxEvents) {
        this.events.push({
          type: 'emf',
          frame: this.frameCount,
          timeSeconds: timeSeconds,
          magnitude: this.magMagnitude,
          deviation: this.emfDeviation,
          baseline: this.magBaseline
        });
      }
    }

    return this.emfAnomaly;
  }

  /**
   * Detect vibration anomaly: sudden spike > 3x average.
   */
  _detectVibrationAnomaly(vibMag) {
    if (!this.accelerometerAvailable || !this.vibrationBaselineEstablished) {
      return false;
    }

    const threshold = Math.max(0.1, this.vibrationBaseline * 3);
    const isAnomaly = vibMag > threshold;

    if (isAnomaly) {
      this.vibrationAnomalyCount++;
      if (this.events.length < this.maxEvents) {
        const lastVibEvent = this._findLastEvent('vibration');
        const timeSeconds = (performance.now() - this.startTime) / 1000;
        // Debounce: only log if last vibration event was > 1 second ago
        if (!lastVibEvent || timeSeconds - lastVibEvent.timeSeconds > 1) {
          this.events.push({
            type: 'vibration',
            frame: this.frameCount,
            timeSeconds: timeSeconds,
            magnitude: vibMag,
            baseline: this.vibrationBaseline,
            ratio: vibMag / Math.max(0.001, this.vibrationBaseline)
          });
        }
      }
    }

    return isAnomaly;
  }

  /**
   * Detect pressure anomaly: change > 2 hPa from baseline within recent window.
   */
  _detectPressureAnomaly() {
    if (!this.pressureBaselineEstablished) {
      this.pressureAnomaly = false;
      return false;
    }

    const change = Math.abs(this.pressure - this.pressureBaseline);
    const prevAnomaly = this.pressureAnomaly;
    this.pressureAnomaly = change > this.pressureThreshold;

    // Track max change
    if (change > this.pressureMaxChange) {
      this.pressureMaxChange = change;
    }

    // Log anomaly on rising edge
    if (this.pressureAnomaly && !prevAnomaly) {
      this.pressureAnomalyCount++;
      if (this.events.length < this.maxEvents) {
        this.events.push({
          type: 'pressure',
          frame: this.frameCount,
          timeSeconds: (performance.now() - this.startTime) / 1000,
          pressure: this.pressure,
          baseline: this.pressureBaseline,
          change: change,
          simulated: this.pressureSimulated
        });
      }
    }

    return this.pressureAnomaly;
  }

  /**
   * Detect infrasound and Tandy fear frequency from DFT results.
   */
  _detectInfrasound() {
    const result = {
      infrasoundDetected: false,
      fearFreqDetected: false
    };

    if (!this.accelerometerAvailable || this.accelBuffer.length < this.accelBufferSize) {
      return result;
    }

    const dft = this._dftResult;
    const noiseFloor = 0.03;

    // General infrasound: dominant frequency below 20 Hz with amplitude above noise
    result.infrasoundDetected = dft.dominantFreq > 0.5 &&
                                dft.dominantFreq < 20 &&
                                dft.peakAmplitude > noiseFloor;

    // Tandy fear frequency: 18.98 Hz (+/- 1 Hz) above noise floor
    const prevFearAlert = this.fearFreqAlert;
    result.fearFreqDetected = dft.fearFreqAmplitude > noiseFloor &&
                              Math.abs(dft.dominantFreq - 18.98) < 1.5;

    // Log fear frequency event on rising edge
    if (result.fearFreqDetected && !prevFearAlert) {
      this.fearFreqDetectionCount++;
      if (this.events.length < this.maxEvents) {
        this.events.push({
          type: 'infrasound',
          frame: this.frameCount,
          timeSeconds: (performance.now() - this.startTime) / 1000,
          frequency: dft.dominantFreq,
          magnitude: dft.fearFreqAmplitude,
          note: 'Near Tandy fear frequency (18.98Hz)'
        });
      }
    }

    // Log general infrasound events (debounced to once per 3 seconds)
    if (result.infrasoundDetected && !result.fearFreqDetected) {
      const lastInfra = this._findLastEvent('infrasound');
      const timeSeconds = (performance.now() - this.startTime) / 1000;
      if (!lastInfra || timeSeconds - lastInfra.timeSeconds > 3) {
        this.infrasoundEventCount++;
        if (this.events.length < this.maxEvents) {
          this.events.push({
            type: 'infrasound',
            frame: this.frameCount,
            timeSeconds: timeSeconds,
            frequency: dft.dominantFreq,
            magnitude: dft.peakAmplitude,
            note: 'Infrasound detected (<20Hz)'
          });
        }
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  SIMULATED BAROMETER (Perlin-like smooth random walk)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Smoothly vary the simulated pressure using layered sine waves
   * with slow random walk drift. No abrupt jumps.
   */
  _updateSimulatedPressure() {
    const dt = 1 / 30;  // assume ~30 fps

    // Advance phase
    this._simPhase += dt * 0.1;

    // Layered smooth oscillation (approximates Perlin noise behavior)
    const wave1 = Math.sin(this._simPhase * 0.7) * 0.15;
    const wave2 = Math.sin(this._simPhase * 1.3 + 2.1) * 0.08;
    const wave3 = Math.sin(this._simPhase * 3.7 + 4.5) * 0.03;

    // Random walk with damping (mean-reverting toward 1013.25)
    const meanRevert = (1013.25 - this._simPressure) * 0.001;
    const noise = (Math.random() - 0.5) * 0.02;
    this._simVelocity = this._simVelocity * 0.98 + meanRevert + noise;

    // Clamp velocity to prevent runaway
    this._simVelocity = Math.max(-0.05, Math.min(0.05, this._simVelocity));

    this._simPressure += this._simVelocity + wave1 + wave2 + wave3;

    // Hard clamp to reasonable range
    this._simPressure = Math.max(990, Math.min(1040, this._simPressure));

    this.pressure = this._simPressure;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  UTILITY HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Push a reading into a history array, capping at historyMaxLength.
   */
  _pushHistory(arr, entry) {
    arr.push(entry);
    if (arr.length > this.historyMaxLength) {
      arr.shift();
    }
  }

  /**
   * Find the most recent event of a given type.
   */
  _findLastEvent(type) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === type) return this.events[i];
    }
    return null;
  }

  /**
   * Compute a 0-100 anomaly score from all active sensor anomalies.
   */
  _computeAnomalyScore() {
    let score = 0;

    // EMF contribution (0-40 points)
    if (this.emfAnomaly && this.magnetometerAvailable) {
      score += Math.min(40, this.emfDeviation * 4);
    }

    // Vibration / infrasound contribution (0-35 points)
    if (this.infrasoundDetected) score += 10;
    if (this.fearFreqAlert) score += 25;
    else if (this.vibrationLevel > (this.vibrationBaseline * 3)) {
      score += Math.min(15, this.vibrationLevel * 10);
    }

    // Pressure contribution (0-15 points)
    if (this.pressureAnomaly && !this.pressureSimulated) {
      const change = Math.abs(this.pressure - this.pressureBaseline);
      score += Math.min(15, change * 5);
    }

    // Temperature contribution (0-10 points)
    if (this.temperatureAvailable && this.temperature !== null) {
      // Sudden temperature drops can add to score
      // (temperature baseline not tracked in detail here, so minor contribution)
      score += 0;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Compute trend direction from recent history for a given property.
   * Returns 'stable', 'rising', or 'falling'.
   */
  _computeTrend(history, property) {
    if (history.length < 30) return 'stable';

    const recent = history.slice(-30);
    const firstHalf = recent.slice(0, 15);
    const secondHalf = recent.slice(15);

    const avg = (arr) => {
      let sum = 0;
      for (let i = 0; i < arr.length; i++) sum += (arr[i][property] || 0);
      return sum / arr.length;
    };

    const avgFirst = avg(firstHalf);
    const avgSecond = avg(secondHalf);
    const diff = avgSecond - avgFirst;

    // Threshold for meaningful change (relative to magnitude)
    const threshold = Math.max(0.5, avgFirst * 0.05);

    if (diff > threshold) return 'rising';
    if (diff < -threshold) return 'falling';
    return 'stable';
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  PUBLIC API: STATE ACCESSORS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get full sensor state. Used by dowsing rods and sensor UI.
   * Maintains backward compatibility with existing app.js consumption.
   */
  getSensorState() {
    return {
      magnetometer: {
        available: this.magnetometerAvailable,
        source: this.magSource,
        x: this.magX,
        y: this.magY,
        z: this.magZ,
        magnitude: this.magMagnitude,
        baseline: this.magBaseline,
        baselineEstablished: this.magBaselineEstablished,
        anomaly: this.emfAnomaly,
        deviation: this.emfDeviation
      },
      accelerometer: {
        available: this.accelerometerAvailable,
        source: this.accelSource,
        x: this.accelX,
        y: this.accelY,
        z: this.accelZ,
        vibrationLevel: this.vibrationLevel,
        dominantFreq: this.dominantVibFreq,
        infrasoundDetected: this.infrasoundDetected,
        fearFreqAlert: this.fearFreqAlert
      },
      barometer: {
        available: this.barometerAvailable,
        pressure: this.pressure,
        baseline: this.pressureBaseline,
        anomaly: this.pressureAnomaly,
        simulated: this.pressureSimulated
      },
      gyroscope: {
        available: this.gyroscopeAvailable,
        alpha: this.gyroAlpha,
        beta: this.gyroBeta,
        gamma: this.gyroGamma
      },
      temperature: {
        available: this.temperatureAvailable,
        celsius: this.temperature
      }
    };
  }

  /**
   * Get EMF anomaly state. Used by geiger counter, entity radar, PAI, indicators.
   */
  getEMFAnomaly() {
    return {
      isAnomaly: this.emfAnomaly,
      deviationMicroTesla: this.emfDeviation,
      baselineMagnitude: this.magBaseline,
      currentMagnitude: this.magMagnitude
    };
  }

  /**
   * Get vibration/infrasound analysis. Used by geiger counter, entity radar, PAI.
   */
  getVibrationAnalysis() {
    return {
      dominantFreqHz: this.dominantVibFreq,
      infrasoundDetected: this.infrasoundDetected,
      fearFreqAlert: this.fearFreqAlert,
      vibrationLevel: this.vibrationLevel
    };
  }

  /**
   * Return last N readings for a sensor. Useful for trend visualization.
   * @param {'emf'|'vibration'|'pressure'} sensor
   * @param {number} count
   */
  getHistory(sensor, count) {
    let source;
    switch (sensor) {
      case 'emf':
        source = this.emfHistory;
        break;
      case 'vibration':
        source = this.vibrationHistory;
        break;
      case 'pressure':
        source = this.pressureHistory;
        break;
      default:
        return [];
    }
    if (!count || count >= source.length) return source.slice();
    return source.slice(-count);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  FULL ANALYSIS (for evidence reports)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Return comprehensive analysis for the evidence report system.
   */
  fullAnalysis() {
    const durationSeconds = (performance.now() - this.startTime) / 1000;

    // Compute average EMF magnitude from history
    let avgMagnitude = 0;
    if (this.emfHistory.length > 0) {
      let sum = 0;
      for (let i = 0; i < this.emfHistory.length; i++) {
        sum += this.emfHistory[i].magnitude;
      }
      avgMagnitude = sum / this.emfHistory.length;
    }

    // Compute most common dominant vibration frequency
    let freqAccum = {};
    for (let i = 0; i < this.vibrationHistory.length; i++) {
      const f = Math.round(this.vibrationHistory[i].dominantFreq * 10) / 10;
      if (f > 0) freqAccum[f] = (freqAccum[f] || 0) + 1;
    }
    let avgDominantFreq = 0;
    let maxCount = 0;
    for (const freq in freqAccum) {
      if (freqAccum[freq] > maxCount) {
        maxCount = freqAccum[freq];
        avgDominantFreq = parseFloat(freq);
      }
    }

    return {
      duration: durationSeconds,
      magnetometer: {
        available: this.magnetometerAvailable,
        source: this.magSource,
        baseline: this.magBaseline,
        baselineMagnitude: this.magBaseline,
        peakDeviation: this.magPeakDeviation,
        anomalyCount: this.magAnomalyCount,
        anomalyTimestamps: this.magAnomalyTimestamps.slice(),
        averageMagnitude: avgMagnitude
      },
      accelerometer: {
        available: this.accelerometerAvailable,
        source: this.accelSource
      },
      vibration: {
        available: this.accelerometerAvailable,
        infrasoundEvents: this.infrasoundEventCount,
        fearFreqDetections: this.fearFreqDetectionCount,
        anomalyCount: this.vibrationAnomalyCount,
        dominantFrequency: avgDominantFreq
      },
      pressure: {
        available: this.barometerAvailable,
        simulated: this.pressureSimulated,
        baseline: this.pressureBaseline,
        maxChange: this.pressureMaxChange,
        anomalyCount: this.pressureAnomalyCount
      },
      barometer: {
        available: this.barometerAvailable,
        lastPressure: this.pressure
      },
      overallAnomalyScore: this._computeAnomalyScore(),
      events: this.events.slice(),
      totalEvents: this.events.length,
      totalFrames: this.frameCount,
      scientificNotes: [
        'Vic Tandy (1998): 18.98Hz infrasound can cause anxiety, visual disturbances, and feelings of unease.',
        'Earth\'s magnetic field ranges 25-65 uT. Deviations may indicate metallic objects, electrical interference, or geological anomalies.',
        'Barometric pressure changes can affect human perception, mood, and susceptibility to suggestion.',
        'Infrasound below 20Hz is inaudible but can cause physiological effects including vibration of the eyeball (Tandy & Lawrence, JISPR 1998).',
        'The human body can resonate at frequencies between 4-8Hz, which may produce feelings of discomfort or dread.'
      ]
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  PERMISSIONS (for iOS user-gesture requirement)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Explicitly request sensor permissions. MUST be called from a user gesture
   * (button click / tap) on iOS 13+.
   *
   * Returns { orientation: 'granted'|'denied'|'unavailable',
   *           motion: 'granted'|'denied'|'unavailable' }
   */
  async requestPermissions() {
    const results = {
      orientation: 'unavailable',
      motion: 'unavailable'
    };

    // ── DeviceOrientationEvent permission ────────────────────────────────────
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        results.orientation = perm;
        if (perm === 'granted' && !this.magnetometerAvailable) {
          // Re-attempt magnetometer init with orientation
          await this._initMagnetometerOrientation();
        }
      } catch (e) {
        results.orientation = 'denied';
      }
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      results.orientation = 'granted';  // no permission needed on this platform
    }

    // ── DeviceMotionEvent permission ─────────────────────────────────────────
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        results.motion = perm;
        if (perm === 'granted' && !this.accelerometerAvailable) {
          // Re-attempt accelerometer init
          await this._initAccelerometerMotion();
        }
      } catch (e) {
        results.motion = 'denied';
      }
    } else if (typeof DeviceMotionEvent !== 'undefined') {
      results.motion = 'granted';
    }

    return results;
  }

  /**
   * Internal: attach DeviceOrientation listener after permission is granted.
   * Called by requestPermissions() when the initial init could not get permission.
   */
  async _initMagnetometerOrientation() {
    if (this._orientationHandler) return;

    this._orientationHandler = (e) => {
      if (e.alpha !== null || e.beta !== null || e.gamma !== null) {
        const alpha = e.alpha || 0;
        const beta = e.beta || 0;
        const gamma = e.gamma || 0;

        const alphaRad = (alpha * Math.PI) / 180;
        const betaRad = (beta * Math.PI) / 180;
        const gammaRad = (gamma * Math.PI) / 180;

        const baseField = 48;
        this.magX = baseField * Math.sin(alphaRad) * Math.cos(gammaRad);
        this.magY = baseField * Math.cos(alphaRad) * Math.cos(betaRad);
        this.magZ = baseField * Math.sin(betaRad);

        this.magnetometerAvailable = true;
        this.magSource = 'orientation';
      }
    };
    window.addEventListener('deviceorientation', this._orientationHandler);

    await new Promise(resolve => setTimeout(resolve, 600));
    if (!this.magnetometerAvailable) {
      window.removeEventListener('deviceorientation', this._orientationHandler);
      this._orientationHandler = null;
    }
  }

  /**
   * Internal: attach DeviceMotion listener after permission is granted.
   * Called by requestPermissions() when the initial init could not get permission.
   */
  async _initAccelerometerMotion() {
    if (this._motionHandler) return;

    this._motionHandler = (e) => {
      const accel = e.accelerationIncludingGravity || e.acceleration;
      if (accel) {
        this.accelX = accel.x || 0;
        this.accelY = accel.y || 0;
        this.accelZ = accel.z || 0;
        this.accelerometerAvailable = true;
        this.accelSource = 'motion';

        const rawMag = Math.sqrt(
          this.accelX * this.accelX +
          this.accelY * this.accelY +
          this.accelZ * this.accelZ
        );
        const vibSample = Math.abs(rawMag - 9.81);
        this.accelBuffer.push(vibSample);
        if (this.accelBuffer.length > this.accelBufferSize) {
          this.accelBuffer.shift();
        }
      }

      const rot = e.rotationRate;
      if (rot && (rot.alpha !== null || rot.beta !== null || rot.gamma !== null)) {
        this.gyroAlpha = rot.alpha || 0;
        this.gyroBeta = rot.beta || 0;
        this.gyroGamma = rot.gamma || 0;
        this.gyroscopeAvailable = true;
      }
    };
    window.addEventListener('devicemotion', this._motionHandler);

    await new Promise(resolve => setTimeout(resolve, 600));
    if (!this.accelerometerAvailable) {
      window.removeEventListener('devicemotion', this._motionHandler);
      this._motionHandler = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  //  RESET / CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Clear all accumulated data and reset baselines. Sensors stay connected.
   * Used when restarting a scan without full destroy/reinit.
   */
  clearAll() {
    // Magnetometer
    this.magBaselineValues = [];
    this.magBaselineEstablished = false;
    this.magBaseline = 0;
    this.emfAnomaly = false;
    this.emfDeviation = 0;
    this.magPeakDeviation = 0;
    this.magAnomalyCount = 0;
    this.magAnomalyTimestamps = [];

    // Accelerometer / vibration
    this.accelBuffer = [];
    this.vibrationLevel = 0;
    this.vibrationBaseline = 0;
    this.vibrationBaselineValues = [];
    this.vibrationBaselineEstablished = false;
    this.infrasoundDetected = false;
    this.fearFreqAlert = false;
    this.dominantVibFreq = 0;
    this.vibrationAnomalyCount = 0;
    this.infrasoundEventCount = 0;
    this.fearFreqDetectionCount = 0;

    // Barometer / pressure
    this.pressureBaselineValues = [];
    this.pressureBaselineEstablished = false;
    this.pressureBaseline = 0;
    this.pressureAnomaly = false;
    this.pressureAnomalyCount = 0;
    this.pressureMaxChange = 0;

    // Simulated barometer reset
    this._simPressure = 1013.25 + (Math.random() - 0.5) * 2;
    this._simVelocity = 0;
    this._simPhase = Math.random() * Math.PI * 2;

    // History
    this.emfHistory = [];
    this.vibrationHistory = [];
    this.pressureHistory = [];

    // Events
    this.events = [];

    // Timing
    this.frameCount = 0;
    this.startTime = performance.now();

    // DFT cache
    this._dftResult = {
      dominantFreq: 0,
      peakAmplitude: 0,
      fearFreqAmplitude: 0,
      infrasoundPeaks: []
    };
    this._lastDFTFrame = 0;
  }

  /**
   * Stop all sensors, remove event listeners, clear history.
   * Full teardown -- call init() again to restart.
   */
  destroy() {
    // Stop Generic Sensor API magnetometer
    if (this._magnetometer) {
      try { this._magnetometer.stop(); } catch (_e) { /* ignore */ }
      this._magnetometer = null;
    }

    // Stop Generic Sensor API barometer
    if (this._barometer) {
      try { this._barometer.stop(); } catch (_e) { /* ignore */ }
      this._barometer = null;
    }

    // Stop AmbientLightSensor
    if (this._ambientLight) {
      try { this._ambientLight.stop(); } catch (_e) { /* ignore */ }
      this._ambientLight = null;
    }

    // Remove DeviceOrientation listener
    if (this._orientationHandler) {
      window.removeEventListener('deviceorientation', this._orientationHandler);
      this._orientationHandler = null;
    }

    // Remove DeviceMotion listener
    if (this._motionHandler) {
      window.removeEventListener('devicemotion', this._motionHandler);
      this._motionHandler = null;
    }

    // Reset availability
    this.magnetometerAvailable = false;
    this.accelerometerAvailable = false;
    this.barometerAvailable = false;
    this.gyroscopeAvailable = false;
    this.temperatureAvailable = false;
    this.magSource = 'none';
    this.accelSource = 'none';
    this.barometerSource = 'none';

    // Clear all data
    this.clearAll();

    this.isInitialized = false;
  }
}

window.EMFSensorEngine = EMFSensorEngine;
