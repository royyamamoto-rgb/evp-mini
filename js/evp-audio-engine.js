/**
 * EVPAudioEngine — Core audio analysis engine for EVP-MINI paranormal investigation PWA
 * Real-time FFT analysis, noise floor calibration, formant detection, HNR, anomaly detection
 * Uses Web Audio API with AnalyserNode (fftSize 8192, ~5.9Hz/bin at 48kHz)
 */
class EVPAudioEngine {
  constructor() {
    // Web Audio API nodes
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.gainNode = null;

    // FFT configuration
    this.fftSize = 8192;
    this.binCount = this.fftSize / 2; // 4096 bins
    this.sampleRate = 48000;
    this.binResolution = 0; // Hz per bin, computed after init

    // Data buffers (allocated after init)
    this.frequencyData = null;   // Uint8Array for FFT byte data (0-255)
    this.frequencyFloat = null;  // Float32Array for FFT dB data
    this.timeDomainData = null;  // Float32Array for waveform

    // Noise floor baseline calibration
    this.baselineFrames = 0;
    this.baselineTarget = 90;        // ~3 seconds at 30fps
    this.baselineReady = false;
    this.baselineEstablished = false; // alias for backward compat
    this.baselineMean = null;         // Float64Array per-bin mean (linear mag)
    this.baselineStdDev = null;       // Float64Array per-bin standard deviation
    this.baselineRMS = 0;             // average RMS during calibration
    this._baselineBinSums = null;
    this._baselineBinSqSums = null;
    this._baselineRMSValues = [];

    // Running statistics accumulators
    this.frameCount = 0;
    this.totalRmsSum = 0;
    this.totalRmsSqMax = -Infinity;
    this.totalHnrSum = 0;
    this.totalHnrMax = -Infinity;
    this.totalCentroidSum = 0;
    this.totalFormantDetections = 0;
    this.totalVoiceFrames = 0;

    // Current frame state
    this.currentRMS = 0;
    this.currentRmsDb = -100;
    this.currentSpectralCentroid = 0;
    this.currentHNR = 0;
    this.peakFrequency = 0;
    this.isAnomaly = false;
    this.anomalyStrength = 0;
    this.anomalyBins = [];
    this.currentSNR = 0;
    this.currentVoiceRangeEnergy = 0;

    // Formant detection state
    this.formants = { f1: 0, f2: 0, f3: 0, hasVoicePattern: false, clarity: 0 };
    this._formantList = []; // [{freq, amplitude}, ...]

    // Anomaly history
    this.anomalyEvents = [];
    this.maxAnomalyEvents = 500;

    // Voice range bin indices (populated after init)
    this.voiceRangeLow = 0;
    this.voiceRangeHigh = 0;

    // HNR autocorrelation buffer (reused to avoid GC)
    this._hnrBuf = null;

    // Timing
    this._initTime = 0;
    this.isInitialized = false;

    // Spectrogram color LUT (256 entries)
    this._spectrogramColors = null;
    this._buildColorLUT();
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Initialize audio context and connect nodes from a MediaStream.
   * Also accessible as initAudioContext() for backward compatibility.
   * @param {MediaStream} stream - microphone stream from getUserMedia
   * @returns {Promise<boolean>} true if successful
   */
  async init(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.error('EVPAudioEngine: Web Audio API not supported');
        return false;
      }

      this.audioContext = new AudioCtx();

      // Resume suspended context (required on iOS/mobile after user gesture)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sampleRate = this.audioContext.sampleRate;
      this.binResolution = this.sampleRate / this.fftSize;

      // Compute voice range bin indices (200-4000 Hz)
      this.voiceRangeLow = Math.floor(200 / this.binResolution);
      this.voiceRangeHigh = Math.ceil(4000 / this.binResolution);

      // Create AnalyserNode
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.3;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;

      // Create source from microphone stream
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // Gain node muted to zero to prevent feedback through speakers
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;

      // Signal chain: source -> analyser -> gain (muted) -> destination
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // Allocate data buffers
      this.frequencyData = new Uint8Array(this.binCount);
      this.frequencyFloat = new Float32Array(this.binCount);
      this.timeDomainData = new Float32Array(this.fftSize);

      // Allocate baseline accumulation buffers
      this._baselineBinSums = new Float64Array(this.binCount);
      this._baselineBinSqSums = new Float64Array(this.binCount);
      this._baselineRMSValues = [];

      // Allocate HNR buffer
      const dsLen = Math.floor(this.fftSize / 4);
      this._hnrBuf = new Float32Array(dsLen);

      this._initTime = performance.now();
      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error('EVPAudioEngine: Failed to init audio context', err);
      return false;
    }
  }

  /**
   * Backward-compatible alias for init().
   */
  async initAudioContext(stream) {
    return this.init(stream);
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Baseline Calibration
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Feed one frame of frequency data into the baseline calibration.
   * Called internally by processAudioFrame during the first ~90 frames.
   * @returns {number} calibration progress 0-100
   */
  calibrateBaseline() {
    if (this.baselineReady) return 100;

    // Accumulate RMS
    this._baselineRMSValues.push(this.currentRMS);

    // Accumulate per-bin linear magnitudes for mean/stddev
    for (let i = 0; i < this.binCount; i++) {
      // Convert byte (0-255) to linear magnitude via dB mapping
      // AnalyserNode maps minDecibels..maxDecibels to 0..255
      const dB = (this.frequencyData[i] / 255) *
        (this.analyser.maxDecibels - this.analyser.minDecibels) +
        this.analyser.minDecibels;
      const linearMag = Math.pow(10, dB / 20);
      this._baselineBinSums[i] += linearMag;
      this._baselineBinSqSums[i] += linearMag * linearMag;
    }

    this.baselineFrames++;

    const progress = Math.min(100, Math.round((this.baselineFrames / this.baselineTarget) * 100));

    if (this.baselineFrames >= this.baselineTarget) {
      const n = this.baselineFrames;

      // Compute average RMS during calibration
      let rmsSum = 0;
      for (let k = 0; k < this._baselineRMSValues.length; k++) {
        rmsSum += this._baselineRMSValues[k];
      }
      this.baselineRMS = rmsSum / n;

      // Compute per-bin mean and standard deviation
      this.baselineMean = new Float64Array(this.binCount);
      this.baselineStdDev = new Float64Array(this.binCount);

      for (let i = 0; i < this.binCount; i++) {
        this.baselineMean[i] = this._baselineBinSums[i] / n;
        const variance = (this._baselineBinSqSums[i] / n) -
          (this.baselineMean[i] * this.baselineMean[i]);
        this.baselineStdDev[i] = Math.sqrt(Math.max(0, variance));
      }

      this.baselineReady = true;
      this.baselineEstablished = true;

      // Free accumulation buffers
      this._baselineBinSums = null;
      this._baselineBinSqSums = null;
    }

    return progress;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Frame Processing (called every requestAnimationFrame)
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Process one audio frame. Computes all metrics and returns analysis object.
   * @returns {Object|undefined} frame analysis or undefined if not initialized
   */
  processAudioFrame() {
    if (!this.isInitialized) return undefined;
    this.frameCount++;

    // 1. Get frequency data (byte and float)
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getFloatFrequencyData(this.frequencyFloat);

    // 2. Get time domain data
    this.analyser.getFloatTimeDomainData(this.timeDomainData);

    // 3. If still calibrating, feed data to calibrateBaseline
    let calibrationProgress = this.baselineReady ? 100 : 0;
    if (!this.baselineReady) {
      // Compute RMS first so calibrateBaseline can use it
      this.currentRMS = this._computeRMS();
      this.currentRmsDb = this._linearToDb(this.currentRMS);
      calibrationProgress = this.calibrateBaseline();
    }

    // 4. Compute RMS level from time domain data
    this.currentRMS = this._computeRMS();
    this.currentRmsDb = this._linearToDb(this.currentRMS);

    // 5. Compute spectral centroid from frequency data
    this.currentSpectralCentroid = this._computeSpectralCentroid();

    // 6. Compute HNR (Harmonic-to-Noise Ratio)
    this.currentHNR = this._computeHNR();

    // 7. Detect formants
    this._formantList = this._detectFormants();

    // 8. Compute voice range energy
    this.currentVoiceRangeEnergy = this._computeVoiceRangeEnergy();

    // Accumulate running stats
    this.totalRmsSum += this.currentRMS;
    if (this.currentRmsDb > this.totalRmsSqMax) this.totalRmsSqMax = this.currentRmsDb;
    this.totalHnrSum += this.currentHNR;
    if (this.currentHNR > this.totalHnrMax) this.totalHnrMax = this.currentHNR;
    this.totalCentroidSum += this.currentSpectralCentroid;
    if (this._formantList.length >= 2) this.totalFormantDetections++;
    if (this.currentVoiceRangeEnergy > 0.05) this.totalVoiceFrames++;

    // 9. Detect anomalies (only after baseline is established)
    this.anomalyBins = [];
    this.isAnomaly = false;
    this.anomalyStrength = 0;
    this.currentSNR = 0;

    if (this.baselineReady) {
      this._detectAnomalies();
    }

    // Build and return frame analysis object
    return {
      rmsLevel: this.currentRMS,
      rmsDb: this.currentRmsDb,
      spectralCentroid: this.currentSpectralCentroid,
      hnr: this.currentHNR,
      formants: this._formantList.slice(),
      formantCount: this._formantList.length,
      anomalyDetected: this.isAnomaly,
      anomalyBins: this.anomalyBins.slice(),
      snr: this.currentSNR,
      frequencyData: new Uint8Array(this.frequencyData),
      voiceRangeEnergy: this.currentVoiceRangeEnergy,
      baselineReady: this.baselineReady,
      calibrationProgress: calibrationProgress
    };
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // RMS Computation
  // ───────────────────────────────────────────────────────────────────────────────

  _computeRMS() {
    const data = this.timeDomainData;
    const len = data.length;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / len);
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Spectral Centroid
  // ───────────────────────────────────────────────────────────────────────────────

  _computeSpectralCentroid() {
    let weightedSum = 0;
    let magnitudeSum = 0;
    for (let i = 1; i < this.binCount; i++) {
      const mag = this.frequencyData[i]; // 0-255
      const freq = i * this.binResolution;
      weightedSum += freq * mag;
      magnitudeSum += mag;
    }
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Harmonic-to-Noise Ratio via Autocorrelation
  // ───────────────────────────────────────────────────────────────────────────────

  _computeHNR() {
    const data = this.timeDomainData;
    const len = data.length;
    const dsFactor = 4; // Downsample 4x for performance
    const dsLen = Math.floor(len / dsFactor);
    if (dsLen < 128) return 0;

    // Downsample into reusable buffer
    const buf = this._hnrBuf;
    for (let i = 0; i < dsLen; i++) {
      buf[i] = data[i * dsFactor];
    }

    const dsRate = this.sampleRate / dsFactor;

    // Search lag range for human voice fundamental (80-400 Hz)
    const minLag = Math.floor(dsRate / 400); // highest pitch
    const maxLag = Math.floor(dsRate / 80);  // lowest pitch

    if (maxLag >= dsLen) return 0;

    // Compute signal energy
    let energy = 0;
    for (let i = 0; i < dsLen; i++) {
      energy += buf[i] * buf[i];
    }
    if (energy < 1e-10) return 0;

    // Find peak normalized autocorrelation in the voice pitch range
    let maxCorr = 0;
    let bestLag = 0;
    const searchLimit = Math.min(maxLag, Math.floor(dsLen / 2));

    for (let lag = minLag; lag <= searchLimit; lag++) {
      let corr = 0;
      for (let i = 0; i < dsLen - lag; i++) {
        corr += buf[i] * buf[i + lag];
      }
      // Normalize by energy
      corr /= energy;
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    // Parabolic interpolation around peak for refined estimate
    if (bestLag > minLag && bestLag < searchLimit) {
      let corrPrev = 0, corrNext = 0;
      for (let i = 0; i < dsLen - (bestLag - 1); i++) {
        corrPrev += buf[i] * buf[i + bestLag - 1];
      }
      corrPrev /= energy;
      for (let i = 0; i < dsLen - (bestLag + 1); i++) {
        corrNext += buf[i] * buf[i + bestLag + 1];
      }
      corrNext /= energy;

      const denom = 2 * (2 * maxCorr - corrPrev - corrNext);
      if (Math.abs(denom) > 1e-10) {
        const delta = (corrPrev - corrNext) / denom;
        // Interpolated peak value
        maxCorr = maxCorr - 0.25 * (corrPrev - corrNext) * delta;
      }
    }

    if (maxCorr <= 0 || maxCorr >= 1) return 0;

    // HNR = 10 * log10(r / (1 - r)) dB
    const hnr = 10 * Math.log10(maxCorr / (1 - maxCorr));

    // Clamp to reasonable range
    return Math.max(-20, Math.min(40, hnr));
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Formant Detection with Parabolic Interpolation
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Detect formants F1, F2, F3 in their respective frequency ranges.
   * Uses parabolic interpolation on spectral peaks for sub-bin accuracy.
   * @returns {Array<{freq: number, amplitude: number}>}
   */
  _detectFormants() {
    const formantRanges = [
      { label: 'F1', lowHz: 200, highHz: 900 },
      { label: 'F2', lowHz: 500, highHz: 3000 },
      { label: 'F3', lowHz: 2000, highHz: 3500 }
    ];

    const results = [];
    const detectedFreqs = [];

    for (let r = 0; r < formantRanges.length; r++) {
      const range = formantRanges[r];
      const lowBin = Math.max(1, Math.floor(range.lowHz / this.binResolution));
      const highBin = Math.min(this.binCount - 2, Math.ceil(range.highHz / this.binResolution));

      // Find all local maxima in this range
      const peaks = [];
      for (let i = lowBin + 1; i < highBin; i++) {
        const val = this.frequencyData[i];
        const prev = this.frequencyData[i - 1];
        const next = this.frequencyData[i + 1];

        // Local maximum: higher than both neighbors by a threshold
        if (val > prev && val > next && val > 20) {
          // Check prominence: must be above the mean of a wider neighborhood
          let neighborSum = 0;
          let neighborCount = 0;
          const span = 8;
          for (let j = Math.max(lowBin, i - span); j <= Math.min(highBin, i + span); j++) {
            if (Math.abs(j - i) > 2) {
              neighborSum += this.frequencyData[j];
              neighborCount++;
            }
          }
          const neighborMean = neighborCount > 0 ? neighborSum / neighborCount : 0;

          // Peak must be at least 6 units (roughly 2dB) above local neighborhood
          if (val > neighborMean + 6) {
            // Parabolic interpolation for sub-bin accuracy
            const alpha = prev;
            const beta = val;
            const gamma = next;
            const denom = 2 * (2 * beta - alpha - gamma);
            let refinedBin = i;
            let refinedAmplitude = val;

            if (Math.abs(denom) > 1e-6) {
              const delta = (alpha - gamma) / denom;
              refinedBin = i + Math.max(-0.5, Math.min(0.5, delta));
              refinedAmplitude = beta - 0.25 * (alpha - gamma) * delta;
            }

            const refinedFreq = refinedBin * this.binResolution;

            // Ensure we do not pick the same peak for multiple formants
            let tooClose = false;
            for (let d = 0; d < detectedFreqs.length; d++) {
              if (Math.abs(refinedFreq - detectedFreqs[d]) < 80) {
                tooClose = true;
                break;
              }
            }

            if (!tooClose) {
              peaks.push({
                freq: refinedFreq,
                amplitude: refinedAmplitude,
                prominence: val - neighborMean
              });
            }
          }
        }
      }

      // Pick the most prominent peak in this range
      if (peaks.length > 0) {
        peaks.sort((a, b) => b.prominence - a.prominence);
        const best = peaks[0];
        results.push({ freq: best.freq, amplitude: best.amplitude });
        detectedFreqs.push(best.freq);
      }
    }

    // Update the backward-compatible formants object
    this.formants.f1 = results.length > 0 ? results[0].freq : 0;
    this.formants.f2 = results.length > 1 ? results[1].freq : 0;
    this.formants.f3 = results.length > 2 ? results[2].freq : 0;
    this.formants.clarity = results.length;
    this.formants.hasVoicePattern = results.length >= 2;

    return results;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Voice Range Energy
  // ───────────────────────────────────────────────────────────────────────────────

  _computeVoiceRangeEnergy() {
    const lo = Math.max(1, this.voiceRangeLow);
    const hi = Math.min(this.binCount - 1, this.voiceRangeHigh);
    let sum = 0;
    let count = 0;
    for (let i = lo; i <= hi; i++) {
      sum += this.frequencyData[i];
      count++;
    }
    // Normalize to 0-1 range (max possible is 255)
    return count > 0 ? (sum / count) / 255 : 0;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Anomaly Detection
  // ───────────────────────────────────────────────────────────────────────────────

  _detectAnomalies() {
    const lo = Math.max(1, this.voiceRangeLow);
    const hi = Math.min(this.binCount - 1, this.voiceRangeHigh);

    this.anomalyBins = [];
    let signalPower = 0;
    let noisePower = 0;

    for (let i = lo; i <= hi; i++) {
      // Convert byte to dB then to linear magnitude
      const dB = (this.frequencyData[i] / 255) *
        (this.analyser.maxDecibels - this.analyser.minDecibels) +
        this.analyser.minDecibels;
      const linearMag = Math.pow(10, dB / 20);

      const mean = this.baselineMean[i];
      const std = this.baselineStdDev[i];
      const threshold = mean + 2 * std;

      if (linearMag > threshold && std > 1e-10) {
        const deviation = (linearMag - mean) / (std > 0 ? std : 1);
        this.anomalyBins.push({
          freq: i * this.binResolution,
          deviation: deviation
        });
        signalPower += linearMag * linearMag;
      } else {
        noisePower += linearMag * linearMag;
      }
    }

    // Compute SNR in the voice range
    if (noisePower > 1e-20) {
      this.currentSNR = 10 * Math.log10(signalPower / noisePower);
      this.currentSNR = Math.max(-100, Math.min(60, this.currentSNR));
    } else {
      this.currentSNR = signalPower > 1e-20 ? 60 : 0;
    }

    const prevAnomaly = this.isAnomaly;
    this.isAnomaly = this.anomalyBins.length >= 5;
    this.anomalyStrength = this.anomalyBins.length;

    // Record anomaly event on rising edge
    if (this.isAnomaly && !prevAnomaly) {
      if (this.anomalyEvents.length < this.maxAnomalyEvents) {
        const elapsed = (performance.now() - this._initTime) / 1000;
        this.anomalyEvents.push({
          time: elapsed,
          timestamp: this.frameCount,
          timeSeconds: this.frameCount / 30,
          strength: this.anomalyStrength,
          snr: this.currentSNR,
          centroid: this.currentSpectralCentroid,
          formants: this._formantList.slice(),
          hnr: this.currentHNR,
          peakFreq: this.peakFrequency,
          rms: this.currentRMS,
          rmsDb: this.currentRmsDb
        });
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Spectrogram Slice
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Build the spectrogram color lookup table (256 entries).
   * Gradient: #0a0a14 -> #1a0a3a -> #3a0a6a -> #00e5ff -> #00e676 -> #ffea00 -> #ff1744
   */
  _buildColorLUT() {
    const stops = [
      { pos: 0,   r: 10,  g: 10,  b: 20  }, // #0a0a14 (near black)
      { pos: 42,  r: 26,  g: 10,  b: 58  }, // #1a0a3a (dark purple)
      { pos: 85,  r: 58,  g: 10,  b: 106 }, // #3a0a6a (purple)
      { pos: 128, r: 0,   g: 229, b: 255 }, // #00e5ff (cyan)
      { pos: 170, r: 0,   g: 230, b: 118 }, // #00e676 (green)
      { pos: 212, r: 255, g: 234, b: 0   }, // #ffea00 (yellow)
      { pos: 255, r: 255, g: 23,  b: 68  }  // #ff1744 (red)
    ];

    this._spectrogramColors = new Array(256);

    for (let v = 0; v < 256; v++) {
      // Find the two surrounding stops
      let lower = stops[0];
      let upper = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (v >= stops[s].pos && v <= stops[s + 1].pos) {
          lower = stops[s];
          upper = stops[s + 1];
          break;
        }
      }

      const range = upper.pos - lower.pos;
      const t = range > 0 ? (v - lower.pos) / range : 0;

      const r = Math.round(lower.r + (upper.r - lower.r) * t);
      const g = Math.round(lower.g + (upper.g - lower.g) * t);
      const b = Math.round(lower.b + (upper.b - lower.b) * t);

      const hex = '#' +
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0');

      this._spectrogramColors[v] = hex;
    }
  }

  /**
   * Return the current frequency data as an array suitable for drawing
   * one vertical line of a spectrogram.
   * @returns {Array<{value: number, color: string}>|null}
   */
  getSpectrogramSlice() {
    if (!this.frequencyData) return null;

    const len = this.binCount;
    const result = new Array(len);

    for (let i = 0; i < len; i++) {
      const val = this.frequencyData[i];
      result[i] = {
        value: val,
        color: this._spectrogramColors[val]
      };
    }

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Voice Range Data Extraction
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Extract just the voice-range frequency bins (200-4000Hz).
   * @returns {{bins: Array, energy: number, peakFreq: number, peakAmplitude: number}}
   */
  getVoiceRangeData() {
    if (!this.frequencyData) {
      return { bins: [], energy: 0, peakFreq: 0, peakAmplitude: 0 };
    }

    const lo = Math.max(1, this.voiceRangeLow);
    const hi = Math.min(this.binCount - 1, this.voiceRangeHigh);

    const bins = [];
    let energySum = 0;
    let peakVal = 0;
    let peakBin = lo;

    for (let i = lo; i <= hi; i++) {
      const val = this.frequencyData[i];
      bins.push(val);
      energySum += val;
      if (val > peakVal) {
        peakVal = val;
        peakBin = i;
      }
    }

    const count = hi - lo + 1;
    const energy = count > 0 ? (energySum / count) / 255 : 0;

    return {
      bins: bins,
      energy: energy,
      peakFreq: peakBin * this.binResolution,
      peakAmplitude: peakVal
    };
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Backward-Compatible Accessor Methods
  // ───────────────────────────────────────────────────────────────────────────────

  getNoiseFloor() {
    if (!this.baselineReady) {
      return { established: false, rms: 0, rmsDb: -100 };
    }
    const rmsDb = this._linearToDb(this.baselineRMS);
    return { established: true, rms: this.baselineRMS, rmsDb: rmsDb };
  }

  getAnomalyState() {
    return {
      isAnomaly: this.isAnomaly,
      strength: this.anomalyStrength,
      peakFreq: this.peakFrequency,
      formantMatch: this.formants.hasVoicePattern
    };
  }

  getFormantAnalysis() {
    return {
      f1: this.formants.f1,
      f2: this.formants.f2,
      f3: this.formants.f3,
      hasVoicePattern: this.formants.hasVoicePattern,
      clarity: this.formants.clarity
    };
  }

  getRMSLevel() {
    return this.currentRMS;
  }

  getSpectralCentroid() {
    return this.currentSpectralCentroid;
  }

  getHarmonicToNoiseRatio() {
    return this.currentHNR;
  }

  /**
   * Quick assessment for per-frame UI updates.
   */
  getQuickAssess() {
    const rmsPercent = Math.min(100, this.currentRMS * 500);
    const noiseFloor = this.getNoiseFloor();
    return {
      rmsPercent: rmsPercent,
      rmsDb: this.currentRmsDb,
      peakFreq: this.peakFrequency,
      centroid: this.currentSpectralCentroid,
      hnr: this.currentHNR,
      noiseFloorDb: noiseFloor.rmsDb,
      baselineEstablished: this.baselineReady,
      isAnomaly: this.isAnomaly,
      anomalyStrength: this.anomalyStrength,
      formantMatch: this.formants.hasVoicePattern,
      formantClarity: this.formants.clarity,
      f1: this.formants.f1,
      f2: this.formants.f2,
      f3: this.formants.f3,
      snr: this.currentSNR,
      voiceRangeEnergy: this.currentVoiceRangeEnergy,
      calibrationProgress: this.baselineReady ? 100 :
        Math.round((this.baselineFrames / this.baselineTarget) * 100)
    };
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Full Analysis (for evidence report)
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Return comprehensive analysis for the evidence report.
   */
  fullAnalysis() {
    const elapsed = this._initTime > 0
      ? (performance.now() - this._initTime) / 1000
      : 0;
    const fc = Math.max(1, this.frameCount);

    const averageRmsLinear = this.totalRmsSum / fc;
    const averageRmsDb = this._linearToDb(averageRmsLinear);
    const peakRmsDb = this.totalRmsSqMax > -Infinity ? this.totalRmsSqMax : -100;
    const averageHnr = this.totalHnrSum / fc;
    const peakHnr = this.totalHnrMax > -Infinity ? this.totalHnrMax : 0;
    const spectralCentroidAvg = this.totalCentroidSum / fc;
    const voiceRangeActivity = (this.totalVoiceFrames / fc) * 100;
    const baselineNoiseFloorDb = this._linearToDb(this.baselineRMS);

    return {
      duration: elapsed,
      totalFrames: this.frameCount,
      anomalyCount: this.anomalyEvents.length,
      averageRms: averageRmsDb,
      peakRms: peakRmsDb,
      averageHnr: averageHnr,
      peakHnr: peakHnr,
      formantDetections: this.totalFormantDetections,
      baselineNoiseFloor: baselineNoiseFloorDb,
      spectralCentroidAvg: spectralCentroidAvg,
      voiceRangeActivity: voiceRangeActivity,
      anomalyTimestamps: this.anomalyEvents.map(e => ({
        time: e.time,
        snr: e.snr,
        centroid: e.centroid,
        formants: e.formants
      })),

      // Backward-compatible fields
      baselineRMS: this.baselineRMS,
      baselineRMSDb: baselineNoiseFloorDb,
      anomalyEvents: this.anomalyEvents.slice(),
      totalAnomalies: this.anomalyEvents.length,
      binResolution: this.binResolution,
      sampleRate: this.sampleRate,
      fftSize: this.fftSize
    };
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Peak Frequency (voice range)
  // ───────────────────────────────────────────────────────────────────────────────

  _findPeakFrequency() {
    let maxVal = 0;
    let maxBin = 0;
    const lo = Math.max(1, this.voiceRangeLow);
    const hi = Math.min(this.binCount - 1, this.voiceRangeHigh);
    for (let i = lo; i <= hi; i++) {
      if (this.frequencyData[i] > maxVal) {
        maxVal = this.frequencyData[i];
        maxBin = i;
      }
    }
    return maxBin * this.binResolution;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Utility
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Convert linear amplitude to dB, clamped to [-100, 0].
   * @param {number} value - linear amplitude 0-1
   * @returns {number} dB value
   */
  _linearToDb(value) {
    if (value <= 0) return -100;
    const db = 20 * Math.log10(value);
    return Math.max(-100, Math.min(0, db));
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Clear / Reset (for restarting scans)
  // ───────────────────────────────────────────────────────────────────────────────

  clearAll() {
    // Reset baseline calibration
    this.baselineFrames = 0;
    this.baselineReady = false;
    this.baselineEstablished = false;
    this._baselineRMSValues = [];
    this.baselineMean = null;
    this.baselineStdDev = null;
    this.baselineRMS = 0;

    // Re-allocate baseline accumulators if engine is initialized
    if (this.isInitialized) {
      this._baselineBinSums = new Float64Array(this.binCount);
      this._baselineBinSqSums = new Float64Array(this.binCount);
    } else {
      this._baselineBinSums = null;
      this._baselineBinSqSums = null;
    }

    // Reset running statistics
    this.frameCount = 0;
    this.totalRmsSum = 0;
    this.totalRmsSqMax = -Infinity;
    this.totalHnrSum = 0;
    this.totalHnrMax = -Infinity;
    this.totalCentroidSum = 0;
    this.totalFormantDetections = 0;
    this.totalVoiceFrames = 0;

    // Reset current state
    this.currentRMS = 0;
    this.currentRmsDb = -100;
    this.currentSpectralCentroid = 0;
    this.currentHNR = 0;
    this.peakFrequency = 0;
    this.isAnomaly = false;
    this.anomalyStrength = 0;
    this.anomalyBins = [];
    this.currentSNR = 0;
    this.currentVoiceRangeEnergy = 0;
    this.formants = { f1: 0, f2: 0, f3: 0, hasVoicePattern: false, clarity: 0 };
    this._formantList = [];
    this.anomalyEvents = [];

    // Reset init time for new scan
    this._initTime = performance.now();
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // Destroy / Teardown
  // ───────────────────────────────────────────────────────────────────────────────

  destroy() {
    // Disconnect all audio nodes safely
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (e) { /* already disconnected */ }
      this.sourceNode = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) { /* already disconnected */ }
      this.analyser = null;
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch (e) { /* already disconnected */ }
      this.gainNode = null;
    }

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;

    // Clear all data arrays
    this.frequencyData = null;
    this.frequencyFloat = null;
    this.timeDomainData = null;
    this.baselineMean = null;
    this.baselineStdDev = null;
    this._baselineBinSums = null;
    this._baselineBinSqSums = null;
    this._baselineRMSValues = [];
    this._hnrBuf = null;
    this._formantList = [];
    this.anomalyBins = [];
    this.anomalyEvents = [];

    // Reset state
    this.isInitialized = false;
    this.baselineReady = false;
    this.baselineEstablished = false;
    this.baselineFrames = 0;
    this.baselineRMS = 0;
    this.frameCount = 0;
    this.currentRMS = 0;
    this.currentRmsDb = -100;
    this.currentSpectralCentroid = 0;
    this.currentHNR = 0;
    this.peakFrequency = 0;
    this.isAnomaly = false;
    this.anomalyStrength = 0;
    this.currentSNR = 0;
    this.currentVoiceRangeEnergy = 0;
    this.formants = { f1: 0, f2: 0, f3: 0, hasVoicePattern: false, clarity: 0 };
    this.totalRmsSum = 0;
    this.totalRmsSqMax = -Infinity;
    this.totalHnrSum = 0;
    this.totalHnrMax = -Infinity;
    this.totalCentroidSum = 0;
    this.totalFormantDetections = 0;
    this.totalVoiceFrames = 0;
    this._initTime = 0;
  }
}

// Expose on window for non-module usage
window.EVPAudioEngine = EVPAudioEngine;
