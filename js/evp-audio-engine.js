/**
 * EVPAudioEngine — Core audio capture, FFT analysis, spectrogram, noise floor, formant detection
 * Uses Web Audio API with AnalyserNode for real-time frequency analysis
 */
class EVPAudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.isInitialized = false;

    // FFT config
    this.fftSize = 8192;
    this.binCount = this.fftSize / 2; // 4096 bins
    this.sampleRate = 48000;
    this.binResolution = 0; // Hz per bin, set after init

    // Buffers
    this.timeDomainData = null;
    this.frequencyData = null;

    // Noise floor baseline
    this.baselineFrames = 0;
    this.baselineTarget = 90; // ~3 seconds at 30fps
    this.baselineEstablished = false;
    this.baselineRMSValues = [];
    this.baselineBinSums = null;
    this.baselineBinSqSums = null;
    this.baselineBinMean = null;
    this.baselineBinStd = null;
    this.baselineRMS = 0;

    // Current state
    this.currentRMS = 0;
    this.currentSpectralCentroid = 0;
    this.currentHNR = 0;
    this.peakFrequency = 0;
    this.isAnomaly = false;
    this.anomalyStrength = 0;
    this.anomalyBins = [];
    this.frameCount = 0;

    // Formant detection
    this.formants = { f1: 0, f2: 0, f3: 0, hasVoicePattern: false, clarity: 0 };

    // Anomaly history
    this.anomalyEvents = [];
    this.maxAnomalyEvents = 200;

    // Voice range bins (populated after init when sampleRate is known)
    this.voiceRangeLow = 0;
    this.voiceRangeHigh = 0;
  }

  async initAudioContext(stream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.sampleRate = this.audioContext.sampleRate;
      this.binResolution = this.sampleRate / this.fftSize;

      // Voice range: 200-4000 Hz mapped to bins
      this.voiceRangeLow = Math.floor(200 / this.binResolution);
      this.voiceRangeHigh = Math.ceil(4000 / this.binResolution);

      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.3;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;

      // Source from mic
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // Gain node muted to prevent feedback through speakers
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;

      // Connect: source -> analyser -> gain (muted) -> destination
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // Allocate buffers
      this.timeDomainData = new Float32Array(this.fftSize);
      this.frequencyData = new Float32Array(this.binCount);
      this.baselineBinSums = new Float64Array(this.binCount);
      this.baselineBinSqSums = new Float64Array(this.binCount);

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error('EVPAudioEngine: Failed to init audio context', err);
      return false;
    }
  }

  processAudioFrame() {
    if (!this.isInitialized) return;
    this.frameCount++;

    // Get frequency and time domain data
    this.analyser.getFloatTimeDomainData(this.timeDomainData);
    this.analyser.getFloatFrequencyData(this.frequencyData);

    // Compute RMS
    this.currentRMS = this._computeRMS();

    // Compute spectral centroid
    this.currentSpectralCentroid = this._computeSpectralCentroid();

    // Find peak frequency
    this.peakFrequency = this._findPeakFrequency();

    // Compute HNR
    this.currentHNR = this._computeHNR();

    // Detect formants
    this.formants = this._detectFormants();

    // Baseline collection
    if (!this.baselineEstablished) {
      this._collectBaseline();
    } else {
      // Anomaly detection
      this._detectAnomaly();
    }
  }

  _computeRMS() {
    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      sum += this.timeDomainData[i] * this.timeDomainData[i];
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }

  _computeSpectralCentroid() {
    let weightedSum = 0;
    let magnitudeSum = 0;
    for (let i = 1; i < this.binCount; i++) {
      // Convert dB to linear magnitude
      const mag = Math.pow(10, this.frequencyData[i] / 20);
      const freq = i * this.binResolution;
      weightedSum += freq * mag;
      magnitudeSum += mag;
    }
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  _findPeakFrequency() {
    let maxVal = -Infinity;
    let maxBin = 0;
    // Search in voice range
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

  _computeHNR() {
    // Simplified HNR using autocorrelation
    const data = this.timeDomainData;
    const len = data.length;
    const minLag = Math.floor(this.sampleRate / 4000); // Max freq 4000Hz
    const maxLag = Math.floor(this.sampleRate / 80);    // Min freq 80Hz

    if (maxLag >= len) return 0;

    // Compute energy
    let energy = 0;
    for (let i = 0; i < len; i++) {
      energy += data[i] * data[i];
    }
    if (energy < 1e-10) return 0;

    // Find peak autocorrelation at lag > 0
    let maxCorr = 0;
    for (let lag = minLag; lag < Math.min(maxLag, len / 2); lag++) {
      let corr = 0;
      for (let i = 0; i < len - lag; i++) {
        corr += data[i] * data[i + lag];
      }
      corr /= energy;
      if (corr > maxCorr) maxCorr = corr;
    }

    // HNR = 10 * log10(r / (1 - r)) where r is normalized autocorrelation peak
    if (maxCorr <= 0 || maxCorr >= 1) return 0;
    return 10 * Math.log10(maxCorr / (1 - maxCorr));
  }

  _detectFormants() {
    const result = { f1: 0, f2: 0, f3: 0, hasVoicePattern: false, clarity: 0 };

    // Formant ranges in bins
    const f1Low = Math.floor(200 / this.binResolution);
    const f1High = Math.ceil(900 / this.binResolution);
    const f2Low = Math.floor(500 / this.binResolution);
    const f2High = Math.ceil(3000 / this.binResolution);
    const f3Low = Math.floor(2000 / this.binResolution);
    const f3High = Math.ceil(3500 / this.binResolution);

    // Find peak in each formant band
    result.f1 = this._findPeakInRange(f1Low, f1High);
    result.f2 = this._findPeakInRange(f2Low, f2High);
    result.f3 = this._findPeakInRange(f3Low, f3High);

    // Check if formant peaks are significant (above local mean by threshold)
    let foundCount = 0;
    if (result.f1 > 0 && this._isPeakSignificant(Math.round(result.f1 / this.binResolution))) foundCount++;
    if (result.f2 > 0 && this._isPeakSignificant(Math.round(result.f2 / this.binResolution))) foundCount++;
    if (result.f3 > 0 && this._isPeakSignificant(Math.round(result.f3 / this.binResolution))) foundCount++;

    result.clarity = foundCount;
    result.hasVoicePattern = foundCount >= 2;
    return result;
  }

  _findPeakInRange(lowBin, highBin) {
    let maxVal = -Infinity;
    let maxBin = 0;
    for (let i = lowBin; i <= Math.min(highBin, this.binCount - 1); i++) {
      if (this.frequencyData[i] > maxVal) {
        maxVal = this.frequencyData[i];
        maxBin = i;
      }
    }
    // Only return if above a reasonable threshold
    return maxVal > -80 ? maxBin * this.binResolution : 0;
  }

  _isPeakSignificant(bin) {
    if (bin < 3 || bin >= this.binCount - 3) return false;
    const peakVal = this.frequencyData[bin];
    // Compare to neighbors (5 bins away)
    let neighborSum = 0;
    let count = 0;
    for (let i = Math.max(0, bin - 10); i <= Math.min(this.binCount - 1, bin + 10); i++) {
      if (Math.abs(i - bin) > 3) {
        neighborSum += this.frequencyData[i];
        count++;
      }
    }
    const neighborMean = count > 0 ? neighborSum / count : -100;
    return peakVal > neighborMean + 6; // 6dB above local mean
  }

  _collectBaseline() {
    this.baselineRMSValues.push(this.currentRMS);

    for (let i = 0; i < this.binCount; i++) {
      const linearMag = Math.pow(10, this.frequencyData[i] / 20);
      this.baselineBinSums[i] += linearMag;
      this.baselineBinSqSums[i] += linearMag * linearMag;
    }

    this.baselineFrames++;

    if (this.baselineFrames >= this.baselineTarget) {
      // Compute baseline stats
      const n = this.baselineFrames;
      this.baselineRMS = this.baselineRMSValues.reduce((a, b) => a + b, 0) / n;

      this.baselineBinMean = new Float64Array(this.binCount);
      this.baselineBinStd = new Float64Array(this.binCount);

      for (let i = 0; i < this.binCount; i++) {
        this.baselineBinMean[i] = this.baselineBinSums[i] / n;
        const variance = (this.baselineBinSqSums[i] / n) - (this.baselineBinMean[i] * this.baselineBinMean[i]);
        this.baselineBinStd[i] = Math.sqrt(Math.max(0, variance));
      }

      this.baselineEstablished = true;
    }
  }

  _detectAnomaly() {
    this.anomalyBins = [];
    const lo = Math.max(1, this.voiceRangeLow);
    const hi = Math.min(this.binCount - 1, this.voiceRangeHigh);

    for (let i = lo; i <= hi; i++) {
      const linearMag = Math.pow(10, this.frequencyData[i] / 20);
      const threshold = this.baselineBinMean[i] + 2 * this.baselineBinStd[i];
      if (linearMag > threshold && this.baselineBinStd[i] > 1e-10) {
        this.anomalyBins.push(i);
      }
    }

    const prevAnomaly = this.isAnomaly;
    this.isAnomaly = this.anomalyBins.length >= 5;
    this.anomalyStrength = this.anomalyBins.length;

    // Log anomaly event
    if (this.isAnomaly && !prevAnomaly) {
      if (this.anomalyEvents.length < this.maxAnomalyEvents) {
        this.anomalyEvents.push({
          timestamp: this.frameCount,
          timeSeconds: this.frameCount / 30,
          strength: this.anomalyStrength,
          peakFreq: this.peakFrequency,
          centroid: this.currentSpectralCentroid,
          hnr: this.currentHNR,
          formants: { ...this.formants },
          rms: this.currentRMS
        });
      }
    }
  }

  getSpectrogramSlice() {
    if (!this.frequencyData) return null;
    // Return a copy of frequency data for spectrogram rendering
    return new Float32Array(this.frequencyData);
  }

  getNoiseFloor() {
    if (!this.baselineEstablished) return { established: false, rms: 0, rmsDb: -100 };
    const rmsDb = this.baselineRMS > 0 ? 20 * Math.log10(this.baselineRMS) : -100;
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
    return { ...this.formants };
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

  getQuickAssess() {
    const rmsPercent = Math.min(100, this.currentRMS * 500);
    const noiseFloor = this.getNoiseFloor();
    return {
      rmsPercent: rmsPercent,
      rmsDb: this.currentRMS > 0 ? 20 * Math.log10(this.currentRMS) : -100,
      peakFreq: this.peakFrequency,
      centroid: this.currentSpectralCentroid,
      hnr: this.currentHNR,
      noiseFloorDb: noiseFloor.rmsDb,
      baselineEstablished: this.baselineEstablished,
      isAnomaly: this.isAnomaly,
      anomalyStrength: this.anomalyStrength,
      formantMatch: this.formants.hasVoicePattern,
      formantClarity: this.formants.clarity,
      f1: this.formants.f1,
      f2: this.formants.f2,
      f3: this.formants.f3
    };
  }

  fullAnalysis() {
    return {
      totalFrames: this.frameCount,
      baselineRMS: this.baselineRMS,
      baselineRMSDb: this.baselineRMS > 0 ? 20 * Math.log10(this.baselineRMS) : -100,
      anomalyEvents: [...this.anomalyEvents],
      totalAnomalies: this.anomalyEvents.length,
      binResolution: this.binResolution,
      sampleRate: this.sampleRate,
      fftSize: this.fftSize
    };
  }

  clearAll() {
    this.baselineFrames = 0;
    this.baselineEstablished = false;
    this.baselineRMSValues = [];
    if (this.baselineBinSums) this.baselineBinSums.fill(0);
    if (this.baselineBinSqSums) this.baselineBinSqSums.fill(0);
    this.baselineBinMean = null;
    this.baselineBinStd = null;
    this.baselineRMS = 0;
    this.currentRMS = 0;
    this.currentSpectralCentroid = 0;
    this.currentHNR = 0;
    this.peakFrequency = 0;
    this.isAnomaly = false;
    this.anomalyStrength = 0;
    this.anomalyBins = [];
    this.anomalyEvents = [];
    this.frameCount = 0;
    this.formants = { f1: 0, f2: 0, f3: 0, hasVoicePattern: false, clarity: 0 };
  }

  destroy() {
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (e) { /* ignore */ }
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) { /* ignore */ }
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch (e) { /* ignore */ }
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.isInitialized = false;
  }
}

window.EVPAudioEngine = EVPAudioEngine;
