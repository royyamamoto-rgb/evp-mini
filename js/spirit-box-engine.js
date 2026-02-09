/**
 * SpiritBoxEngine — FM sweep simulation, white/pink noise generation, fragment capture
 *
 * Simulates a real spirit box (SB7/SB11) by rapidly sweeping an oscillator through
 * FM frequencies (87.5-108.0 MHz display range mapped to 200-4000 Hz audio) while
 * layering continuous white or pink noise underneath. Random frequency pauses simulate
 * the spirit box "catching" a station, creating the characteristic fragment captures
 * that paranormal investigators analyze for EVP content.
 *
 * Uses a SHARED AudioContext (passed in via init). Does not create its own context.
 */
class SpiritBoxEngine {
  constructor() {
    // Audio graph references
    this.audioContext = null;
    this.masterGain = null;
    this.oscillator = null;
    this.oscillatorGain = null;
    this.noiseSource = null;
    this.noiseGain = null;
    this.modulator = null;
    this.modulatorGain = null;

    // Pre-generated noise buffers
    this.whiteNoiseBuffer = null;
    this.pinkNoiseBuffer = null;

    // Sweep state
    this.currentFreq = 87.5;
    this.sweepDirection = 1;
    this.sweepSpeed = 100;
    this.stepSize = 0.2;
    this.sweepInterval = null;
    this.running = false;
    this.isInitialized = false;

    // Noise configuration
    this.noiseType = 'white';
    this.noiseLevel = 0.3;
    this.toneLevel = 0.4;

    // Fragment capture tracking
    this.fragments = [];
    this.maxFragments = 200;
    this.currentFragment = null;
    this.fragmentCaptured = false;
    this.isPaused = false;
    this.pauseTimeout = null;

    // Session statistics
    this.startTime = 0;
    this.frameCount = 0;
    this.sweepCount = 0;
    this.totalPauseCount = 0;
    this.longestPause = 0;
    this.totalPauseDuration = 0;

    // Mode: 'sweep', 'white-noise', 'pink-noise' (backward compat with app.js)
    this.mode = 'sweep';

    // FM display range
    this.displayMin = 87.5;
    this.displayMax = 108.0;

    // Audio frequency range
    this.audioMin = 200;
    this.audioMax = 4000;
  }

  /**
   * Initialize the engine with a shared AudioContext.
   * Creates the audio graph but does not start playback.
   */
  init(audioContext) {
    this.audioContext = audioContext;

    // Master gain — overall spirit box volume
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.15;
    this.masterGain.connect(this.audioContext.destination);

    // Oscillator gain — controls the sweep tone volume independently
    this.oscillatorGain = this.audioContext.createGain();
    this.oscillatorGain.gain.value = this.toneLevel;
    this.oscillatorGain.connect(this.masterGain);

    // Noise gain — controls the static/noise volume independently
    this.noiseGain = this.audioContext.createGain();
    this.noiseGain.gain.value = this.noiseLevel;
    this.noiseGain.connect(this.masterGain);

    // Pre-generate noise buffers (2 seconds each at native sample rate)
    this.whiteNoiseBuffer = this._createWhiteNoise();
    this.pinkNoiseBuffer = this._createPinkNoise();

    // Initialize sweep parameters
    this.currentFreq = this.displayMin;
    this.sweepDirection = 1;

    this.isInitialized = true;
  }

  /**
   * Start the spirit box sweep or noise playback depending on current mode.
   */
  start() {
    if (!this.isInitialized || this.running) return;
    this.running = true;
    this.startTime = this.audioContext.currentTime;
    this.frameCount = 0;

    if (this.mode === 'sweep') {
      this._startOscillator();
      this._startNoise();
      this._startSweepInterval();
    } else if (this.mode === 'white-noise' || this.mode === 'pink-noise') {
      // Pure noise mode — set noise type to match mode, no sweep
      const prevType = this.noiseType;
      this.noiseType = this.mode === 'white-noise' ? 'white' : 'pink';
      this._startNoise();
      this.noiseType = prevType;
    }
  }

  /**
   * Stop all audio output and clear the sweep interval.
   */
  stop() {
    this.running = false;

    this._stopOscillator();
    this._stopNoise();
    this._clearSweepInterval();

    // Clear any pending pause
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }
    this.isPaused = false;
    this.fragmentCaptured = false;
    this.currentFragment = null;
  }

  /**
   * Switch between modes: 'sweep', 'white-noise', 'pink-noise'.
   * Restarts playback if the engine was running.
   */
  setMode(mode) {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.mode = mode;
    if (wasRunning) this.start();
  }

  /**
   * Set the sweep speed in milliseconds per frequency step.
   * Valid range: 30-350ms. Restarts the interval if currently sweeping.
   */
  setSweepSpeed(ms) {
    this.sweepSpeed = Math.max(30, Math.min(350, ms));
    if (this.running && this.mode === 'sweep') {
      this._clearSweepInterval();
      this._startSweepInterval();
    }
  }

  /**
   * Set the noise type for the sweep backdrop.
   * @param {string} type - 'white' or 'pink'
   */
  setNoiseType(type) {
    if (type !== 'white' && type !== 'pink') return;
    this.noiseType = type;
    if (this.running) {
      this._stopNoise();
      this._startNoise();
    }
  }

  /**
   * Set noise volume (0-1).
   */
  setNoiseLevel(level) {
    this.noiseLevel = Math.max(0, Math.min(1, level));
    if (this.noiseGain) {
      this.noiseGain.gain.setValueAtTime(this.noiseLevel, this.audioContext.currentTime);
    }
  }

  /**
   * Set sweep tone volume (0-1).
   */
  setToneLevel(level) {
    this.toneLevel = Math.max(0, Math.min(1, level));
    if (this.oscillatorGain) {
      this.oscillatorGain.gain.setValueAtTime(this.toneLevel, this.audioContext.currentTime);
    }
  }

  /**
   * Called every animation frame when spirit box mode is active.
   * Returns current engine state for UI rendering.
   */
  processFrame() {
    if (!this.running) {
      return {
        running: false,
        displayFreq: this.currentFreq.toFixed(1),
        audioFreq: this._mapRange(this.currentFreq, this.displayMin, this.displayMax, this.audioMin, this.audioMax),
        sweepSpeed: this.sweepSpeed,
        noiseType: this.noiseType,
        noiseLevel: this.noiseLevel,
        toneLevel: this.toneLevel,
        fragmentCaptured: false,
        currentFragment: null
      };
    }

    this.frameCount++;

    return {
      running: true,
      displayFreq: this.currentFreq.toFixed(1),
      audioFreq: this._mapRange(this.currentFreq, this.displayMin, this.displayMax, this.audioMin, this.audioMax),
      sweepSpeed: this.sweepSpeed,
      noiseType: this.noiseType,
      noiseLevel: this.noiseLevel,
      toneLevel: this.toneLevel,
      fragmentCaptured: this.fragmentCaptured,
      currentFragment: this.currentFragment ? {
        freq: this.currentFragment.freq,
        duration: this.currentFragment.duration,
        startTime: this.currentFragment.startTime
      } : null
    };
  }

  /**
   * Backward-compatible state accessor used by app.js updateSpiritBoxUI().
   * Returns the same shape the UI expects.
   */
  getCurrentState() {
    return {
      isActive: this.running,
      mode: this.mode,
      currentFreqHz: this._mapRange(this.currentFreq, this.displayMin, this.displayMax, this.audioMin, this.audioMax),
      currentFreqDisplay: this.currentFreq.toFixed(1),
      sweepSpeed: this.sweepSpeed,
      sweepCount: this.sweepCount,
      fragmentCount: this.fragments.length,
      noiseType: this.noiseType,
      noiseLevel: this.noiseLevel,
      toneLevel: this.toneLevel,
      fragmentCaptured: this.fragmentCaptured
    };
  }

  /**
   * Return array of all captured fragments for evidence analysis.
   */
  getFragments() {
    return this.fragments.map(f => ({
      freq: f.freq,
      duration: f.duration,
      time: f.time
    }));
  }

  /**
   * Comprehensive analysis for the evidence report system.
   * Maintains backward compatibility with evidence-report.js expectations.
   */
  fullAnalysis() {
    const elapsed = this.running
      ? this.audioContext.currentTime - this.startTime
      : (this.startTime > 0 ? this.audioContext.currentTime - this.startTime : 0);

    const avgPause = this.totalPauseCount > 0
      ? Math.round(this.totalPauseDuration / this.totalPauseCount)
      : 0;

    return {
      totalSweepTime: Math.round(elapsed * 10) / 10,
      frequencyRange: this.displayMin.toFixed(1) + ' - ' + this.displayMax.toFixed(1) + ' MHz',
      sweepSpeed: this.sweepSpeed,
      totalSweeps: this.sweepCount,
      fragmentsCaptured: this.fragments.length,
      fragments: this.fragments.map(f => ({
        freq: f.freq,
        duration: f.duration,
        time: f.time
      })),
      noiseType: this.noiseType,
      longestPause: this.longestPause,
      averagePauseDuration: avgPause,
      // Backward-compat fields used by evidence-report.js
      mode: this.mode,
      totalFrames: this.frameCount
    };
  }

  // ─── Internal: Sweep Logic ──────────────────────────────────────────────────

  /**
   * Core sweep step called by the interval timer.
   * Advances frequency, handles direction reversal, triggers random pauses,
   * and applies frequency wobble for analog realism.
   */
  _sweep() {
    // If currently paused on a captured fragment, skip
    if (this.isPaused) return;

    // 1. Advance the display frequency
    this.currentFreq += this.stepSize * this.sweepDirection;

    // 2. Handle range boundaries
    if (this.currentFreq >= this.displayMax) {
      this.currentFreq = this.displayMax;
      this.sweepDirection = -1;
      this.sweepCount++;
    } else if (this.currentFreq <= this.displayMin) {
      this.currentFreq = this.displayMin;
      this.sweepDirection = 1;
      this.sweepCount++;
    }

    // 3. Map FM display frequency to audio frequency
    const audioFreq = this._mapRange(
      this.currentFreq,
      this.displayMin,
      this.displayMax,
      this.audioMin,
      this.audioMax
    );

    // 4. Set oscillator frequency with a short ramp for smoothness
    if (this.oscillator) {
      const now = this.audioContext.currentTime;
      // Add slight random wobble for analog realism (±5Hz)
      const wobble = (Math.random() - 0.5) * 10;
      const targetFreq = Math.max(20, audioFreq + wobble);

      this.oscillator.frequency.setValueAtTime(
        this.oscillator.frequency.value,
        now
      );
      this.oscillator.frequency.linearRampToValueAtTime(
        targetFreq,
        now + Math.min(this.sweepSpeed / 1000, 0.05)
      );
    }

    // 5. Random pause chance — simulates catching a frequency
    //    2% chance per step, feels organic and unpredictable
    if (Math.random() < 0.02) {
      this._captureFragment();
    }

    // 6. Occasionally modulate the noise level slightly for texture
    if (this.noiseGain && Math.random() < 0.1) {
      const now = this.audioContext.currentTime;
      const jitter = this.noiseLevel * (0.85 + Math.random() * 0.3);
      this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, now);
      this.noiseGain.gain.linearRampToValueAtTime(jitter, now + 0.02);
      // Restore to baseline
      this.noiseGain.gain.linearRampToValueAtTime(this.noiseLevel, now + 0.06);
    }
  }

  /**
   * Pause the sweep on the current frequency for a random duration (200-800ms).
   * Records a fragment capture event.
   */
  _captureFragment() {
    this.isPaused = true;
    this.fragmentCaptured = true;

    // Random pause duration: 200-800ms, slightly biased toward shorter pauses
    const pauseDuration = 200 + Math.floor(Math.pow(Math.random(), 1.3) * 600);

    const elapsed = this.audioContext.currentTime - this.startTime;

    this.currentFragment = {
      freq: this.currentFreq.toFixed(1),
      duration: pauseDuration,
      startTime: Math.round(elapsed * 10) / 10
    };

    // Track statistics
    this.totalPauseCount++;
    this.totalPauseDuration += pauseDuration;
    if (pauseDuration > this.longestPause) {
      this.longestPause = pauseDuration;
    }

    // Store fragment
    if (this.fragments.length < this.maxFragments) {
      this.fragments.push({
        freq: this.currentFragment.freq,
        duration: pauseDuration,
        time: Math.round(elapsed * 10) / 10
      });
    }

    // Brief volume dip on tone during capture for realism
    if (this.oscillatorGain) {
      const now = this.audioContext.currentTime;
      const dippedLevel = this.toneLevel * 0.6;
      this.oscillatorGain.gain.setValueAtTime(this.toneLevel, now);
      this.oscillatorGain.gain.linearRampToValueAtTime(dippedLevel, now + 0.03);
      this.oscillatorGain.gain.linearRampToValueAtTime(this.toneLevel, now + 0.08);
    }

    // Resume sweep after the pause
    this.pauseTimeout = setTimeout(() => {
      this.isPaused = false;
      this.fragmentCaptured = false;
      this.currentFragment = null;
      this.pauseTimeout = null;
    }, pauseDuration);
  }

  // ─── Internal: Audio Node Management ────────────────────────────────────────

  /**
   * Create and start the oscillator node with frequency modulation wobble.
   */
  _startOscillator() {
    this._stopOscillator();

    const now = this.audioContext.currentTime;

    // Main oscillator — sine wave sweeping through frequencies
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = 'sine';
    const initialAudioFreq = this._mapRange(
      this.currentFreq,
      this.displayMin,
      this.displayMax,
      this.audioMin,
      this.audioMax
    );
    this.oscillator.frequency.setValueAtTime(initialAudioFreq, now);

    // Frequency modulator — slow wobble for analog imperfection
    this.modulator = this.audioContext.createOscillator();
    this.modulatorGain = this.audioContext.createGain();
    // Wobble between 2-5Hz for subtle organic movement
    this.modulator.frequency.setValueAtTime(3 + Math.random() * 2, now);
    // Wobble depth: ±5Hz
    this.modulatorGain.gain.setValueAtTime(5, now);
    this.modulator.connect(this.modulatorGain);
    this.modulatorGain.connect(this.oscillator.frequency);

    // Connect oscillator through its gain to master
    this.oscillator.connect(this.oscillatorGain);

    // Start both
    this.modulator.start(now);
    this.oscillator.start(now);
  }

  /**
   * Stop and disconnect the oscillator and its modulator.
   */
  _stopOscillator() {
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch (e) { /* already stopped */ }
      this.oscillator = null;
    }
    if (this.modulator) {
      try {
        this.modulator.stop();
        this.modulator.disconnect();
      } catch (e) { /* already stopped */ }
      this.modulator = null;
    }
    if (this.modulatorGain) {
      try {
        this.modulatorGain.disconnect();
      } catch (e) { /* already disconnected */ }
      this.modulatorGain = null;
    }
  }

  /**
   * Create and start a looping noise source from the appropriate buffer.
   */
  _startNoise() {
    this._stopNoise();

    // Select buffer based on current mode or noiseType setting
    let buffer;
    if (this.mode === 'white-noise') {
      buffer = this.whiteNoiseBuffer;
    } else if (this.mode === 'pink-noise') {
      buffer = this.pinkNoiseBuffer;
    } else {
      buffer = this.noiseType === 'pink' ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;
    }

    if (!buffer) return;

    this.noiseSource = this.audioContext.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;

    // Slight playback rate variation for each start to avoid repetition artifacts
    this.noiseSource.playbackRate.value = 0.98 + Math.random() * 0.04;

    this.noiseSource.connect(this.noiseGain);
    this.noiseSource.start(this.audioContext.currentTime);
  }

  /**
   * Stop and disconnect the noise source node.
   */
  _stopNoise() {
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      } catch (e) { /* already stopped */ }
      this.noiseSource = null;
    }
  }

  /**
   * Start the sweep interval timer.
   */
  _startSweepInterval() {
    this._clearSweepInterval();
    this.sweepInterval = setInterval(() => this._sweep(), this.sweepSpeed);
  }

  /**
   * Clear the sweep interval timer.
   */
  _clearSweepInterval() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  // ─── Internal: Noise Buffer Generation ──────────────────────────────────────

  /**
   * Generate a 2-second white noise AudioBuffer.
   * Pure random samples uniformly distributed in [-1, 1].
   */
  _createWhiteNoise() {
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  /**
   * Generate a 2-second pink noise (1/f) AudioBuffer using Paul Kellet's method.
   * This algorithm approximates pink noise by filtering white noise through
   * a series of first-order low-pass filters with carefully chosen coefficients
   * that produce the characteristic -3dB/octave rolloff.
   */
  _createPinkNoise() {
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Paul Kellet's refined method — seven filter states
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;

      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;

      const output = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;

      // Soft-clip to prevent rare overflow beyond [-1, 1]
      data[i] = Math.max(-1, Math.min(1, output));
    }

    return buffer;
  }

  // ─── Internal: Utility ──────────────────────────────────────────────────────

  /**
   * Linear mapping from one range to another.
   * @param {number} value  - Input value
   * @param {number} inMin  - Input range minimum
   * @param {number} inMax  - Input range maximum
   * @param {number} outMin - Output range minimum
   * @param {number} outMax - Output range maximum
   * @returns {number} Mapped value
   */
  _mapRange(value, inMin, inMax, outMin, outMax) {
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  // ─── Session Management ─────────────────────────────────────────────────────

  /**
   * Reset all session data (fragments, counters, sweep position).
   * Does not stop playback — call stop() first if needed.
   */
  clearAll() {
    this.fragments = [];
    this.sweepCount = 0;
    this.frameCount = 0;
    this.totalPauseCount = 0;
    this.longestPause = 0;
    this.totalPauseDuration = 0;
    this.currentFreq = this.displayMin;
    this.sweepDirection = 1;
    this.fragmentCaptured = false;
    this.currentFragment = null;
    this.startTime = 0;
  }

  /**
   * Set the FM display sweep range. Default 87.5-108.0 MHz.
   */
  setSweepRange(min, max) {
    this.displayMin = min;
    this.displayMax = max;
  }

  /**
   * Full teardown — stop all audio, disconnect nodes, release buffers.
   * Call this when the spirit box feature is being completely removed from the page.
   */
  destroy() {
    this.stop();

    if (this.oscillatorGain) {
      try { this.oscillatorGain.disconnect(); } catch (e) { /* ignore */ }
      this.oscillatorGain = null;
    }
    if (this.noiseGain) {
      try { this.noiseGain.disconnect(); } catch (e) { /* ignore */ }
      this.noiseGain = null;
    }
    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch (e) { /* ignore */ }
      this.masterGain = null;
    }

    this.whiteNoiseBuffer = null;
    this.pinkNoiseBuffer = null;
    this.fragments = [];
    this.currentFragment = null;
    this.isInitialized = false;
  }
}

window.SpiritBoxEngine = SpiritBoxEngine;
