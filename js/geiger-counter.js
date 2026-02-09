/**
 * GeigerCounter — Converts anomaly readings into audible clicks
 * Uses Web Audio API OscillatorNode for authentic Geiger counter sound
 */
class GeigerCounter {
  constructor() {
    this.audioContext = null;
    this.enabled = false;
    this.volume = 0.3;
    this.lastClickTime = 0;
    this.baseRate = 0.5;   // clicks/sec at rest
    this.maxRate = 25;      // clicks/sec at max anomaly
    this.activityLevel = 0; // 0-1
    this._gainNode = null;
  }

  init(audioContext) {
    this.audioContext = audioContext;
    this._gainNode = audioContext.createGain();
    this._gainNode.gain.value = this.volume;
    this._gainNode.connect(audioContext.destination);
  }

  setEnabled(on) {
    this.enabled = on;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this._gainNode) this._gainNode.gain.value = this.volume;
  }

  // Call this every frame with current anomaly data
  processFrame(anomalyData) {
    if (!this.enabled || !this.audioContext || !this._gainNode) return;

    // Calculate combined activity level (0-1)
    let activity = 0;

    // Audio anomaly contribution
    if (anomalyData.audioAnomaly) activity += 0.3;
    if (anomalyData.voicePattern) activity += 0.2;

    // EMF contribution
    if (anomalyData.emfAnomaly) activity += 0.25;
    activity += Math.min(0.15, (anomalyData.emfDeviation || 0) / 40);

    // Motion contribution
    activity += Math.min(0.1, (anomalyData.motionLevel || 0) / 200);

    // Infrasound contribution
    if (anomalyData.infrasound) activity += 0.2;
    if (anomalyData.fearFreq) activity += 0.3;

    // Word detection boost
    if (anomalyData.wordDetected) activity += 0.25;

    this.activityLevel = Math.min(1, activity);

    // Calculate click rate
    const rate = this.baseRate + (this.maxRate - this.baseRate) * this.activityLevel;
    const interval = 1000 / rate;

    const now = performance.now();
    if (now - this.lastClickTime >= interval) {
      // Add slight randomness to interval for realism
      const jitter = interval * (0.3 * Math.random() - 0.15);
      if (now - this.lastClickTime >= interval + jitter) {
        this._click();
        this.lastClickTime = now;
      }
    }
  }

  _click() {
    if (!this.audioContext || !this._gainNode) return;

    const now = this.audioContext.currentTime;

    // Create a short burst — authentic Geiger sound
    // Two overlapping oscillators for richer click
    const osc1 = this.audioContext.createOscillator();
    const osc2 = this.audioContext.createOscillator();
    const clickGain = this.audioContext.createGain();

    osc1.type = 'square';
    osc1.frequency.value = 800 + Math.random() * 400;
    osc2.type = 'sawtooth';
    osc2.frequency.value = 2000 + Math.random() * 1000;

    // Very short envelope — the "click"
    const duration = 0.003 + this.activityLevel * 0.002;
    clickGain.gain.setValueAtTime(0.6 + this.activityLevel * 0.4, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(clickGain);
    osc2.connect(clickGain);
    clickGain.connect(this._gainNode);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.01);
    osc2.stop(now + duration + 0.01);
  }

  getState() {
    return {
      enabled: this.enabled,
      activityLevel: this.activityLevel,
      clickRate: this.baseRate + (this.maxRate - this.baseRate) * this.activityLevel
    };
  }
}

window.GeigerCounter = GeigerCounter;
