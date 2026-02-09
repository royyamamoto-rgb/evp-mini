/**
 * EMFSensorEngine — Magnetometer, accelerometer, barometer access with fallbacks
 * Provides EMF anomaly detection, vibration/infrasound monitoring, pressure tracking
 */
class EMFSensorEngine {
  constructor() {
    // Sensor availability
    this.magnetometerAvailable = false;
    this.accelerometerAvailable = false;
    this.barometerAvailable = false;
    this.isInitialized = false;

    // Magnetometer state
    this.magX = 0;
    this.magY = 0;
    this.magZ = 0;
    this.magMagnitude = 0;
    this.magBaseline = 0;
    this.magBaselineValues = [];
    this.magBaselineFrames = 150; // ~5 seconds at 30fps
    this.magBaselineEstablished = false;
    this.emfAnomaly = false;
    this.emfDeviation = 0;
    this.emfThreshold = 5; // microTesla deviation
    this.magSource = 'none'; // 'api', 'orientation', 'none'

    // Accelerometer state
    this.accelX = 0;
    this.accelY = 0;
    this.accelZ = 0;
    this.vibrationLevel = 0;
    this.accelBuffer = []; // For FFT
    this.accelBufferSize = 256; // Power of 2 for FFT
    this.infrasoundDetected = false;
    this.fearFreqAlert = false; // 18.98Hz Tandy frequency
    this.dominantVibFreq = 0;
    this.accelSource = 'none'; // 'api', 'motion', 'none'

    // Gyroscope state
    this.gyroAlpha = 0;
    this.gyroBeta = 0;
    this.gyroGamma = 0;
    this.gyroscopeAvailable = false;

    // Barometer state
    this.pressure = 0;
    this.pressureBaseline = 0;
    this.pressureAnomaly = false;
    this.pressureBaselineValues = [];

    // Timeline
    this.events = [];
    this.maxEvents = 200;
    this.frameCount = 0;

    // Sensor objects
    this._magnetometer = null;
    this._orientationHandler = null;
    this._motionHandler = null;
  }

  async init() {
    // Try magnetometer
    await this._initMagnetometer();

    // Try accelerometer
    await this._initAccelerometer();

    // Try barometer
    await this._initBarometer();

    this.isInitialized = true;

    return {
      magnetometer: this.magnetometerAvailable,
      accelerometer: this.accelerometerAvailable,
      barometer: this.barometerAvailable,
      magSource: this.magSource,
      accelSource: this.accelSource
    };
  }

  async _initMagnetometer() {
    // Try Magnetometer API first (Chrome on Android)
    if ('Magnetometer' in window) {
      try {
        const permission = await navigator.permissions.query({ name: 'magnetometer' });
        if (permission.state !== 'denied') {
          this._magnetometer = new Magnetometer({ frequency: 30 });
          this._magnetometer.addEventListener('reading', () => {
            this.magX = this._magnetometer.x || 0;
            this.magY = this._magnetometer.y || 0;
            this.magZ = this._magnetometer.z || 0;
          });
          this._magnetometer.start();
          this.magnetometerAvailable = true;
          this.magSource = 'api';
          return;
        }
      } catch (e) {
        // Fall through to fallback
      }
    }

    // Fallback: DeviceOrientationEvent (provides compass heading, not raw mag)
    try {
      // iOS requires permission request
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') return;
      }

      this._orientationHandler = (e) => {
        if (e.alpha !== null) {
          // We only get heading angle, simulate magnitude from heading changes
          // This is a rough approximation — real magnetometer data not available on iOS web
          const alpha = e.alpha || 0;
          const beta = e.beta || 0;
          const gamma = e.gamma || 0;
          // Use angular rates as proxy for magnetic field variation
          this.magX = gamma;
          this.magY = beta;
          this.magZ = alpha / 10; // Scale down
          this.magnetometerAvailable = true;
          this.magSource = 'orientation';
        }
      };
      window.addEventListener('deviceorientation', this._orientationHandler);

      // Check if we actually get readings after a short delay
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!this.magnetometerAvailable) {
        window.removeEventListener('deviceorientation', this._orientationHandler);
        this._orientationHandler = null;
      }
    } catch (e) {
      // Magnetometer unavailable
    }
  }

  async _initAccelerometer() {
    try {
      // iOS requires permission
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') return;
      }

      this._motionHandler = (e) => {
        const accel = e.accelerationIncludingGravity || e.acceleration;
        if (accel) {
          this.accelX = accel.x || 0;
          this.accelY = accel.y || 0;
          this.accelZ = accel.z || 0;
          this.accelerometerAvailable = true;
          this.accelSource = 'motion';

          // Buffer for FFT
          const magnitude = Math.sqrt(this.accelX ** 2 + this.accelY ** 2 + this.accelZ ** 2);
          // Remove gravity (~9.81)
          const vibration = Math.abs(magnitude - 9.81);
          this.accelBuffer.push(vibration);
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

      // Check if we get readings
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!this.accelerometerAvailable) {
        window.removeEventListener('devicemotion', this._motionHandler);
        this._motionHandler = null;
      }
    } catch (e) {
      // Accelerometer unavailable
    }
  }

  async _initBarometer() {
    // Barometer API is extremely limited in browsers
    if ('Barometer' in window) {
      try {
        const baro = new Barometer({ frequency: 1 });
        baro.addEventListener('reading', () => {
          this.pressure = baro.pressure || 0;
          this.barometerAvailable = true;
        });
        baro.start();
      } catch (e) {
        // Barometer unavailable
      }
    }
    // No good fallback for barometer in web browsers
  }

  processFrame() {
    if (!this.isInitialized) return;
    this.frameCount++;

    // Update magnetometer
    if (this.magnetometerAvailable) {
      this.magMagnitude = Math.sqrt(this.magX ** 2 + this.magY ** 2 + this.magZ ** 2);
      this._processMagBaseline();
    }

    // Update accelerometer
    if (this.accelerometerAvailable) {
      this._processVibration();
    }

    // Update barometer
    if (this.barometerAvailable) {
      this._processPressure();
    }
  }

  _processMagBaseline() {
    if (!this.magBaselineEstablished) {
      this.magBaselineValues.push(this.magMagnitude);
      if (this.magBaselineValues.length >= this.magBaselineFrames) {
        this.magBaseline = this.magBaselineValues.reduce((a, b) => a + b, 0) / this.magBaselineValues.length;
        this.magBaselineEstablished = true;
      }
      return;
    }

    // Detect EMF anomaly
    this.emfDeviation = Math.abs(this.magMagnitude - this.magBaseline);
    const prevAnomaly = this.emfAnomaly;
    this.emfAnomaly = this.emfDeviation > this.emfThreshold;

    if (this.emfAnomaly && !prevAnomaly && this.events.length < this.maxEvents) {
      this.events.push({
        type: 'emf',
        frame: this.frameCount,
        timeSeconds: this.frameCount / 30,
        magnitude: this.magMagnitude,
        deviation: this.emfDeviation,
        baseline: this.magBaseline
      });
    }
  }

  _processVibration() {
    if (this.accelBuffer.length < 32) return;

    // Compute current vibration level (RMS of recent values)
    const recent = this.accelBuffer.slice(-30);
    this.vibrationLevel = Math.sqrt(recent.reduce((a, b) => a + b * b, 0) / recent.length);

    // Simple FFT to find dominant frequency
    if (this.accelBuffer.length >= this.accelBufferSize) {
      this._analyzeVibrationFrequency();
    }
  }

  _analyzeVibrationFrequency() {
    // Simplified DFT on accelerometer buffer for infrasound range (1-30Hz)
    const data = this.accelBuffer.slice(-this.accelBufferSize);
    const N = data.length;
    const sampleRate = 60; // DeviceMotion typically fires at ~60Hz

    let maxMagnitude = 0;
    let maxFreq = 0;

    // Only check 1-30Hz range
    const minBin = Math.floor(1 * N / sampleRate);
    const maxBin = Math.ceil(30 * N / sampleRate);

    for (let k = minBin; k <= Math.min(maxBin, N / 2); k++) {
      let realPart = 0;
      let imagPart = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * k * n) / N;
        realPart += data[n] * Math.cos(angle);
        imagPart -= data[n] * Math.sin(angle);
      }
      const magnitude = Math.sqrt(realPart * realPart + imagPart * imagPart) / N;
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
        maxFreq = k * sampleRate / N;
      }
    }

    this.dominantVibFreq = maxFreq;

    // Infrasound detection (below 20Hz)
    this.infrasoundDetected = maxFreq > 0 && maxFreq < 20 && maxMagnitude > 0.05;

    // Tandy's fear frequency: 18.98Hz (within ±1Hz)
    const prevFearAlert = this.fearFreqAlert;
    this.fearFreqAlert = Math.abs(maxFreq - 18.98) < 1 && maxMagnitude > 0.03;

    if (this.fearFreqAlert && !prevFearAlert && this.events.length < this.maxEvents) {
      this.events.push({
        type: 'infrasound',
        frame: this.frameCount,
        timeSeconds: this.frameCount / 30,
        frequency: maxFreq,
        magnitude: maxMagnitude,
        note: 'Near Tandy fear frequency (18.98Hz)'
      });
    }

    if (this.infrasoundDetected && !this.fearFreqAlert && this.events.length < this.maxEvents) {
      const lastEvent = this.events[this.events.length - 1];
      if (!lastEvent || lastEvent.type !== 'infrasound' || this.frameCount - lastEvent.frame > 90) {
        this.events.push({
          type: 'infrasound',
          frame: this.frameCount,
          timeSeconds: this.frameCount / 30,
          frequency: maxFreq,
          magnitude: maxMagnitude,
          note: 'Infrasound detected (<20Hz)'
        });
      }
    }
  }

  _processPressure() {
    if (this.pressure === 0) return;

    this.pressureBaselineValues.push(this.pressure);
    if (this.pressureBaselineValues.length > 300) {
      this.pressureBaselineValues.shift();
    }

    if (this.pressureBaselineValues.length >= 30) {
      const recent = this.pressureBaselineValues.slice(-30);
      this.pressureBaseline = recent.reduce((a, b) => a + b, 0) / recent.length;
      const deviation = Math.abs(this.pressure - this.pressureBaseline);
      this.pressureAnomaly = deviation > 0.5; // hPa
    }
  }

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
        anomaly: this.pressureAnomaly
      },
      gyroscope: {
        available: this.gyroscopeAvailable,
        alpha: this.gyroAlpha,
        beta: this.gyroBeta,
        gamma: this.gyroGamma
      }
    };
  }

  getEMFAnomaly() {
    return {
      isAnomaly: this.emfAnomaly,
      deviationMicroTesla: this.emfDeviation,
      baselineMagnitude: this.magBaseline,
      currentMagnitude: this.magMagnitude
    };
  }

  getVibrationAnalysis() {
    return {
      dominantFreqHz: this.dominantVibFreq,
      infrasoundDetected: this.infrasoundDetected,
      fearFreqAlert: this.fearFreqAlert,
      vibrationLevel: this.vibrationLevel
    };
  }

  fullAnalysis() {
    return {
      magnetometer: {
        available: this.magnetometerAvailable,
        source: this.magSource,
        baselineMagnitude: this.magBaseline
      },
      accelerometer: {
        available: this.accelerometerAvailable,
        source: this.accelSource
      },
      barometer: {
        available: this.barometerAvailable,
        lastPressure: this.pressure
      },
      events: [...this.events],
      totalEvents: this.events.length,
      totalFrames: this.frameCount
    };
  }

  clearAll() {
    this.magBaselineValues = [];
    this.magBaselineEstablished = false;
    this.magBaseline = 0;
    this.emfAnomaly = false;
    this.emfDeviation = 0;
    this.accelBuffer = [];
    this.vibrationLevel = 0;
    this.infrasoundDetected = false;
    this.fearFreqAlert = false;
    this.dominantVibFreq = 0;
    this.pressureBaselineValues = [];
    this.pressureAnomaly = false;
    this.events = [];
    this.frameCount = 0;
  }

  destroy() {
    if (this._magnetometer) {
      try { this._magnetometer.stop(); } catch (e) { /* ignore */ }
    }
    if (this._orientationHandler) {
      window.removeEventListener('deviceorientation', this._orientationHandler);
    }
    if (this._motionHandler) {
      window.removeEventListener('devicemotion', this._motionHandler);
    }
    this.isInitialized = false;
  }
}

window.EMFSensorEngine = EMFSensorEngine;
