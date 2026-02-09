/**
 * SpiritBoxEngine — FM sweep simulation, white/pink noise generation, fragment capture
 * Simulates a spirit box by sweeping an oscillator through frequencies
 */
class SpiritBoxEngine {
  constructor() {
    this.audioContext = null;
    this.oscillator = null;
    this.noiseNode = null;
    this.gainNode = null;
    this.isInitialized = false;
    this.isActive = false;

    // Sweep config
    this.sweepSpeed = 150; // ms per step
    this.sweepMin = 200;   // Hz (audio)
    this.sweepMax = 4000;  // Hz (audio)
    this.sweepStep = 50;   // Hz per step
    this.currentFreq = this.sweepMin;
    this.lastStepTime = 0;

    // FM display (visual — maps audio Hz to fake MHz display)
    this.displayMin = 87.5;
    this.displayMax = 108.0;
    this.currentDisplayFreq = this.displayMin;

    // Mode: 'sweep', 'white-noise', 'pink-noise'
    this.mode = 'sweep';

    // Fragment capture
    this.fragments = [];
    this.maxFragments = 50;
    this.captureOnPause = false;
    this.pauseDuration = 100; // ms pause between sweeps for capture

    // State
    this.frameCount = 0;
    this.sweepCount = 0;
    this.noiseBuffer = null;
    this.noiseBufferSize = 4096;
  }

  init(audioContext) {
    this.audioContext = audioContext;

    // Create gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0.15; // Low volume
    this.gainNode.connect(this.audioContext.destination);

    this.isInitialized = true;
  }

  start() {
    if (!this.isInitialized || this.isActive) return;
    this.isActive = true;
    this.lastStepTime = performance.now();
    this.currentFreq = this.sweepMin;
    this._updateDisplayFreq();

    if (this.mode === 'sweep') {
      this._startOscillator();
    } else {
      this._startNoise();
    }
  }

  stop() {
    this.isActive = false;
    this._stopOscillator();
    this._stopNoise();
  }

  setMode(mode) {
    const wasActive = this.isActive;
    if (wasActive) this.stop();
    this.mode = mode;
    if (wasActive) this.start();
  }

  setSweepSpeed(ms) {
    this.sweepSpeed = Math.max(30, Math.min(350, ms));
  }

  setSweepRange(min, max) {
    this.displayMin = min;
    this.displayMax = max;
  }

  processFrame() {
    if (!this.isActive) return;
    this.frameCount++;

    const now = performance.now();

    if (this.mode === 'sweep') {
      // Step through frequencies
      if (now - this.lastStepTime >= this.sweepSpeed) {
        this.currentFreq += this.sweepStep;
        if (this.currentFreq > this.sweepMax) {
          this.currentFreq = this.sweepMin;
          this.sweepCount++;
        }

        this._updateDisplayFreq();

        // Update oscillator frequency
        if (this.oscillator) {
          this.oscillator.frequency.setValueAtTime(this.currentFreq, this.audioContext.currentTime);
        }

        this.lastStepTime = now;
      }
    }
  }

  _startOscillator() {
    this._stopOscillator();
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = this.currentFreq;

    // Add slight modulation for realism
    const modulator = this.audioContext.createOscillator();
    const modGain = this.audioContext.createGain();
    modulator.frequency.value = 3; // 3Hz wobble
    modGain.gain.value = 5; // ±5Hz wobble
    modulator.connect(modGain);
    modGain.connect(this.oscillator.frequency);
    modulator.start();

    this.oscillator.connect(this.gainNode);
    this.oscillator.start();
    this._modulator = modulator;
  }

  _stopOscillator() {
    if (this.oscillator) {
      try { this.oscillator.stop(); this.oscillator.disconnect(); } catch (e) { /* ignore */ }
      this.oscillator = null;
    }
    if (this._modulator) {
      try { this._modulator.stop(); this._modulator.disconnect(); } catch (e) { /* ignore */ }
      this._modulator = null;
    }
  }

  _startNoise() {
    this._stopNoise();
    const bufferSize = this.noiseBufferSize;
    // Use ScriptProcessorNode for noise generation (AudioWorklet not needed for this)
    this.noiseNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    if (this.mode === 'white-noise') {
      this.noiseNode.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) {
          output[i] = Math.random() * 2 - 1;
        }
      };
    } else if (this.mode === 'pink-noise') {
      // Pink noise using Voss-McCartney algorithm
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      this.noiseNode.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }
      };
    }

    this.noiseNode.connect(this.gainNode);
  }

  _stopNoise() {
    if (this.noiseNode) {
      try { this.noiseNode.disconnect(); } catch (e) { /* ignore */ }
      this.noiseNode = null;
    }
  }

  _updateDisplayFreq() {
    // Map audio Hz to fake FM MHz display
    const t = (this.currentFreq - this.sweepMin) / (this.sweepMax - this.sweepMin);
    this.currentDisplayFreq = this.displayMin + t * (this.displayMax - this.displayMin);
  }

  getCurrentState() {
    return {
      isActive: this.isActive,
      mode: this.mode,
      currentFreqHz: this.currentFreq,
      currentFreqDisplay: this.currentDisplayFreq.toFixed(1),
      sweepSpeed: this.sweepSpeed,
      sweepCount: this.sweepCount,
      fragmentCount: this.fragments.length
    };
  }

  getFragments() {
    return [...this.fragments];
  }

  fullAnalysis() {
    return {
      totalSweeps: this.sweepCount,
      mode: this.mode,
      sweepSpeed: this.sweepSpeed,
      fragments: [...this.fragments],
      totalFrames: this.frameCount
    };
  }

  clearAll() {
    this.fragments = [];
    this.sweepCount = 0;
    this.frameCount = 0;
    this.currentFreq = this.sweepMin;
    this._updateDisplayFreq();
  }

  destroy() {
    this.stop();
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch (e) { /* ignore */ }
    }
    this.isInitialized = false;
  }
}

window.SpiritBoxEngine = SpiritBoxEngine;
