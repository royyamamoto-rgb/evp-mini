/**
 * VisualAnomalyEngine - Camera visual filter and anomaly detection engine
 * for the EVP-MINI paranormal investigation PWA.
 *
 * 7 visual modes via Canvas 2D pixel manipulation:
 *   normal, nightvision, edge, falsecolor, motion, motiontrails, fullspectrum
 *
 * Class-based ES6 - no imports/exports.
 */
class VisualAnomalyEngine {

  constructor() {
    // Internal off-screen canvases for processing
    this._srcCanvas = null;
    this._srcCtx = null;
    this._dstCanvas = null;
    this._dstCtx = null;

    // Dimensions
    this._width = 0;
    this._height = 0;
    this._pixelCount = 0;
    this._initialized = false;

    // Previous frame buffer (raw RGBA Uint8ClampedArray) for motion detection
    this._prevFrameData = null;
    this._hasPrevFrame = false;

    // Motion accumulation buffer for trails mode (Float32Array, one value per pixel)
    this._motionAccumBuffer = null;

    // Current visual mode
    this._mode = 'normal';
    this._validModes = [
      'normal', 'nightvision', 'edge', 'falsecolor',
      'motion', 'motiontrails', 'fullspectrum'
    ];

    // Motion level 0-100
    this._motionLevel = 0;
    this._motionHistory = [];

    // Frame counter
    this._frameCount = 0;

    // Anomaly tracking
    this._anomalyTimestamps = [];
    this._totalAnomalyCount = 0;

    // Modes used during session
    this._modesUsed = new Set();
    this._modesUsed.add('normal');

    // Performance / FPS tracking
    this._frameTimes = [];
    this._maxFrameTimeSamples = 120;

    // Peak motion
    this._peakMotionLevel = 0;
    this._motionLevelSum = 0;
    this._motionLevelCount = 0;

    // Pre-built thermal palette (256 RGB entries)
    this._thermalPalette = this._buildThermalPalette();

    // Grayscale buffer (reused across frames to reduce allocations)
    this._grayBuffer = null;
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Create off-screen canvases and initialize buffers for the given dimensions.
   * Must be called before processFrame.
   */
  init(width, height) {
    this._width = width;
    this._height = height;
    this._pixelCount = width * height;

    // Source canvas - we draw the video frame here
    this._srcCanvas = document.createElement('canvas');
    this._srcCanvas.width = width;
    this._srcCanvas.height = height;
    this._srcCtx = this._srcCanvas.getContext('2d', { willReadFrequently: true });

    // Destination canvas - we write processed output here
    this._dstCanvas = document.createElement('canvas');
    this._dstCanvas.width = width;
    this._dstCanvas.height = height;
    this._dstCtx = this._dstCanvas.getContext('2d', { willReadFrequently: true });

    // Previous frame buffer (RGBA)
    this._prevFrameData = null;
    this._hasPrevFrame = false;

    // Motion accumulation buffer for trails
    this._motionAccumBuffer = new Float32Array(this._pixelCount);

    // Reusable grayscale buffer
    this._grayBuffer = new Uint8Array(this._pixelCount);

    this._initialized = true;
  }

  // ---------------------------------------------------------------------------
  // Mode management
  // ---------------------------------------------------------------------------

  /**
   * Set the current visual processing mode.
   * Resets mode-specific state when switching.
   */
  setMode(mode) {
    if (this._validModes.indexOf(mode) === -1) {
      console.warn('VisualAnomalyEngine: invalid mode "' + mode + '"');
      return;
    }
    var previousMode = this._mode;
    this._mode = mode;
    this._modesUsed.add(mode);

    // Reset mode-specific state on switch
    if (previousMode !== mode) {
      if (mode === 'motiontrails' && this._motionAccumBuffer) {
        // Clear accumulation buffer when entering trails mode fresh
        this._motionAccumBuffer.fill(0);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Main frame processing
  // ---------------------------------------------------------------------------

  /**
   * Process a single video frame.
   *
   * @param {HTMLVideoElement} video  - source video element
   * @param {HTMLCanvasElement} outputCanvas - destination canvas to render to
   * @returns {Object} Frame analysis result
   */
  processFrame(video, outputCanvas) {
    var startTime = performance.now();

    if (!video || video.readyState < 2) {
      return null;
    }

    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (vw === 0 || vh === 0) return null;

    // Re-init if dimensions changed
    if (!this._initialized || this._width !== vw || this._height !== vh) {
      this.init(vw, vh);
    }

    this._frameCount++;

    // Step 1: Draw video to internal source canvas
    this._srcCtx.drawImage(video, 0, 0, this._width, this._height);

    // Step 2: Get pixel data
    var srcImageData = this._srcCtx.getImageData(0, 0, this._width, this._height);
    var srcData = srcImageData.data;

    // Step 3: Create output image data
    var outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });

    // Ensure output canvas matches dimensions
    if (outputCanvas.width !== this._width || outputCanvas.height !== this._height) {
      outputCanvas.width = this._width;
      outputCanvas.height = this._height;
    }

    var dstImageData = outCtx.createImageData(this._width, this._height);
    var dstData = dstImageData.data;

    // Step 4: Apply current mode's algorithm
    switch (this._mode) {
      case 'normal':
        this._processNormal(srcData, dstData);
        break;
      case 'nightvision':
        this._processNightVision(srcData, dstData);
        break;
      case 'edge':
        this._processEdgeDetect(srcData, dstData, this._width, this._height);
        break;
      case 'falsecolor':
        this._processFalseColor(srcData, dstData);
        break;
      case 'motion':
        this._processMotionDetect(srcData, this._prevFrameData, dstData, this._width, this._height);
        break;
      case 'motiontrails':
        this._processMotionTrails(srcData, this._prevFrameData, dstData, this._motionAccumBuffer, this._width, this._height);
        break;
      case 'fullspectrum':
        this._processFullSpectrum(srcData, dstData, this._width, this._height);
        break;
      default:
        this._processNormal(srcData, dstData);
        break;
    }

    // Step 5: Put processed pixels to output canvas
    outCtx.putImageData(dstImageData, 0, 0);

    // Step 6: Compute motion level for modes that don't compute it internally
    if (this._mode === 'normal' || this._mode === 'nightvision' ||
        this._mode === 'edge' || this._mode === 'falsecolor') {
      this._computeMotionLevelFromFrames(srcData);
    }

    // Step 7: Detect visual anomalies via motion data
    var anomalyRegions = [];
    if (this._hasPrevFrame && this._prevFrameData) {
      anomalyRegions = this._detectAnomalies(srcData, this._width, this._height);
    }
    var anomalyDetected = anomalyRegions.length > 0;

    // Track anomalies
    if (anomalyDetected) {
      this._totalAnomalyCount += anomalyRegions.length;
      this._anomalyTimestamps.push({
        time: this._frameCount / 30,
        frame: this._frameCount,
        motionLevel: this._motionLevel,
        regions: anomalyRegions.slice()
      });
      // Keep anomaly log bounded
      if (this._anomalyTimestamps.length > 500) {
        this._anomalyTimestamps = this._anomalyTimestamps.slice(-250);
      }
    }

    // Step 8: Update motion stats
    this._motionLevelSum += this._motionLevel;
    this._motionLevelCount++;
    if (this._motionLevel > this._peakMotionLevel) {
      this._peakMotionLevel = this._motionLevel;
    }

    // Step 9: Store current frame as previous for next iteration
    this._prevFrameData = new Uint8ClampedArray(srcData);
    this._hasPrevFrame = true;

    // Timing
    var endTime = performance.now();
    var processTime = endTime - startTime;
    this._frameTimes.push(processTime);
    if (this._frameTimes.length > this._maxFrameTimeSamples) {
      this._frameTimes.shift();
    }

    // Return frame analysis
    return {
      motionLevel: this._motionLevel,
      anomalyDetected: anomalyDetected,
      anomalyRegions: anomalyRegions,
      mode: this._mode,
      processTime: processTime
    };
  }

  // ---------------------------------------------------------------------------
  // Individual mode processors
  // ---------------------------------------------------------------------------

  /**
   * Normal mode: direct copy (pass-through).
   */
  _processNormal(srcData, dstData) {
    for (var i = 0, len = srcData.length; i < len; i++) {
      dstData[i] = srcData[i];
    }
  }

  /**
   * Night vision: convert to luminance, amplify 2-4x, apply green tint.
   * Adds scanline effect (every 3rd row slightly dimmer).
   */
  _processNightVision(srcData, dstData) {
    var gain = 3.0;
    var w = this._width;
    var len = this._pixelCount;

    for (var i = 0; i < len; i++) {
      var p = i << 2; // i * 4
      var r = srcData[p];
      var g = srcData[p + 1];
      var b = srcData[p + 2];

      // Luminance
      var L = 0.299 * r + 0.587 * g + 0.114 * b;
      var amplified = L * gain;

      // Clamp
      if (amplified > 255) amplified = 255;

      // Scanline effect: every 3rd row is dimmer
      var row = (i / w) | 0;
      var scanlineFactor = (row % 3 === 0) ? 0.75 : 1.0;

      var greenVal = amplified * scanlineFactor;
      if (greenVal > 255) greenVal = 255;

      dstData[p] = 0;                             // R = 0
      dstData[p + 1] = greenVal | 0;              // G = amplified luminance
      dstData[p + 2] = 0;                         // B = 0
      dstData[p + 3] = 255;                       // A = 255
    }
  }

  /**
   * Sobel edge detection.
   * Pre-computes grayscale buffer, applies 3x3 Sobel kernels, thresholds at 30.
   * Edges rendered in cyan (#00e5ff), background in near-black (#0a0a14).
   */
  _processEdgeDetect(srcData, dstData, width, height) {
    var pixelCount = width * height;
    var gray = this._grayBuffer;

    // Pre-compute grayscale buffer
    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;
      gray[i] = (0.299 * srcData[p] + 0.587 * srcData[p + 1] + 0.114 * srcData[p + 2]) | 0;
    }

    // Sobel kernels:
    //   Gx = [[-1,0,1],[-2,0,2],[-1,0,1]]
    //   Gy = [[-1,-2,-1],[0,0,0],[1,2,1]]

    // Fill borders with background color
    var bgR = 10, bgG = 10, bgB = 20;
    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;
      dstData[p] = bgR;
      dstData[p + 1] = bgG;
      dstData[p + 2] = bgB;
      dstData[p + 3] = 255;
    }

    // Process interior pixels (skip 1-pixel border)
    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var idx = y * width + x;

        // Row indices
        var rowAbove = (y - 1) * width;
        var rowCurr = y * width;
        var rowBelow = (y + 1) * width;

        // Gx
        var gx = -gray[rowAbove + x - 1] + gray[rowAbove + x + 1]
               - 2 * gray[rowCurr + x - 1] + 2 * gray[rowCurr + x + 1]
               - gray[rowBelow + x - 1] + gray[rowBelow + x + 1];

        // Gy
        var gy = -gray[rowAbove + x - 1] - 2 * gray[rowAbove + x] - gray[rowAbove + x + 1]
               + gray[rowBelow + x - 1] + 2 * gray[rowBelow + x] + gray[rowBelow + x + 1];

        var magnitude = Math.sqrt(gx * gx + gy * gy);

        var p = idx << 2;

        if (magnitude > 30) {
          // Cyan edge (#00e5ff) with intensity based on magnitude
          var intensity = magnitude / 255;
          if (intensity > 1) intensity = 1;
          // Blend cyan with background based on magnitude
          dstData[p] = (bgR + (0 - bgR) * intensity) | 0;        // R -> 0
          dstData[p + 1] = (bgG + (229 - bgG) * intensity) | 0;  // G -> 229
          dstData[p + 2] = (bgB + (255 - bgB) * intensity) | 0;  // B -> 255
          dstData[p + 3] = 255;
        }
        // else: already filled with background color
      }
    }
  }

  /**
   * False color: convert to grayscale, map through thermal palette.
   * Palette: black -> dark blue -> blue -> cyan -> green -> yellow -> orange -> red -> white
   */
  _processFalseColor(srcData, dstData) {
    var palette = this._thermalPalette;
    var len = this._pixelCount;

    for (var i = 0; i < len; i++) {
      var p = i << 2;
      var grayVal = (0.299 * srcData[p] + 0.587 * srcData[p + 1] + 0.114 * srcData[p + 2]) | 0;
      if (grayVal > 255) grayVal = 255;
      if (grayVal < 0) grayVal = 0;

      var color = palette[grayVal];
      dstData[p] = color[0];
      dstData[p + 1] = color[1];
      dstData[p + 2] = color[2];
      dstData[p + 3] = 255;
    }
  }

  /**
   * Motion detection via frame differencing.
   * Per-channel abs difference, threshold at 25 per channel (75 sum).
   * Motion pixels highlighted in cyan, non-motion very dim.
   */
  _processMotionDetect(srcData, prevData, dstData, width, height) {
    var pixelCount = width * height;
    var changedPixels = 0;

    if (!prevData) {
      // No previous frame yet, show dim version of source
      for (var i = 0; i < pixelCount; i++) {
        var p = i << 2;
        dstData[p] = (srcData[p] * 0.15) | 0;
        dstData[p + 1] = (srcData[p + 1] * 0.15) | 0;
        dstData[p + 2] = (srcData[p + 2] * 0.15) | 0;
        dstData[p + 3] = 255;
      }
      this._motionLevel = 0;
      return;
    }

    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;

      var diffR = srcData[p] - prevData[p];
      if (diffR < 0) diffR = -diffR;
      var diffG = srcData[p + 1] - prevData[p + 1];
      if (diffG < 0) diffG = -diffG;
      var diffB = srcData[p + 2] - prevData[p + 2];
      if (diffB < 0) diffB = -diffB;

      var diff = diffR + diffG + diffB;

      if (diff > 75) {
        // Motion pixel: highlight in cyan (0, 229, 255)
        changedPixels++;
        var alpha = diff;
        if (alpha > 255) alpha = 255;
        dstData[p] = 0;
        dstData[p + 1] = 229;
        dstData[p + 2] = 255;
        dstData[p + 3] = alpha;
      } else {
        // Non-motion: very dim version of source
        dstData[p] = (srcData[p] * 0.15) | 0;
        dstData[p + 1] = (srcData[p + 1] * 0.15) | 0;
        dstData[p + 2] = (srcData[p + 2] * 0.15) | 0;
        dstData[p + 3] = 255;
      }
    }

    this._motionLevel = (changedPixels / pixelCount) * 100;
  }

  /**
   * Motion trails: accumulate motion-detected pixels with exponential decay.
   * Overlay with purple -> cyan color gradient based on age.
   */
  _processMotionTrails(srcData, prevData, dstData, accumBuffer, width, height) {
    var pixelCount = width * height;
    var changedPixels = 0;
    var decayFactor = 0.92;

    if (!prevData) {
      // No previous frame yet: show dim source, initialize accum buffer
      for (var i = 0; i < pixelCount; i++) {
        var p = i << 2;
        dstData[p] = (srcData[p] * 0.15) | 0;
        dstData[p + 1] = (srcData[p + 1] * 0.15) | 0;
        dstData[p + 2] = (srcData[p + 2] * 0.15) | 0;
        dstData[p + 3] = 255;
        accumBuffer[i] = 0;
      }
      this._motionLevel = 0;
      return;
    }

    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;

      // Detect motion: per-channel difference
      var diffR = srcData[p] - prevData[p];
      if (diffR < 0) diffR = -diffR;
      var diffG = srcData[p + 1] - prevData[p + 1];
      if (diffG < 0) diffG = -diffG;
      var diffB = srcData[p + 2] - prevData[p + 2];
      if (diffB < 0) diffB = -diffB;

      var diff = diffR + diffG + diffB;

      // If motion detected, set accumBuffer to 255
      if (diff > 75) {
        accumBuffer[i] = 255;
        changedPixels++;
      }

      // Decay all accumBuffer values
      accumBuffer[i] *= decayFactor;

      var accVal = accumBuffer[i];

      if (accVal > 10) {
        // Map accum value to gradient: high = cyan, medium = purple, low = dark blue
        //   255 -> cyan  (0, 229, 255)
        //   128 -> purple (156, 39, 176)
        //    10 -> dark blue (13, 13, 80)
        var t = (accVal - 10) / 245; // 0..1
        if (t > 1) t = 1;

        var outR, outG, outB;
        if (t > 0.5) {
          // purple -> cyan (t: 0.5 -> 1.0)
          var t2 = (t - 0.5) * 2; // 0..1
          outR = (156 * (1 - t2) + 0 * t2) | 0;
          outG = (39 * (1 - t2) + 229 * t2) | 0;
          outB = (176 * (1 - t2) + 255 * t2) | 0;
        } else {
          // dark blue -> purple (t: 0.0 -> 0.5)
          var t2 = t * 2; // 0..1
          outR = (13 * (1 - t2) + 156 * t2) | 0;
          outG = (13 * (1 - t2) + 39 * t2) | 0;
          outB = (80 * (1 - t2) + 176 * t2) | 0;
        }

        // Blend with dim source frame
        var blendFactor = 0.3; // source contribution
        var trailFactor = 1.0 - blendFactor;
        var dimR = (srcData[p] * 0.15) | 0;
        var dimG = (srcData[p + 1] * 0.15) | 0;
        var dimB = (srcData[p + 2] * 0.15) | 0;

        dstData[p] = (dimR * blendFactor + outR * trailFactor) | 0;
        dstData[p + 1] = (dimG * blendFactor + outG * trailFactor) | 0;
        dstData[p + 2] = (dimB * blendFactor + outB * trailFactor) | 0;
        dstData[p + 3] = 255;
      } else {
        // Show very dim source
        dstData[p] = (srcData[p] * 0.15) | 0;
        dstData[p + 1] = (srcData[p + 1] * 0.15) | 0;
        dstData[p + 2] = (srcData[p + 2] * 0.15) | 0;
        dstData[p + 3] = 255;
      }
    }

    this._motionLevel = (changedPixels / pixelCount) * 100;
  }

  /**
   * Full spectrum mode:
   *  1. CLAHE-like contrast enhancement (tile-based, 8x8 grid)
   *  2. False color mapping on enhanced image
   *  3. Sobel edge overlay at 30% opacity in cyan
   */
  _processFullSpectrum(srcData, dstData, width, height) {
    var pixelCount = width * height;
    var gray = this._grayBuffer;

    // --- Step 1: Compute luminance ---
    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;
      gray[i] = (0.299 * srcData[p] + 0.587 * srcData[p + 1] + 0.114 * srcData[p + 2]) | 0;
    }

    // --- Step 2: CLAHE-inspired contrast enhancement (simplified tile-based) ---
    var tilesX = 8;
    var tilesY = 8;
    var tileW = (width / tilesX) | 0;
    var tileH = (height / tilesY) | 0;

    // Build CDF for each tile
    // Store as array of 256-length Float32Arrays (CDF maps)
    var tileCDFs = new Array(tilesX * tilesY);

    for (var ty = 0; ty < tilesY; ty++) {
      for (var tx = 0; tx < tilesX; tx++) {
        var tileIdx = ty * tilesX + tx;
        var startX = tx * tileW;
        var startY = ty * tileH;
        var endX = (tx === tilesX - 1) ? width : startX + tileW;
        var endY = (ty === tilesY - 1) ? height : startY + tileH;

        // Build histogram for this tile
        var hist = new Uint32Array(256);
        var tilePixelCount = 0;

        for (var py = startY; py < endY; py++) {
          for (var px = startX; px < endX; px++) {
            hist[gray[py * width + px]]++;
            tilePixelCount++;
          }
        }

        // Clip histogram at 4x average and redistribute
        var avgBin = tilePixelCount / 256;
        var clipLimit = (avgBin * 4) | 0;
        if (clipLimit < 1) clipLimit = 1;
        var excess = 0;

        for (var b = 0; b < 256; b++) {
          if (hist[b] > clipLimit) {
            excess += hist[b] - clipLimit;
            hist[b] = clipLimit;
          }
        }

        // Redistribute excess evenly
        var redistPerBin = (excess / 256) | 0;
        var residual = excess - redistPerBin * 256;
        for (var b = 0; b < 256; b++) {
          hist[b] += redistPerBin;
        }
        // Spread residual across first bins
        for (var b = 0; b < residual; b++) {
          hist[b]++;
        }

        // Build CDF
        var cdf = new Float32Array(256);
        cdf[0] = hist[0];
        for (var b = 1; b < 256; b++) {
          cdf[b] = cdf[b - 1] + hist[b];
        }

        // Normalize CDF to 0-255
        var cdfMin = 0;
        for (var b = 0; b < 256; b++) {
          if (cdf[b] > 0) { cdfMin = cdf[b]; break; }
        }
        var cdfMax = cdf[255];
        var cdfRange = cdfMax - cdfMin;
        if (cdfRange < 1) cdfRange = 1;

        for (var b = 0; b < 256; b++) {
          cdf[b] = ((cdf[b] - cdfMin) / cdfRange) * 255;
          if (cdf[b] < 0) cdf[b] = 0;
          if (cdf[b] > 255) cdf[b] = 255;
        }

        tileCDFs[tileIdx] = cdf;
      }
    }

    // Apply CLAHE: for each pixel, bilinear interpolation between 4 nearest tile CDFs
    var enhanced = new Uint8Array(pixelCount);

    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var idx = y * width + x;
        var grayVal = gray[idx];

        // Find which tile center this pixel is relative to
        // Tile centers
        var fx = (x / tileW) - 0.5;
        var fy = (y / tileH) - 0.5;

        var tx0 = fx | 0;
        var ty0 = fy | 0;

        // Clamp tile indices
        if (tx0 < 0) tx0 = 0;
        if (ty0 < 0) ty0 = 0;
        var tx1 = tx0 + 1;
        var ty1 = ty0 + 1;
        if (tx1 >= tilesX) tx1 = tilesX - 1;
        if (ty1 >= tilesY) ty1 = tilesY - 1;

        // Interpolation factors
        var sx = fx - tx0;
        var sy = fy - ty0;
        if (sx < 0) sx = 0;
        if (sx > 1) sx = 1;
        if (sy < 0) sy = 0;
        if (sy > 1) sy = 1;

        // Look up in 4 tile CDFs
        var v00 = tileCDFs[ty0 * tilesX + tx0][grayVal];
        var v10 = tileCDFs[ty0 * tilesX + tx1][grayVal];
        var v01 = tileCDFs[ty1 * tilesX + tx0][grayVal];
        var v11 = tileCDFs[ty1 * tilesX + tx1][grayVal];

        // Bilinear interpolation
        var top = v00 * (1 - sx) + v10 * sx;
        var bottom = v01 * (1 - sx) + v11 * sx;
        var val = top * (1 - sy) + bottom * sy;

        if (val < 0) val = 0;
        if (val > 255) val = 255;
        enhanced[idx] = val | 0;
      }
    }

    // --- Step 3: Compute Sobel edges on enhanced image ---
    var edges = new Uint8Array(pixelCount);

    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var idx = y * width + x;

        var rowAbove = (y - 1) * width;
        var rowCurr = y * width;
        var rowBelow = (y + 1) * width;

        var gx = -enhanced[rowAbove + x - 1] + enhanced[rowAbove + x + 1]
               - 2 * enhanced[rowCurr + x - 1] + 2 * enhanced[rowCurr + x + 1]
               - enhanced[rowBelow + x - 1] + enhanced[rowBelow + x + 1];

        var gy = -enhanced[rowAbove + x - 1] - 2 * enhanced[rowAbove + x] - enhanced[rowAbove + x + 1]
               + enhanced[rowBelow + x - 1] + 2 * enhanced[rowBelow + x] + enhanced[rowBelow + x + 1];

        var mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > 255) mag = 255;
        edges[idx] = mag | 0;
      }
    }

    // --- Step 4: Apply false color to enhanced + overlay edges at 30% opacity ---
    var palette = this._thermalPalette;
    var edgeOpacity = 0.3;
    var baseOpacity = 1.0 - edgeOpacity;

    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;
      var eVal = enhanced[i];
      var color = palette[eVal];

      var edgeNorm = edges[i] / 255;

      // Base false color
      var bR = color[0];
      var bG = color[1];
      var bB = color[2];

      // Edge overlay in cyan (0, 229, 255)
      var eR = 0 * edgeNorm;
      var eG = 229 * edgeNorm;
      var eB = 255 * edgeNorm;

      dstData[p] = (bR * baseOpacity + eR * edgeOpacity) | 0;
      dstData[p + 1] = (bG * baseOpacity + eG * edgeOpacity) | 0;
      dstData[p + 2] = (bB * baseOpacity + eB * edgeOpacity) | 0;
      dstData[p + 3] = 255;

      // Clamp
      if (dstData[p] > 255) dstData[p] = 255;
      if (dstData[p + 1] > 255) dstData[p + 1] = 255;
      if (dstData[p + 2] > 255) dstData[p + 2] = 255;
    }

    // --- Step 5: Compute motion level for this mode ---
    if (this._prevFrameData) {
      var changedPixels = 0;
      for (var i = 0; i < pixelCount; i++) {
        var p = i << 2;
        var diffR = srcData[p] - this._prevFrameData[p];
        if (diffR < 0) diffR = -diffR;
        var diffG = srcData[p + 1] - this._prevFrameData[p + 1];
        if (diffG < 0) diffG = -diffG;
        var diffB = srcData[p + 2] - this._prevFrameData[p + 2];
        if (diffB < 0) diffB = -diffB;
        if (diffR + diffG + diffB > 75) {
          changedPixels++;
        }
      }
      this._motionLevel = (changedPixels / pixelCount) * 100;
    }
  }

  // ---------------------------------------------------------------------------
  // Motion & anomaly detection helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute motion level from current and previous raw RGBA frame data.
   * Used by modes that do not compute motion internally.
   */
  _computeMotionLevelFromFrames(srcData) {
    if (!this._prevFrameData || !this._hasPrevFrame) {
      this._motionLevel = 0;
      return;
    }

    var prevData = this._prevFrameData;
    var pixelCount = this._pixelCount;
    var changedPixels = 0;

    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;
      var diffR = srcData[p] - prevData[p];
      if (diffR < 0) diffR = -diffR;
      var diffG = srcData[p + 1] - prevData[p + 1];
      if (diffG < 0) diffG = -diffG;
      var diffB = srcData[p + 2] - prevData[p + 2];
      if (diffB < 0) diffB = -diffB;

      if (diffR + diffG + diffB > 75) {
        changedPixels++;
      }
    }

    this._motionLevel = (changedPixels / pixelCount) * 100;
  }

  /**
   * Detect anomaly regions using connected-component labeling (union-find)
   * on motion pixels. Returns array of bounding boxes for clusters > 50 pixels.
   */
  _detectAnomalies(srcData, width, height) {
    if (!this._prevFrameData) return [];

    var prevData = this._prevFrameData;
    var pixelCount = width * height;

    // Build binary motion mask
    var motionMask = new Uint8Array(pixelCount);
    for (var i = 0; i < pixelCount; i++) {
      var p = i << 2;
      var diffR = srcData[p] - prevData[p];
      if (diffR < 0) diffR = -diffR;
      var diffG = srcData[p + 1] - prevData[p + 1];
      if (diffG < 0) diffG = -diffG;
      var diffB = srcData[p + 2] - prevData[p + 2];
      if (diffB < 0) diffB = -diffB;

      if (diffR + diffG + diffB > 75) {
        motionMask[i] = 1;
      }
    }

    // Union-Find data structure
    var parent = new Int32Array(pixelCount);
    var rank = new Uint8Array(pixelCount);
    for (var i = 0; i < pixelCount; i++) {
      parent[i] = i;
    }

    // Find with path compression
    function find(x) {
      var root = x;
      while (parent[root] !== root) {
        root = parent[root];
      }
      // Path compression
      while (parent[x] !== root) {
        var next = parent[x];
        parent[x] = root;
        x = next;
      }
      return root;
    }

    // Union by rank
    function union(a, b) {
      var ra = find(a);
      var rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
      } else {
        parent[rb] = ra;
        rank[ra]++;
      }
    }

    // Connected component labeling (4-connectivity)
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var idx = y * width + x;
        if (!motionMask[idx]) continue;

        // Check left neighbor
        if (x > 0 && motionMask[idx - 1]) {
          union(idx, idx - 1);
        }
        // Check top neighbor
        if (y > 0 && motionMask[idx - width]) {
          union(idx, idx - width);
        }
      }
    }

    // Collect component bounding boxes and sizes
    // Map from root -> { minX, minY, maxX, maxY, count, intensitySum }
    var components = {};

    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var idx = y * width + x;
        if (!motionMask[idx]) continue;

        var root = find(idx);

        if (!(root in components)) {
          components[root] = {
            minX: x,
            minY: y,
            maxX: x,
            maxY: y,
            count: 0,
            intensitySum: 0
          };
        }

        var comp = components[root];
        if (x < comp.minX) comp.minX = x;
        if (y < comp.minY) comp.minY = y;
        if (x > comp.maxX) comp.maxX = x;
        if (y > comp.maxY) comp.maxY = y;
        comp.count++;

        // Accumulate intensity (sum of per-channel diffs)
        var p = idx << 2;
        var dR = srcData[p] - prevData[p];
        if (dR < 0) dR = -dR;
        var dG = srcData[p + 1] - prevData[p + 1];
        if (dG < 0) dG = -dG;
        var dB = srcData[p + 2] - prevData[p + 2];
        if (dB < 0) dB = -dB;
        comp.intensitySum += dR + dG + dB;
      }
    }

    // Filter: clusters > 50 pixels that are roughly rectangular
    var anomalyRegions = [];
    var keys = Object.keys(components);

    for (var k = 0; k < keys.length; k++) {
      var comp = components[keys[k]];

      if (comp.count < 50) continue;

      var bboxW = comp.maxX - comp.minX + 1;
      var bboxH = comp.maxY - comp.minY + 1;
      var bboxArea = bboxW * bboxH;

      // "Roughly rectangular" check: component fills at least 10% of its bounding box
      var fillRatio = comp.count / bboxArea;
      if (fillRatio < 0.10) continue;

      var avgIntensity = comp.intensitySum / comp.count;
      // Normalize intensity to 0-100
      var normalizedIntensity = (avgIntensity / 765) * 100; // 765 = 255*3 max diff sum
      if (normalizedIntensity > 100) normalizedIntensity = 100;

      anomalyRegions.push({
        x: comp.minX,
        y: comp.minY,
        width: bboxW,
        height: bboxH,
        intensity: Math.round(normalizedIntensity * 100) / 100
      });
    }

    // Sort by intensity descending
    anomalyRegions.sort(function(a, b) { return b.intensity - a.intensity; });

    // Limit to top 10 regions
    if (anomalyRegions.length > 10) {
      anomalyRegions = anomalyRegions.slice(0, 10);
    }

    return anomalyRegions;
  }

  // ---------------------------------------------------------------------------
  // Thermal palette builder
  // ---------------------------------------------------------------------------

  /**
   * Build the 256-entry thermal color palette.
   * 8 color stops: black -> dark blue -> blue -> cyan -> green -> yellow -> orange -> red/white
   */
  _buildThermalPalette() {
    var palette = new Array(256);

    var stops = [
      { pos: 0,   r: 0,   g: 0,   b: 0   },  // black
      { pos: 36,  r: 10,  g: 10,  b: 106 },  // dark blue (#0a0a6a)
      { pos: 72,  r: 0,   g: 0,   b: 255 },  // blue (#0000ff)
      { pos: 108, r: 0,   g: 229, b: 255 },  // cyan (#00e5ff)
      { pos: 144, r: 0,   g: 230, b: 118 },  // green (#00e676)
      { pos: 180, r: 255, g: 234, b: 0   },  // yellow (#ffea00)
      { pos: 216, r: 255, g: 145, b: 0   },  // orange (#ff9100)
      { pos: 255, r: 255, g: 23,  b: 68  }   // red (#ff1744)
    ];

    for (var i = 0; i < 256; i++) {
      // Find the two stops this value falls between
      var lo = stops[0];
      var hi = stops[stops.length - 1];

      for (var s = 0; s < stops.length - 1; s++) {
        if (i >= stops[s].pos && i <= stops[s + 1].pos) {
          lo = stops[s];
          hi = stops[s + 1];
          break;
        }
      }

      var range = hi.pos - lo.pos;
      if (range === 0) range = 1;
      var t = (i - lo.pos) / range;

      palette[i] = [
        (lo.r + (hi.r - lo.r) * t) | 0,
        (lo.g + (hi.g - lo.g) * t) | 0,
        (lo.b + (hi.b - lo.b) * t) | 0
      ];
    }

    return palette;
  }

  // ---------------------------------------------------------------------------
  // Public getters
  // ---------------------------------------------------------------------------

  /**
   * Return current motion level (0-100).
   */
  getMotionLevel() {
    return this._motionLevel;
  }

  /**
   * Return current visual mode.
   */
  getMode() {
    return this._mode;
  }

  /**
   * Return the list of valid modes.
   */
  getValidModes() {
    return this._validModes.slice();
  }

  /**
   * Return frame count processed so far.
   */
  getFrameCount() {
    return this._frameCount;
  }

  /**
   * Return true if the engine has been initialized.
   */
  isInitialized() {
    return this._initialized;
  }

  // ---------------------------------------------------------------------------
  // Full analysis for evidence reports
  // ---------------------------------------------------------------------------

  /**
   * Return comprehensive analysis for evidence report.
   */
  fullAnalysis() {
    var averageMotion = 0;
    if (this._motionLevelCount > 0) {
      averageMotion = this._motionLevelSum / this._motionLevelCount;
    }

    // Compute average processing FPS
    var averageFps = 0;
    if (this._frameTimes.length > 0) {
      var totalTime = 0;
      for (var i = 0; i < this._frameTimes.length; i++) {
        totalTime += this._frameTimes[i];
      }
      var avgMs = totalTime / this._frameTimes.length;
      if (avgMs > 0) {
        averageFps = 1000 / avgMs;
      }
    }

    return {
      totalFrames: this._frameCount,
      averageMotionLevel: Math.round(averageMotion * 100) / 100,
      peakMotionLevel: Math.round(this._peakMotionLevel * 100) / 100,
      anomalyCount: this._totalAnomalyCount,
      anomalyTimestamps: this._anomalyTimestamps.slice(),
      modesUsed: Array.from(this._modesUsed),
      processingFps: Math.round(averageFps * 100) / 100
    };
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Clean up all canvases and buffers.
   */
  destroy() {
    this._srcCanvas = null;
    this._srcCtx = null;
    this._dstCanvas = null;
    this._dstCtx = null;

    this._prevFrameData = null;
    this._hasPrevFrame = false;
    this._motionAccumBuffer = null;
    this._grayBuffer = null;

    this._motionHistory = [];
    this._anomalyTimestamps = [];
    this._frameTimes = [];
    this._modesUsed.clear();

    this._motionLevel = 0;
    this._peakMotionLevel = 0;
    this._motionLevelSum = 0;
    this._motionLevelCount = 0;
    this._totalAnomalyCount = 0;
    this._frameCount = 0;

    this._initialized = false;
    this._width = 0;
    this._height = 0;
    this._pixelCount = 0;
  }
}

window.VisualAnomalyEngine = VisualAnomalyEngine;
