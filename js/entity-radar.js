/**
 * EntityRadar — Circular sonar/radar visualization for paranormal detection
 * Displays a sweeping radar with animated blips for different anomaly types.
 * Each sensor gets its own color and zone on the radar.
 *
 * Blip types:
 *   emf       → cyan   (top)
 *   audio     → green  (right)
 *   motion    → yellow (bottom)
 *   infrasound→ red    (left)
 *   word      → purple (random)
 *   evp       → white  (random, large)
 */
class EntityRadar {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.active = false;
    this.sweepAngle = 0;
    this.sweepSpeed = 0.025;
    this.blips = [];
    this.maxBlips = 40;
    this.entityCount = 0;
    this._lastPing = 0;
    this._pingInterval = 2500; // ms between radar pings
  }

  init(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return false;
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    return true;
  }

  _resize() {
    if (!this.canvas) return;
    const size = Math.min(this.canvas.parentElement.offsetWidth, 280);
    this.canvas.width = size * (window.devicePixelRatio || 1);
    this.canvas.height = size * (window.devicePixelRatio || 1);
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
  }

  start() {
    this.active = true;
    this.blips = [];
    this.entityCount = 0;
    this._resize();
  }

  stop() {
    this.active = false;
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  addBlip(type, intensity) {
    const zones = {
      emf: -Math.PI / 2,
      audio: 0,
      motion: Math.PI / 2,
      infrasound: Math.PI,
      word: Math.random() * Math.PI * 2,
      evp: Math.random() * Math.PI * 2
    };
    const baseAngle = zones[type] !== undefined ? zones[type] : Math.random() * Math.PI * 2;
    const spread = type === 'evp' || type === 'word' ? Math.PI : 0.9;
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const distance = 0.2 + Math.random() * 0.6;
    const size = type === 'evp' ? 5 + intensity * 6 : 2 + intensity * 4;

    this.blips.push({
      type: type,
      angle: angle,
      distance: distance,
      intensity: Math.min(1, intensity),
      size: size,
      birth: performance.now(),
      life: type === 'evp' ? 12000 : 8000,
      pulse: type === 'evp' || type === 'word'
    });

    if (this.blips.length > this.maxBlips) this.blips.shift();
    this.entityCount++;
  }

  processFrame(sensorData) {
    if (!this.active || !this.ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 6;
    const ctx = this.ctx;
    const now = performance.now();

    ctx.clearRect(0, 0, w, h);

    // ── Background circle
    ctx.fillStyle = 'rgba(8, 8, 18, 0.92)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // ── Grid rings
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.lineWidth = 1;
    for (var i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * i / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── Crosshairs
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    // Diagonals
    ctx.moveTo(cx - r * 0.707, cy - r * 0.707); ctx.lineTo(cx + r * 0.707, cy + r * 0.707);
    ctx.moveTo(cx + r * 0.707, cy - r * 0.707); ctx.lineTo(cx - r * 0.707, cy + r * 0.707);
    ctx.stroke();

    // ── Zone labels
    ctx.font = (8 * (window.devicePixelRatio || 1)) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.fillText('EMF', cx, cy - r + 12);
    ctx.fillStyle = 'rgba(0, 230, 118, 0.3)';
    ctx.fillText('AUDIO', cx + r - 20, cy + 4);
    ctx.fillStyle = 'rgba(255, 234, 0, 0.3)';
    ctx.fillText('MOTION', cx, cy + r - 6);
    ctx.fillStyle = 'rgba(255, 23, 68, 0.3)';
    ctx.fillText('INFRA', cx - r + 22, cy + 4);

    // ── Sweep line with trail
    this.sweepAngle = (this.sweepAngle + this.sweepSpeed) % (Math.PI * 2);

    // Trail (cone)
    for (var t = 0; t < 8; t++) {
      var trailAngle = this.sweepAngle - t * 0.06;
      var alpha = 0.08 * (1 - t / 8);
      ctx.strokeStyle = 'rgba(0, 229, 255, ' + alpha + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(trailAngle) * r, cy + Math.sin(trailAngle) * r);
      ctx.stroke();
    }

    // Main sweep line
    var sweepGrad = ctx.createLinearGradient(cx, cy,
      cx + Math.cos(this.sweepAngle) * r,
      cy + Math.sin(this.sweepAngle) * r);
    sweepGrad.addColorStop(0, 'rgba(0, 229, 255, 0.8)');
    sweepGrad.addColorStop(0.7, 'rgba(0, 229, 255, 0.3)');
    sweepGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.strokeStyle = sweepGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(this.sweepAngle) * r, cy + Math.sin(this.sweepAngle) * r);
    ctx.stroke();

    // ── Blips
    var colors = {
      emf: [0, 229, 255],
      audio: [0, 230, 118],
      motion: [255, 234, 0],
      infrasound: [255, 23, 68],
      word: [124, 77, 255],
      evp: [255, 255, 255]
    };

    this.blips = this.blips.filter(function(b) { return now - b.birth < b.life; });

    for (var j = 0; j < this.blips.length; j++) {
      var b = this.blips[j];
      var age = (now - b.birth) / b.life;
      var alpha = (1 - age) * b.intensity;
      var bx = cx + Math.cos(b.angle) * b.distance * r;
      var by = cy + Math.sin(b.angle) * b.distance * r;
      var rgb = colors[b.type] || [255, 255, 255];
      var sz = b.size;

      // Pulsing effect
      if (b.pulse) {
        sz += Math.sin(now / 200) * 2;
      }

      // Outer glow
      ctx.shadowColor = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.shadowBlur = 10 * alpha;
      ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + (alpha * 0.3) + ')';
      ctx.beginPath();
      ctx.arc(bx, by, sz * 2, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
      ctx.beginPath();
      ctx.arc(bx, by, sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ── Center pulse
    var pulse = 3 + Math.sin(now / 300) * 1.5;
    ctx.fillStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Entity count
    ctx.font = 'bold ' + (10 * (window.devicePixelRatio || 1)) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
    ctx.fillText('ENTITIES: ' + this.getActiveBlipCount(), cx, cy + r - 14);

    // ── Outer ring glow when active
    var activeCount = this.getActiveBlipCount();
    if (activeCount > 0) {
      var glowAlpha = Math.min(0.4, activeCount * 0.05);
      ctx.strokeStyle = 'rgba(0, 229, 255, ' + glowAlpha + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── Process sensor data for new blips
    if (sensorData) {
      if (sensorData.emfAnomaly && Math.random() < 0.3) {
        this.addBlip('emf', sensorData.emfIntensity || 0.5);
      }
      if (sensorData.audioAnomaly && Math.random() < 0.25) {
        this.addBlip('audio', sensorData.audioIntensity || 0.5);
      }
      if (sensorData.motionLevel > 15 && Math.random() < 0.15) {
        this.addBlip('motion', Math.min(1, sensorData.motionLevel / 50));
      }
      if (sensorData.infrasoundDetected && Math.random() < 0.2) {
        this.addBlip('infrasound', sensorData.infrasoundIntensity || 0.7);
      }
    }

    // Ping sound trigger
    if (now - this._lastPing > this._pingInterval && activeCount > 0) {
      this._lastPing = now;
      return true; // signals caller to play ping
    }
    return false;
  }

  getActiveBlipCount() {
    var now = performance.now();
    var count = 0;
    for (var i = 0; i < this.blips.length; i++) {
      if (now - this.blips[i].birth < this.blips[i].life * 0.5) count++;
    }
    return count;
  }

  getTotalDetections() {
    return this.entityCount;
  }
}

window.EntityRadar = EntityRadar;
