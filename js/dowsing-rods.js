/**
 * DowsingRods — Full-screen canvas overlay with animated dowsing rods
 * Driven by gyroscope + magnetometer + anomaly data
 */
class DowsingRods {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.active = false;
    this.animId = null;

    // Rod state
    this.leftAngle = -35;   // degrees from vertical (negative = left)
    this.rightAngle = 35;   // degrees from vertical (positive = right)
    this.targetLeftAngle = -35;
    this.targetRightAngle = 35;

    // Smoothing
    this.smoothing = 0.08;

    // Anomaly triggers rods to cross
    this.anomalyLevel = 0; // 0-1
    this.crossThreshold = 0.4; // anomaly level to start crossing

    // Ambient wobble
    this.wobblePhase = 0;
  }

  init(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
  }

  start() {
    if (!this.canvas || !this.ctx) return;
    this.active = true;
    this.canvas.style.display = 'block';
    this._resize();
    this._animate();
  }

  stop() {
    this.active = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.canvas) this.canvas.style.display = 'none';
  }

  _resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.offsetWidth;
      this.canvas.height = parent.offsetHeight;
    }
  }

  // Update with sensor data each frame
  update(sensorData) {
    if (!this.active) return;

    // Calculate anomaly level (0-1)
    let anomaly = 0;
    if (sensorData.emfAnomaly) anomaly += 0.35;
    if (sensorData.audioAnomaly) anomaly += 0.25;
    if (sensorData.voicePattern) anomaly += 0.2;
    if (sensorData.infrasound) anomaly += 0.15;
    if (sensorData.motionLevel > 10) anomaly += 0.1;
    if (sensorData.wordDetected) anomaly += 0.3;
    anomaly += Math.min(0.15, (sensorData.emfDeviation || 0) / 30);
    this.anomalyLevel = Math.min(1, anomaly);

    // Gyroscope influence on rod sway
    const gyroGamma = (sensorData.gyroGamma || 0) * 0.3;
    const gyroBeta = (sensorData.gyroBeta || 0) * 0.15;

    // Base angles (rods apart)
    let baseLeft = -35;
    let baseRight = 35;

    // Anomaly causes rods to cross
    if (this.anomalyLevel > this.crossThreshold) {
      const crossAmount = (this.anomalyLevel - this.crossThreshold) / (1 - this.crossThreshold);
      // Rods move toward center and cross
      baseLeft = -35 + crossAmount * 55;  // -35 → +20 (crosses center)
      baseRight = 35 - crossAmount * 55;   // 35 → -20 (crosses center)
    }

    // Add gyro influence
    this.targetLeftAngle = baseLeft + gyroGamma - gyroBeta;
    this.targetRightAngle = baseRight + gyroGamma + gyroBeta;
  }

  _animate() {
    if (!this.active) return;
    this.animId = requestAnimationFrame(() => this._animate());

    // Smooth interpolation
    this.leftAngle += (this.targetLeftAngle - this.leftAngle) * this.smoothing;
    this.rightAngle += (this.targetRightAngle - this.rightAngle) * this.smoothing;

    // Ambient wobble
    this.wobblePhase += 0.02;
    const wobble = Math.sin(this.wobblePhase) * 1.5 + Math.sin(this.wobblePhase * 2.3) * 0.8;
    const leftFinal = this.leftAngle + wobble;
    const rightFinal = this.rightAngle - wobble * 0.7;

    this._draw(leftFinal, rightFinal);
  }

  _draw(leftAngle, rightAngle) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background overlay
    ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
    ctx.fillRect(0, 0, w, h);

    // Rod properties
    const pivotY = h * 0.88;
    const rodLength = h * 0.55;
    const handleLength = h * 0.15;
    const pivotLeftX = w * 0.38;
    const pivotRightX = w * 0.62;

    // Activity glow intensity
    const glowIntensity = 0.3 + this.anomalyLevel * 0.7;

    // Draw left rod
    this._drawRod(ctx, pivotLeftX, pivotY, rodLength, handleLength, leftAngle, glowIntensity, true);

    // Draw right rod
    this._drawRod(ctx, pivotRightX, pivotY, rodLength, handleLength, rightAngle, glowIntensity, false);

    // Draw pivot handles
    this._drawHandle(ctx, pivotLeftX, pivotY, handleLength);
    this._drawHandle(ctx, pivotRightX, pivotY, handleLength);

    // Anomaly indicator
    this._drawAnomalyMeter(ctx, w, h);

    // Label
    ctx.font = '12px system-ui';
    ctx.fillStyle = 'rgba(124, 77, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('DIGITAL DOWSING RODS', w / 2, 25);

    if (this.anomalyLevel > this.crossThreshold) {
      ctx.font = 'bold 16px system-ui';
      ctx.fillStyle = '#ff1744';
      ctx.fillText('RODS CROSSING — ANOMALY DETECTED', w / 2, 50);
    }
  }

  _drawRod(ctx, px, py, length, handleLen, angle, glow, isLeft) {
    const rad = angle * Math.PI / 180;

    // Rod tip position
    const tipX = px + Math.sin(rad) * length;
    const tipY = py - Math.cos(rad) * length;

    // Glow
    ctx.save();
    ctx.shadowColor = this.anomalyLevel > this.crossThreshold ? 'rgba(255, 23, 68, ' + glow + ')' : 'rgba(0, 229, 255, ' + glow + ')';
    ctx.shadowBlur = 8 + this.anomalyLevel * 20;

    // Rod line
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tipX, tipY);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    const gradient = ctx.createLinearGradient(px, py, tipX, tipY);
    if (this.anomalyLevel > this.crossThreshold) {
      gradient.addColorStop(0, '#ff1744');
      gradient.addColorStop(1, '#ff6e40');
    } else {
      gradient.addColorStop(0, '#00e5ff');
      gradient.addColorStop(1, '#7c4dff');
    }
    ctx.strokeStyle = gradient;
    ctx.stroke();

    // Rod tip ball
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4 + this.anomalyLevel * 3, 0, Math.PI * 2);
    ctx.fillStyle = this.anomalyLevel > this.crossThreshold ? '#ff1744' : '#00e5ff';
    ctx.fill();

    ctx.restore();
  }

  _drawHandle(ctx, px, py, length) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + length);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a4a6a';
    ctx.stroke();

    // Grip lines
    for (let i = 0; i < 3; i++) {
      const y = py + length * 0.3 + i * (length * 0.2);
      ctx.beginPath();
      ctx.moveTo(px - 4, y);
      ctx.lineTo(px + 4, y);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#6a6a8a';
      ctx.stroke();
    }
  }

  _drawAnomalyMeter(ctx, w, h) {
    const meterW = 120;
    const meterH = 8;
    const x = (w - meterW) / 2;
    const y = h - 40;

    // Background
    ctx.fillStyle = '#1a1a3a';
    ctx.beginPath();
    ctx.roundRect(x, y, meterW, meterH, 4);
    ctx.fill();

    // Fill
    const fillW = meterW * this.anomalyLevel;
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(x, y, x + meterW, y);
      grad.addColorStop(0, '#00e5ff');
      grad.addColorStop(0.5, '#7c4dff');
      grad.addColorStop(1, '#ff1744');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, fillW, meterH, 4);
      ctx.fill();
    }

    // Label
    ctx.font = '10px system-ui';
    ctx.fillStyle = '#9e9ec0';
    ctx.textAlign = 'center';
    ctx.fillText('Activity: ' + Math.round(this.anomalyLevel * 100) + '%', w / 2, y - 6);
  }

  isActive() {
    return this.active;
  }
}

window.DowsingRods = DowsingRods;
