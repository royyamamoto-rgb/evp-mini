/**
 * VisualAnomalyEngine — Camera filter processing and visual anomaly detection
 * 7 modes: normal, night-vision, edge-detect, false-color, motion-detect, motion-trails, full-spectrum
 */
class VisualAnomalyEngine {
  constructor() {
    // Offscreen canvas for processing
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.prevCanvas = document.createElement('canvas');
    this.prevCtx = this.prevCanvas.getContext('2d', { willReadFrequently: true });

    this.mode = 'normal';
    this.width = 0;
    this.height = 0;
    this.isInitialized = false;

    // Previous frame for motion detection
    this.prevGray = null;
    this.hasPrevFrame = false;

    // Motion trails buffer
    this.trailBuffer = null;
    this.trailDecay = 0.92;

    // Motion level tracking
    this.motionLevel = 0;
    this.motionHistory = [];
    this.maxMotionHistory = 300;

    // Anomaly tracking
    this.anomalies = [];
    this.maxAnomalies = 100;
    this.frameCount = 0;

    // Thermal color palette (256 entries)
    this.thermalPalette = this._buildThermalPalette();
  }

  setMode(mode) {
    this.mode = mode;
  }

  processFrame(videoElement) {
    if (!videoElement || videoElement.readyState < 2) return null;

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    if (vw === 0 || vh === 0) return null;

    // Initialize or resize
    if (this.width !== vw || this.height !== vh) {
      this.width = vw;
      this.height = vh;
      this.canvas.width = vw;
      this.canvas.height = vh;
      this.prevCanvas.width = vw;
      this.prevCanvas.height = vh;
      this.prevGray = null;
      this.hasPrevFrame = false;
      this.trailBuffer = null;
      this.isInitialized = true;
    }

    this.frameCount++;

    // Draw video frame
    this.ctx.drawImage(videoElement, 0, 0, vw, vh);

    if (this.mode === 'normal') {
      return this.ctx.getImageData(0, 0, vw, vh);
    }

    const imageData = this.ctx.getImageData(0, 0, vw, vh);
    const pixels = imageData.data;

    switch (this.mode) {
      case 'night-vision':
        this._applyNightVision(pixels);
        break;
      case 'edge-detect':
        this._applyEdgeDetection(imageData);
        break;
      case 'false-color':
        this._applyFalseColor(pixels);
        break;
      case 'motion-detect':
        this._applyMotionDetect(imageData);
        break;
      case 'motion-trails':
        this._applyMotionTrails(imageData);
        break;
      case 'full-spectrum':
        this._applyFullSpectrum(imageData);
        break;
    }

    // Store current as previous for next frame
    this._storePrevFrame(videoElement);

    return imageData;
  }

  _applyNightVision(pixels) {
    const gain = 3.0;
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const amplified = Math.min(255, lum * gain);
      pixels[i] = 0;                             // R
      pixels[i + 1] = Math.min(255, amplified);   // G (green tint)
      pixels[i + 2] = Math.min(255, amplified * 0.15); // B (slight blue)
      // Alpha unchanged
    }
  }

  _applyEdgeDetection(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;

    // Convert to grayscale first
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4;
      gray[i] = Math.round(0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
    }

    // Sobel operators
    const output = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        // Gx kernel
        const gx =
          -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
          - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
          - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
        // Gy kernel
        const gy =
          -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
          + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];

        output[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }

    // Write result with cyan tint
    for (let i = 0; i < output.length; i++) {
      const p = i * 4;
      const v = output[i];
      src[p] = 0;
      src[p + 1] = Math.min(255, v * 1.2);
      src[p + 2] = v;
      src[p + 3] = 255;
    }
  }

  _applyFalseColor(pixels) {
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
      const color = this.thermalPalette[lum];
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
    }
  }

  _applyMotionDetect(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;

    // Convert current to grayscale
    const currentGray = new Uint8Array(w * h);
    for (let i = 0; i < currentGray.length; i++) {
      const p = i * 4;
      currentGray[i] = Math.round(0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
    }

    if (this.prevGray && this.prevGray.length === currentGray.length) {
      let motionPixels = 0;
      const threshold = 25;

      for (let i = 0; i < currentGray.length; i++) {
        const diff = Math.abs(currentGray[i] - this.prevGray[i]);
        const p = i * 4;
        if (diff > threshold) {
          motionPixels++;
          // Highlight motion in purple
          const intensity = Math.min(255, diff * 3);
          src[p] = Math.min(255, intensity * 0.8);     // R
          src[p + 1] = 0;                                // G
          src[p + 2] = intensity;                        // B
          src[p + 3] = 255;
        } else {
          // Darken non-motion areas
          src[p] = Math.round(src[p] * 0.3);
          src[p + 1] = Math.round(src[p + 1] * 0.3);
          src[p + 2] = Math.round(src[p + 2] * 0.3);
        }
      }

      this.motionLevel = (motionPixels / currentGray.length) * 100;
      this._trackMotion(this.motionLevel);
    }

    this.prevGray = currentGray;
    this.hasPrevFrame = true;
  }

  _applyMotionTrails(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;
    const pixelCount = w * h;

    // Convert current to grayscale
    const currentGray = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const p = i * 4;
      currentGray[i] = Math.round(0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
    }

    // Initialize trail buffer if needed
    if (!this.trailBuffer || this.trailBuffer.length !== pixelCount) {
      this.trailBuffer = new Float32Array(pixelCount);
    }

    if (this.prevGray && this.prevGray.length === pixelCount) {
      let motionPixels = 0;

      for (let i = 0; i < pixelCount; i++) {
        const diff = Math.abs(currentGray[i] - this.prevGray[i]);
        // Accumulate with decay
        this.trailBuffer[i] = Math.max(this.trailBuffer[i] * this.trailDecay, diff);

        const trail = this.trailBuffer[i];
        const p = i * 4;

        if (trail > 15) {
          motionPixels++;
          const t = Math.min(1, trail / 150);
          // Ghost trail: blue -> cyan -> white
          src[p] = Math.round(t * 200);      // R
          src[p + 1] = Math.round(t * 255);  // G
          src[p + 2] = 255;                   // B
          src[p + 3] = Math.round(50 + t * 205);
        } else {
          // Dim background
          src[p] = Math.round(src[p] * 0.15);
          src[p + 1] = Math.round(src[p + 1] * 0.15);
          src[p + 2] = Math.round(src[p + 2] * 0.2);
          src[p + 3] = 255;
        }
      }

      this.motionLevel = (motionPixels / pixelCount) * 100;
      this._trackMotion(this.motionLevel);
    }

    this.prevGray = currentGray;
    this.hasPrevFrame = true;
  }

  _applyFullSpectrum(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;

    // Step 1: CLAHE-like contrast enhancement (simplified global histogram equalization)
    const gray = new Uint8Array(w * h);
    const histogram = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4;
      gray[i] = Math.round(0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
      histogram[gray[i]]++;
    }

    // Build CDF
    const cdf = new Uint32Array(256);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + histogram[i];
    const cdfMin = cdf.find(v => v > 0) || 1;
    const total = w * h;

    // Equalized grayscale
    const equalized = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      equalized[i] = Math.round(((cdf[gray[i]] - cdfMin) / (total - cdfMin)) * 255);
    }

    // Step 2: Edge detection on equalized
    const edges = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const gx =
          -equalized[(y - 1) * w + (x - 1)] + equalized[(y - 1) * w + (x + 1)]
          - 2 * equalized[y * w + (x - 1)] + 2 * equalized[y * w + (x + 1)]
          - equalized[(y + 1) * w + (x - 1)] + equalized[(y + 1) * w + (x + 1)];
        const gy =
          -equalized[(y - 1) * w + (x - 1)] - 2 * equalized[(y - 1) * w + x] - equalized[(y - 1) * w + (x + 1)]
          + equalized[(y + 1) * w + (x - 1)] + 2 * equalized[(y + 1) * w + x] + equalized[(y + 1) * w + (x + 1)];
        edges[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }

    // Step 3: Combine false color + edge overlay (30% opacity)
    for (let i = 0; i < equalized.length; i++) {
      const p = i * 4;
      const color = this.thermalPalette[equalized[i]];
      const edgeVal = edges[i] / 255;
      const edgeBlend = 0.3;

      src[p] = Math.min(255, Math.round(color[0] * (1 - edgeBlend) + edgeVal * 255 * edgeBlend));
      src[p + 1] = Math.min(255, Math.round(color[1] * (1 - edgeBlend) + edgeVal * 200 * edgeBlend));
      src[p + 2] = Math.min(255, Math.round(color[2] * (1 - edgeBlend) + edgeVal * 255 * edgeBlend));
      src[p + 3] = 255;
    }

    // Motion detection for this mode
    if (this.prevGray && this.prevGray.length === gray.length) {
      let motionPixels = 0;
      for (let i = 0; i < gray.length; i++) {
        if (Math.abs(gray[i] - this.prevGray[i]) > 25) motionPixels++;
      }
      this.motionLevel = (motionPixels / gray.length) * 100;
      this._trackMotion(this.motionLevel);
    }
    this.prevGray = gray;
    this.hasPrevFrame = true;
  }

  _storePrevFrame(videoElement) {
    // Only store for modes that don't already update prevGray
    if (this.mode === 'normal' || this.mode === 'night-vision' || this.mode === 'edge-detect' || this.mode === 'false-color') {
      this.prevCtx.drawImage(videoElement, 0, 0, this.width, this.height);
      const prevData = this.prevCtx.getImageData(0, 0, this.width, this.height);
      const src = prevData.data;
      this.prevGray = new Uint8Array(this.width * this.height);
      for (let i = 0; i < this.prevGray.length; i++) {
        const p = i * 4;
        this.prevGray[i] = Math.round(0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2]);
      }
      this.hasPrevFrame = true;

      // Compute motion level even in non-motion modes
      if (this.prevGray) {
        const currentData = this.ctx.getImageData(0, 0, this.width, this.height);
        const curSrc = currentData.data;
        const curGray = new Uint8Array(this.width * this.height);
        for (let i = 0; i < curGray.length; i++) {
          const p = i * 4;
          curGray[i] = Math.round(0.299 * curSrc[p] + 0.587 * curSrc[p + 1] + 0.114 * curSrc[p + 2]);
        }
        // Simple motion check
        let mp = 0;
        for (let i = 0; i < curGray.length; i++) {
          if (Math.abs(curGray[i] - this.prevGray[i]) > 25) mp++;
        }
        this.motionLevel = (mp / curGray.length) * 100;
      }
    }
  }

  _trackMotion(level) {
    this.motionHistory.push({ frame: this.frameCount, level: level });
    if (this.motionHistory.length > this.maxMotionHistory) {
      this.motionHistory.shift();
    }

    // Log anomaly if high motion detected
    if (level > 15 && this.anomalies.length < this.maxAnomalies) {
      const lastAnomaly = this.anomalies[this.anomalies.length - 1];
      if (!lastAnomaly || this.frameCount - lastAnomaly.frame > 30) {
        this.anomalies.push({
          frame: this.frameCount,
          timeSeconds: this.frameCount / 30,
          level: level,
          mode: this.mode
        });
      }
    }
  }

  _buildThermalPalette() {
    // Thermal palette: black -> blue -> cyan -> green -> yellow -> red -> white
    const palette = new Array(256);
    const stops = [
      [0, 0, 0, 0],        // 0: black
      [36, 0, 0, 180],     // 36: dark blue
      [72, 0, 180, 220],   // 72: cyan
      [108, 0, 200, 0],    // 108: green
      [144, 255, 255, 0],  // 144: yellow
      [180, 255, 130, 0],  // 180: orange
      [216, 255, 0, 0],    // 216: red
      [255, 255, 255, 255] // 255: white
    ];

    for (let i = 0; i < 256; i++) {
      // Find surrounding stops
      let lo = stops[0], hi = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (i >= stops[s][0] && i <= stops[s + 1][0]) {
          lo = stops[s];
          hi = stops[s + 1];
          break;
        }
      }
      const range = hi[0] - lo[0] || 1;
      const t = (i - lo[0]) / range;
      palette[i] = [
        Math.round(lo[1] + (hi[1] - lo[1]) * t),
        Math.round(lo[2] + (hi[2] - lo[2]) * t),
        Math.round(lo[3] + (hi[3] - lo[3]) * t)
      ];
    }
    return palette;
  }

  getMotionLevel() {
    return this.motionLevel;
  }

  getAnomalies() {
    return [...this.anomalies];
  }

  getMotionTrailData() {
    return this.trailBuffer ? new Float32Array(this.trailBuffer) : null;
  }

  fullAnalysis() {
    const avgMotion = this.motionHistory.length > 0
      ? this.motionHistory.reduce((a, b) => a + b.level, 0) / this.motionHistory.length
      : 0;
    const peakMotion = this.motionHistory.length > 0
      ? Math.max(...this.motionHistory.map(m => m.level))
      : 0;

    return {
      totalFrames: this.frameCount,
      averageMotionLevel: avgMotion,
      peakMotionLevel: peakMotion,
      anomalies: [...this.anomalies],
      totalAnomalies: this.anomalies.length,
      lastMode: this.mode
    };
  }

  clearAll() {
    this.prevGray = null;
    this.hasPrevFrame = false;
    this.trailBuffer = null;
    this.motionLevel = 0;
    this.motionHistory = [];
    this.anomalies = [];
    this.frameCount = 0;
  }
}

window.VisualAnomalyEngine = VisualAnomalyEngine;
