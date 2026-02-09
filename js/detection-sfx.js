/**
 * DetectionSFX — Atmospheric sound effects for paranormal detection
 * All sounds generated via Web Audio API — no audio files needed.
 *
 * Effects:
 *   radarPing    — Subtle sonar ping on radar sweep (when entities present)
 *   emfClick     — Geiger-like click for EMF spikes
 *   evpTone      — Eerie rising tone when EVP classified
 *   anomalyPulse — Low bass pulse for general anomaly
 *   wordChime    — Short chime when word detected
 *   sweepTick    — Very quiet tick on spirit box sweep
 */
class DetectionSFX {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
    this.volume = 0.3; // 0-1
    this._initialized = false;
  }

  init(audioContext) {
    if (audioContext) {
      this.audioCtx = audioContext;
    } else if (window.AudioContext || window.webkitAudioContext) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    this._initialized = !!this.audioCtx;
    return this._initialized;
  }

  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); }
  toggle() { this.enabled = !this.enabled; return this.enabled; }

  _play(fn) {
    if (!this.enabled || !this._initialized || !this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(fn).catch(function() {});
    } else {
      try { fn(); } catch (e) {}
    }
  }

  radarPing() {
    var self = this;
    this._play(function() {
      var ctx = self.audioCtx;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
      gain.gain.setValueAtTime(self.volume * 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  emfClick() {
    var self = this;
    this._play(function() {
      var ctx = self.audioCtx;
      var now = ctx.currentTime;
      var bufSize = ctx.sampleRate * 0.02;
      var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.1));
      }
      var src = ctx.createBufferSource();
      var gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.setValueAtTime(self.volume * 0.4, now);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
    });
  }

  evpTone() {
    var self = this;
    this._play(function() {
      var ctx = self.audioCtx;
      var now = ctx.currentTime;
      // Eerie rising dual-oscillator tone
      for (var i = 0; i < 2; i++) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(200 + i * 50, now);
        osc.frequency.linearRampToValueAtTime(600 + i * 100, now + 0.6);
        osc.frequency.linearRampToValueAtTime(300, now + 1.0);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(self.volume * 0.12, now + 0.1);
        gain.gain.linearRampToValueAtTime(self.volume * 0.08, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.0);
      }
    });
  }

  anomalyPulse() {
    var self = this;
    this._play(function() {
      var ctx = self.audioCtx;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now);
      osc.frequency.linearRampToValueAtTime(40, now + 0.4);
      gain.gain.setValueAtTime(self.volume * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  wordChime() {
    var self = this;
    this._play(function() {
      var ctx = self.audioCtx;
      var now = ctx.currentTime;
      var freqs = [523, 659, 784]; // C5, E5, G5
      for (var i = 0; i < freqs.length; i++) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freqs[i];
        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(self.volume * 0.1, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.4);
      }
    });
  }

  sweepTick() {
    var self = this;
    this._play(function() {
      var ctx = self.audioCtx;
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 2000;
      gain.gain.setValueAtTime(self.volume * 0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.015);
    });
  }
}

window.DetectionSFX = DetectionSFX;
