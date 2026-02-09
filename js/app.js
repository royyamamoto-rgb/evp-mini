/**
 * EVP-MINI — Main Application Controller v3
 * Orchestrates all engines: audio, visual, sensors, spirit box, classifier, recorder, report
 */

// ─── DOM Elements ───────────────────────────────────────────────────────────────
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay ? overlay.getContext('2d') : null;
const videoContainer = document.getElementById('videoContainer');

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnFlipCamera = document.getElementById('btnFlipCamera');
const btnRecord = document.getElementById('btnRecord');
const btnTorch = document.getElementById('btnTorch');
const btnScreenshot = document.getElementById('btnScreenshot');
const btnNewScan = document.getElementById('btnNewScan');
const btnExport = document.getElementById('btnExport');
const btnPlayForward = document.getElementById('btnPlayForward');
const btnPlayReverse = document.getElementById('btnPlayReverse');
const btnStopPlayback = document.getElementById('btnStopPlayback');
const btnDownload = document.getElementById('btnDownload');

const statusBar = document.getElementById('statusBar');
const timerDisplay = document.getElementById('timerDisplay');
const modeBadge = document.getElementById('modeBadge');
const nirBadge = document.getElementById('nirBadge');
const evpCountEl = document.getElementById('evpCount');
const scanLine = document.getElementById('scanLine');
const screenFlash = document.getElementById('screenFlash');

const spectrogramSection = document.getElementById('spectrogramSection');
const spectrogramCanvas = document.getElementById('spectrogramCanvas');
const spectrogramCtx = spectrogramCanvas ? spectrogramCanvas.getContext('2d') : null;

const waveformSection = document.getElementById('waveformSection');
const waveformCanvas = document.getElementById('waveformCanvas');
const waveformCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;

const audioPanel = document.getElementById('audioPanel');
const sensorPanel = document.getElementById('sensorPanel');
const spiritBoxPanel = document.getElementById('spiritBoxPanel');
const visualInfoPanel = document.getElementById('visualInfoPanel');
const visualModeSelector = document.getElementById('visualModeSelector');
const playbackSection = document.getElementById('playbackSection');
const evpAlert = document.getElementById('evpAlert');
const evpLog = document.getElementById('evpLog');
const evpLogEntries = document.getElementById('evpLogEntries');
const liveIndicators = document.getElementById('liveIndicators');
const resultsPanel = document.getElementById('resultsPanel');
const reportContent = document.getElementById('reportContent');
const technicalDetail = document.getElementById('technicalDetail');
const detailToggle = document.getElementById('detailToggle');

// Audio meter elements
const audioLevelFill = document.getElementById('audioLevelFill');
const audioLevelValue = document.getElementById('audioLevelValue');
const peakFreqValue = document.getElementById('peakFreqValue');
const noiseFloorValue = document.getElementById('noiseFloorValue');
const centroidValue = document.getElementById('centroidValue');
const hnrValue = document.getElementById('hnrValue');
const anomalyValue = document.getElementById('anomalyValue');
const formantValue = document.getElementById('formantValue');

// Sensor elements
const emfValue = document.getElementById('emfValue');
const emfBar = document.getElementById('emfBar');
const vibrationValue = document.getElementById('vibrationValue');
const vibrationBar = document.getElementById('vibrationBar');
const pressureValue = document.getElementById('pressureValue');
const gyroValue = document.getElementById('gyroValue');

// Spirit box elements
const sweepFreq = document.getElementById('sweepFreq');
const sweepSpeed = document.getElementById('sweepSpeed');
const sweepSpeedVal = document.getElementById('sweepSpeedVal');
const fragmentCount = document.getElementById('fragmentCount');
const sweepModeEl = document.getElementById('sweepMode');

// Visual info elements
const currentFilter = document.getElementById('currentFilter');
const motionLevel = document.getElementById('motionLevel');

// EVP alert elements
const evpAlertClass = document.getElementById('evpAlertClass');
const evpAlertDetail = document.getElementById('evpAlertDetail');

// ─── State ──────────────────────────────────────────────────────────────────────
let running = false;
let stream = null;
let facingMode = 'environment';
let scanMode = 'evp';
let scanDuration = 'continuous';
let visualMode = 'normal';
let scanStartTime = 0;
let scanTimerInterval = null;
let animFrameId = null;
let frameCount = 0;
let isRecording = false;
let audioInitialized = false;
let sensorsInitialized = false;
let torchOn = false;
let evpTotalCount = 0;

// ─── Performance Throttling ─────────────────────────────────────────────────────
let lastAudioUITime = 0;
let lastSensorUITime = 0;
let lastIndicatorTime = 0;
let lastVisualTime = 0;
let lastWaveformTime = 0;
let cachedAssess = null;
let prevIndicatorHTML = '';
let overlayCleared = true;
let spectroColImg = null;

// ─── Engine Instances ───────────────────────────────────────────────────────────
const evpAudioEngine = new EVPAudioEngine();
const visualAnomalyEngine = new VisualAnomalyEngine();
const emfSensorEngine = new EMFSensorEngine();
const spiritBoxEngine = new SpiritBoxEngine();
const evpClassifier = new EVPClassifier();
const sessionRecorder = new SessionRecorder();
const evidenceReport = new EvidenceReport();

// ─── Status ─────────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  if (statusBar) {
    statusBar.textContent = msg;
    statusBar.className = 'status-bar' + (type ? ' ' + type : '');
  }
}

function formatTimer(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + s.toString().padStart(2, '0');
}

// ─── Camera ─────────────────────────────────────────────────────────────────────
async function startCamera() {
  setStatus('Accessing camera and microphone...', '');

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  torchOn = false;
  if (btnTorch) btnTorch.classList.remove('torch-on');

  const evpAudio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000,
    channelCount: 1
  };

  const constraintSets = [
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: evpAudio },
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: evpAudio },
    { video: { facingMode: facingMode }, audio: evpAudio },
    { video: true, audio: evpAudio },
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },
    { video: { facingMode: facingMode }, audio: true },
    { video: true, audio: true },
    { video: { facingMode: facingMode }, audio: false },
    { video: true, audio: false }
  ];

  let lastError = null;
  for (const constraints of constraintSets) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(reject, 5000);
      });

      if (overlay) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }

      if (spectrogramCanvas) {
        spectrogramCanvas.width = spectrogramCanvas.offsetWidth * (window.devicePixelRatio || 1);
        spectrogramCanvas.height = 120 * (window.devicePixelRatio || 1);
        spectroColImg = null;
      }

      if (waveformCanvas) {
        waveformCanvas.width = waveformCanvas.offsetWidth * (window.devicePixelRatio || 1);
        waveformCanvas.height = 60 * (window.devicePixelRatio || 1);
      }

      const hasAudio = stream.getAudioTracks().length > 0;
      if (hasAudio && !audioInitialized) {
        const success = await evpAudioEngine.initAudioContext(stream);
        if (success) {
          audioInitialized = true;
          spiritBoxEngine.init(evpAudioEngine.audioContext);
        }
      }

      updateNIRBadge();
      setStatus('Ready — Select mode and start investigation', 'ready');
      return true;
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  console.error('Camera access failed:', lastError);
  setStatus('Camera/mic access failed. Please allow permissions.', 'error');
  return false;
}

function updateNIRBadge() {
  if (nirBadge) {
    nirBadge.classList.toggle('visible', facingMode === 'user');
  }
}

// ─── Torch Toggle ───────────────────────────────────────────────────────────────
async function toggleTorch() {
  if (!stream) return;
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;

  try {
    const capabilities = videoTrack.getCapabilities();
    if (!capabilities.torch) {
      setStatus('Torch not available on this device', '');
      setTimeout(() => { if (!running) setStatus('Ready — Select mode and start investigation', 'ready'); }, 2000);
      return;
    }
    torchOn = !torchOn;
    await videoTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
    if (btnTorch) btnTorch.classList.toggle('torch-on', torchOn);
  } catch (e) {
    console.warn('Torch toggle failed:', e);
    torchOn = false;
    if (btnTorch) btnTorch.classList.remove('torch-on');
  }
}

// ─── Screenshot ─────────────────────────────────────────────────────────────────
function takeScreenshot() {
  if (!video || !video.videoWidth) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  // Draw video frame
  ctx.drawImage(video, 0, 0);

  // Draw overlay on top if active
  if (overlay && !overlayCleared) {
    ctx.drawImage(overlay, 0, 0);
  }

  // Download
  const link = document.createElement('a');
  link.download = 'evp-mini-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── Screen Flash + Haptic ──────────────────────────────────────────────────────
function triggerScreenFlash(evpClass) {
  if (!screenFlash) return;

  // Remove existing flash class
  screenFlash.className = 'screen-flash';
  // Force reflow to restart animation
  void screenFlash.offsetWidth;

  const cls = evpClass.toLowerCase();
  screenFlash.classList.add('flash-' + cls);

  // Haptic vibration
  if (navigator.vibrate) {
    if (cls === 'a') navigator.vibrate([100, 50, 100, 50, 100]);
    else if (cls === 'b') navigator.vibrate([100, 50, 100]);
    else navigator.vibrate(100);
  }

  // Remove class after animation
  setTimeout(() => {
    screenFlash.className = 'screen-flash';
  }, 900);
}

// ─── EVP Log ────────────────────────────────────────────────────────────────────
function addEVPLogEntry(classification) {
  if (!evpLogEntries) return;

  const elapsed = Date.now() - scanStartTime;
  const timeStr = formatTimer(elapsed);
  const cls = classification.class.toLowerCase();

  const entry = document.createElement('div');
  entry.className = 'evp-log-entry class-' + cls;
  entry.innerHTML =
    '<span class="log-time">' + timeStr + '</span>' +
    '<span class="log-class">Class ' + classification.class + '</span>' +
    '<span class="log-detail">' + classification.confidence + '% | ' +
    Math.round(classification.spectralCentroid) + 'Hz' +
    (classification.hasVoicePattern ? ' | Voice' : '') + '</span>';

  evpLogEntries.insertBefore(entry, evpLogEntries.firstChild);

  // Keep log manageable
  while (evpLogEntries.children.length > 50) {
    evpLogEntries.removeChild(evpLogEntries.lastChild);
  }
}

// ─── EVP Count ──────────────────────────────────────────────────────────────────
function updateEVPCount() {
  if (evpCountEl) {
    evpCountEl.textContent = 'EVP: ' + evpTotalCount;
    evpCountEl.classList.toggle('has-evp', evpTotalCount > 0);
  }
}

// ─── Video Anomaly Border ───────────────────────────────────────────────────────
let anomalyBorderTimeout = null;
function setAnomalyBorder(active) {
  if (!videoContainer) return;
  if (active) {
    videoContainer.classList.add('anomaly-border');
    if (anomalyBorderTimeout) clearTimeout(anomalyBorderTimeout);
    anomalyBorderTimeout = setTimeout(() => {
      videoContainer.classList.remove('anomaly-border');
    }, 2000);
  }
}

// ─── Scan Lifecycle ─────────────────────────────────────────────────────────────
async function startScan() {
  if (running) return;
  running = true;
  frameCount = 0;
  evpTotalCount = 0;
  updateEVPCount();

  // Init sensors on first scan (requires user gesture for iOS permissions)
  if (!sensorsInitialized) {
    try {
      await emfSensorEngine.init();
    } catch (e) {
      console.warn('Sensor init failed:', e);
    }
    sensorsInitialized = true;
  }

  // Clear all engines
  evpAudioEngine.clearAll();
  visualAnomalyEngine.clearAll();
  emfSensorEngine.clearAll();
  spiritBoxEngine.clearAll();
  evpClassifier.clearAll();
  evidenceReport.clearAll();

  // Clear EVP log
  if (evpLogEntries) evpLogEntries.innerHTML = '';

  // Set visual mode
  visualAnomalyEngine.setMode(
    scanMode === 'visual' || scanMode === 'fullspectrum' ? visualMode : 'normal'
  );

  // Start spirit box if needed
  if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
    spiritBoxEngine.start();
  }

  // Start recording if toggled
  if (isRecording && stream) {
    sessionRecorder.startRecording(stream);
  }

  // Show/hide panels
  showPanelsForMode();

  // Timer
  scanStartTime = Date.now();
  if (timerDisplay) {
    timerDisplay.textContent = '0:00';
    timerDisplay.classList.add('visible');
  }

  // Scan line
  if (scanLine) scanLine.classList.add('active');

  // Start timer interval
  scanTimerInterval = setInterval(() => {
    const elapsed = Date.now() - scanStartTime;
    if (timerDisplay) timerDisplay.textContent = formatTimer(elapsed);

    if (scanDuration !== 'continuous') {
      const limitMs = parseInt(scanDuration) * 1000;
      if (elapsed >= limitMs) {
        completeScan();
      }
    }
  }, 250);

  // UI state
  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.classList.add('visible');
  if (resultsPanel) resultsPanel.classList.remove('visible');
  setStatus('Scanning... Analyzing environment', 'scanning');

  // Hide EVP alert
  if (evpAlert) evpAlert.classList.remove('visible');

  // Reset throttling state
  lastAudioUITime = 0;
  lastSensorUITime = 0;
  lastIndicatorTime = 0;
  lastVisualTime = 0;
  lastWaveformTime = 0;
  prevIndicatorHTML = '';
  overlayCleared = !(scanMode === 'visual' || scanMode === 'fullspectrum');

  if (overlayCleared && overlayCtx && overlay) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  processFrame();
}

function stopScan() {
  completeScan();
}

function completeScan() {
  if (!running) return;
  running = false;

  if (scanTimerInterval) {
    clearInterval(scanTimerInterval);
    scanTimerInterval = null;
  }

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Stop scan line
  if (scanLine) scanLine.classList.remove('active');

  spiritBoxEngine.stop();
  sessionRecorder.stopRecording();

  // Generate report
  const audioReport = evpAudioEngine.fullAnalysis();
  const spiritBoxReport = spiritBoxEngine.fullAnalysis();
  const visualReport = visualAnomalyEngine.fullAnalysis();
  const sensorReport = emfSensorEngine.fullAnalysis();
  const evpReport = evpClassifier.fullAnalysis();
  const recordingData = sessionRecorder.getRecordingState();

  evidenceReport.analyze(audioReport, spiritBoxReport, visualReport, sensorReport, evpReport, recordingData);
  renderReport();

  // UI state
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.classList.remove('visible');
  if (timerDisplay) timerDisplay.classList.remove('visible');
  if (playbackSection && sessionRecorder.getRecordingState().hasRecording) {
    playbackSection.classList.add('visible');
  }

  // Remove anomaly border
  if (videoContainer) videoContainer.classList.remove('anomaly-border');

  setStatus('Investigation complete — Review evidence report', 'complete');
}

function renderReport() {
  if (reportContent) reportContent.innerHTML = evidenceReport.renderFriendlyReport();
  if (technicalDetail) technicalDetail.innerHTML = evidenceReport.renderTechnicalDetail();
  if (resultsPanel) resultsPanel.classList.add('visible');
}

// ─── Frame Processing Loop ──────────────────────────────────────────────────────
function processFrame() {
  if (!running) return;
  animFrameId = requestAnimationFrame(processFrame);
  frameCount++;

  const now = performance.now();

  // 1. Audio processing (every frame — AnalyserNode read is lightweight)
  if (audioInitialized) {
    evpAudioEngine.processAudioFrame();
    cachedAssess = evpAudioEngine.getQuickAssess();

    // Audio UI + spectrogram at ~20fps
    if (now - lastAudioUITime > 50) {
      drawSpectrogram();
      updateAudioUI(cachedAssess);
      lastAudioUITime = now;
    }

    // Waveform at ~15fps
    if (now - lastWaveformTime > 66) {
      drawWaveform();
      lastWaveformTime = now;
    }

    // EVP classification (every frame for accurate duration tracking)
    if (scanMode === 'evp' || scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
      const noiseFloor = evpAudioEngine.getNoiseFloor();
      const classification = evpClassifier.processFrame(cachedAssess, noiseFloor);
      if (classification) {
        showEVPAlert(classification);
        triggerScreenFlash(classification.class);
        addEVPLogEntry(classification);
        evpTotalCount++;
        updateEVPCount();
        setAnomalyBorder(true);
      }
    }
  }

  // 2. Spirit box processing
  if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
    spiritBoxEngine.processFrame();
  }

  // 3. Visual processing
  const isVisualMode = scanMode === 'visual' || scanMode === 'fullspectrum';
  if (isVisualMode) {
    if (now - lastVisualTime > 50) {
      const processed = visualAnomalyEngine.processFrame(video);
      if (processed && overlayCtx && overlay && visualMode !== 'normal') {
        overlayCtx.putImageData(processed, 0, 0);
        overlayCleared = false;
      } else if (visualMode === 'normal' && !overlayCleared) {
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
        overlayCleared = true;
      }
      lastVisualTime = now;
    }
  } else {
    if (!overlayCleared && overlayCtx && overlay) {
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      overlayCleared = true;
    }
    if (frameCount % 6 === 0) {
      visualAnomalyEngine.processFrame(video);
    }
  }

  // 4. Sensor processing
  emfSensorEngine.processFrame();

  // 5. UI updates at ~10fps
  if (now - lastSensorUITime > 100) {
    updateSensorUI();
    if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
      updateSpiritBoxUI();
    }
    if (isVisualMode) {
      updateVisualUI();
    }
    lastSensorUITime = now;
  }

  // 6. Live indicators at ~5fps
  if (now - lastIndicatorTime > 200) {
    updateLiveIndicators();

    // Anomaly border from audio
    if (cachedAssess && cachedAssess.isAnomaly) {
      setAnomalyBorder(true);
    }

    lastIndicatorTime = now;
  }
}

// ─── Audio UI Updates ───────────────────────────────────────────────────────────
function updateAudioUI(assess) {
  if (!assess) assess = evpAudioEngine.getQuickAssess();

  if (audioLevelFill) {
    audioLevelFill.style.width = assess.rmsPercent.toFixed(1) + '%';
    audioLevelFill.className = 'meter-fill' + (assess.isAnomaly ? ' alert' : '');
  }
  if (audioLevelValue) audioLevelValue.textContent = assess.rmsPercent.toFixed(0) + '%';
  if (peakFreqValue) peakFreqValue.textContent = assess.peakFreq > 0 ? Math.round(assess.peakFreq) + ' Hz' : '— Hz';
  if (noiseFloorValue) noiseFloorValue.textContent = assess.baselineEstablished ? assess.noiseFloorDb.toFixed(1) + ' dB' : 'Calibrating...';
  if (centroidValue) centroidValue.textContent = assess.centroid > 0 ? Math.round(assess.centroid) + ' Hz' : '— Hz';
  if (hnrValue) hnrValue.textContent = assess.hnr !== 0 ? assess.hnr.toFixed(1) + ' dB' : '— dB';
  if (anomalyValue) {
    anomalyValue.textContent = assess.isAnomaly ? 'DETECTED (' + assess.anomalyStrength + ')' : 'None';
    anomalyValue.style.color = assess.isAnomaly ? '#ff1744' : '#00e5ff';
  }
  if (formantValue) {
    if (assess.formantMatch) {
      formantValue.textContent = 'MATCH (' + assess.formantClarity + '/3)';
      formantValue.style.color = '#00e676';
    } else {
      formantValue.textContent = assess.formantClarity > 0 ? 'Partial (' + assess.formantClarity + '/3)' : '—';
      formantValue.style.color = assess.formantClarity > 0 ? '#ffea00' : '#00e5ff';
    }
  }
}

// ─── Spectrogram Drawing ────────────────────────────────────────────────────────
function drawSpectrogram() {
  if (!spectrogramCtx || !spectrogramCanvas) return;

  const slice = evpAudioEngine.getSpectrogramSlice();
  if (!slice) return;

  const w = spectrogramCanvas.width;
  const h = spectrogramCanvas.height;
  if (w === 0 || h === 0) return;

  spectrogramCtx.drawImage(spectrogramCanvas, 1, 0, w - 1, h, 0, 0, w - 1, h);

  if (!spectroColImg || spectroColImg.height !== h) {
    spectroColImg = spectrogramCtx.createImageData(1, h);
  }
  const d = spectroColImg.data;

  const maxBin = Math.min(slice.length, Math.ceil(8000 / evpAudioEngine.binResolution));

  for (let y = 0; y < h; y++) {
    const bin = Math.floor((1 - y / h) * maxBin);
    const idx = y * 4;
    if (bin >= 0 && bin < slice.length) {
      const db = slice[bin];
      const normalized = Math.max(0, Math.min(1, (db + 100) / 90));
      const rgb = spectrogramColorRGB(normalized);
      d[idx] = rgb[0];
      d[idx + 1] = rgb[1];
      d[idx + 2] = rgb[2];
      d[idx + 3] = 255;
    } else {
      d[idx] = 0; d[idx + 1] = 0; d[idx + 2] = 0; d[idx + 3] = 255;
    }
  }

  spectrogramCtx.putImageData(spectroColImg, w - 1, 0);
}

function spectrogramColorRGB(t) {
  if (t < 0.15) {
    const s = t / 0.15;
    return [0, 0, Math.round(s * 100)];
  } else if (t < 0.3) {
    const s = (t - 0.15) / 0.15;
    return [0, Math.round(s * 180), Math.round(100 + s * 120)];
  } else if (t < 0.5) {
    const s = (t - 0.3) / 0.2;
    return [0, Math.round(180 + s * 75), Math.round(220 - s * 220)];
  } else if (t < 0.7) {
    const s = (t - 0.5) / 0.2;
    return [Math.round(s * 255), 255, 0];
  } else if (t < 0.85) {
    const s = (t - 0.7) / 0.15;
    return [255, Math.round(255 - s * 200), 0];
  } else {
    const s = (t - 0.85) / 0.15;
    return [255, Math.round(55 + s * 200), Math.round(s * 255)];
  }
}

// ─── Waveform Drawing ───────────────────────────────────────────────────────────
function drawWaveform() {
  if (!waveformCtx || !waveformCanvas || !evpAudioEngine.timeDomainData) return;

  const w = waveformCanvas.width;
  const h = waveformCanvas.height;
  if (w === 0 || h === 0) return;

  const data = evpAudioEngine.timeDomainData;
  const bufLen = data.length;

  waveformCtx.fillStyle = '#000';
  waveformCtx.fillRect(0, 0, w, h);

  waveformCtx.lineWidth = 1.5;
  waveformCtx.strokeStyle = '#00e5ff';
  waveformCtx.beginPath();

  const sliceWidth = w / bufLen;
  let x = 0;

  for (let i = 0; i < bufLen; i++) {
    const v = data[i];
    const y = (1 - v) * h / 2;
    if (i === 0) waveformCtx.moveTo(x, y);
    else waveformCtx.lineTo(x, y);
    x += sliceWidth;
  }

  waveformCtx.stroke();

  // Center line
  waveformCtx.strokeStyle = 'rgba(124, 77, 255, 0.3)';
  waveformCtx.lineWidth = 0.5;
  waveformCtx.beginPath();
  waveformCtx.moveTo(0, h / 2);
  waveformCtx.lineTo(w, h / 2);
  waveformCtx.stroke();
}

// ─── Sensor UI Updates ──────────────────────────────────────────────────────────
function updateSensorUI() {
  const state = emfSensorEngine.getSensorState();

  // EMF
  if (emfValue) {
    if (state.magnetometer.available) {
      emfValue.textContent = state.magnetometer.magnitude.toFixed(1) + ' uT';
      emfValue.className = 'gauge-value' + (state.magnetometer.anomaly ? ' alert' : '');
      if (emfBar) {
        const pct = state.magnetometer.baselineEstablished
          ? Math.min(100, (state.magnetometer.deviation / 20) * 100)
          : 0;
        emfBar.style.width = pct + '%';
        emfBar.className = 'gauge-bar-fill' + (state.magnetometer.anomaly ? ' alert' : '');
      }
    } else {
      emfValue.textContent = 'Unavailable';
      emfValue.className = 'gauge-value unavailable';
    }
  }

  // Vibration
  if (vibrationValue) {
    if (state.accelerometer.available) {
      let text = state.accelerometer.vibrationLevel.toFixed(2) + ' g';
      if (state.accelerometer.dominantFreq > 0) {
        text += ' | ' + state.accelerometer.dominantFreq.toFixed(1) + ' Hz';
      }
      vibrationValue.textContent = text;
      vibrationValue.className = 'gauge-value' + (state.accelerometer.fearFreqAlert ? ' alert' : state.accelerometer.infrasoundDetected ? ' warning' : '');
      if (vibrationBar) {
        const pct = Math.min(100, state.accelerometer.vibrationLevel * 200);
        vibrationBar.style.width = pct + '%';
        vibrationBar.className = 'gauge-bar-fill' + (state.accelerometer.fearFreqAlert ? ' alert' : '');
      }
    } else {
      vibrationValue.textContent = 'Unavailable';
      vibrationValue.className = 'gauge-value unavailable';
    }
  }

  // Gyroscope
  if (gyroValue) {
    if (state.gyroscope && state.gyroscope.available) {
      gyroValue.textContent =
        'a:' + state.gyroscope.alpha.toFixed(0) +
        ' b:' + state.gyroscope.beta.toFixed(0) +
        ' g:' + state.gyroscope.gamma.toFixed(0) + ' °/s';
      gyroValue.className = 'gauge-value';
    } else {
      gyroValue.textContent = 'Unavailable';
      gyroValue.className = 'gauge-value unavailable';
    }
  }

  // Pressure
  if (pressureValue) {
    if (state.barometer.available) {
      pressureValue.textContent = state.barometer.pressure.toFixed(1) + ' hPa';
      pressureValue.className = 'gauge-value' + (state.barometer.anomaly ? ' alert' : '');
    } else {
      pressureValue.textContent = 'Unavailable';
      pressureValue.className = 'gauge-value unavailable';
    }
  }
}

// ─── Spirit Box UI ──────────────────────────────────────────────────────────────
function updateSpiritBoxUI() {
  const state = spiritBoxEngine.getCurrentState();
  if (sweepFreq) sweepFreq.textContent = state.currentFreqDisplay;
  if (fragmentCount) fragmentCount.textContent = state.fragmentCount;
  if (sweepModeEl) sweepModeEl.textContent = state.mode === 'sweep' ? 'Sweep' : state.mode === 'white-noise' ? 'White' : 'Pink';
}

// ─── Visual UI ──────────────────────────────────────────────────────────────────
function updateVisualUI() {
  if (currentFilter) currentFilter.textContent = visualMode.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (motionLevel) motionLevel.textContent = visualAnomalyEngine.getMotionLevel().toFixed(1) + '%';
}

// ─── EVP Alert ──────────────────────────────────────────────────────────────────
let evpAlertTimeout = null;
function showEVPAlert(classification) {
  if (!evpAlert) return;

  evpAlert.classList.add('visible');
  if (evpAlertClass) {
    evpAlertClass.textContent = 'EVP Class ' + classification.class + ' Detected';
    evpAlertClass.className = 'alert-class class-' + classification.class.toLowerCase();
  }
  if (evpAlertDetail) {
    evpAlertDetail.textContent =
      'Confidence: ' + classification.confidence + '% | Duration: ' + classification.duration + 's | ' +
      'Centroid: ' + classification.spectralCentroid + 'Hz | HNR: ' + classification.hnr + 'dB' +
      (classification.hasVoicePattern ? ' | Voice pattern detected' : '');
  }

  if (evpAlertTimeout) clearTimeout(evpAlertTimeout);
  evpAlertTimeout = setTimeout(() => {
    if (evpAlert) evpAlert.classList.remove('visible');
  }, 5000);
}

// ─── Live Indicators ────────────────────────────────────────────────────────────
function updateLiveIndicators() {
  if (!liveIndicators) return;
  const chips = [];

  if (evpAudioEngine.isAnomaly) {
    chips.push('<span class="indicator-chip anomaly">AUDIO ANOMALY</span>');
  }

  const formants = evpAudioEngine.getFormantAnalysis();
  if (formants && formants.hasVoicePattern) {
    chips.push('<span class="indicator-chip voice">VOICE PATTERN</span>');
  }

  const emfState = emfSensorEngine.getEMFAnomaly();
  if (emfState.isAnomaly) {
    chips.push('<span class="indicator-chip emf">EMF SPIKE +' + emfState.deviationMicroTesla.toFixed(1) + 'uT</span>');
  }

  if (visualAnomalyEngine.getMotionLevel() > 10) {
    chips.push('<span class="indicator-chip motion">MOTION ' + visualAnomalyEngine.getMotionLevel().toFixed(0) + '%</span>');
  }

  const vibState = emfSensorEngine.getVibrationAnalysis();
  if (vibState.fearFreqAlert) {
    chips.push('<span class="indicator-chip infrasound">FEAR FREQ 18.98Hz</span>');
  } else if (vibState.infrasoundDetected) {
    chips.push('<span class="indicator-chip infrasound">INFRASOUND ' + vibState.dominantFreqHz.toFixed(1) + 'Hz</span>');
  }

  const html = chips.join('');
  if (html !== prevIndicatorHTML) {
    liveIndicators.innerHTML = html;
    prevIndicatorHTML = html;
  }
}

// ─── Panel Visibility ───────────────────────────────────────────────────────────
function showPanelsForMode() {
  if (audioPanel) audioPanel.classList.add('visible');
  if (spectrogramSection) spectrogramSection.classList.add('visible');
  if (waveformSection) waveformSection.classList.add('visible');
  if (sensorPanel) sensorPanel.classList.add('visible');
  if (evpLog) evpLog.classList.add('visible');

  if (spiritBoxPanel) {
    spiritBoxPanel.classList.toggle('visible', scanMode === 'spiritbox' || scanMode === 'fullspectrum');
  }
  if (visualInfoPanel) {
    visualInfoPanel.classList.toggle('visible', scanMode === 'visual' || scanMode === 'fullspectrum');
  }
  if (visualModeSelector) {
    visualModeSelector.style.display = (scanMode === 'visual' || scanMode === 'fullspectrum') ? 'flex' : 'none';
  }
}

function hidePanels() {
  if (audioPanel) audioPanel.classList.remove('visible');
  if (spectrogramSection) spectrogramSection.classList.remove('visible');
  if (waveformSection) waveformSection.classList.remove('visible');
  if (sensorPanel) sensorPanel.classList.remove('visible');
  if (spiritBoxPanel) spiritBoxPanel.classList.remove('visible');
  if (visualInfoPanel) visualInfoPanel.classList.remove('visible');
  if (evpAlert) evpAlert.classList.remove('visible');
  if (evpLog) evpLog.classList.remove('visible');
}

// ─── Event Listeners ────────────────────────────────────────────────────────────

// Start/Stop
if (btnStart) btnStart.addEventListener('click', startScan);
if (btnStop) btnStop.addEventListener('click', stopScan);

// Torch
if (btnTorch) btnTorch.addEventListener('click', toggleTorch);

// Screenshot
if (btnScreenshot) btnScreenshot.addEventListener('click', takeScreenshot);

// New Scan
if (btnNewScan) {
  btnNewScan.addEventListener('click', () => {
    if (resultsPanel) resultsPanel.classList.remove('visible');
    if (playbackSection) playbackSection.classList.remove('visible');
    hidePanels();
    sessionRecorder.clearAll();
    evpTotalCount = 0;
    updateEVPCount();
    setStatus('Ready — Select mode and start investigation', 'ready');
  });
}

// Camera flip
if (btnFlipCamera) {
  btnFlipCamera.addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    await startCamera();
  });
}

// Record toggle
if (btnRecord) {
  btnRecord.addEventListener('click', () => {
    isRecording = !isRecording;
    btnRecord.classList.toggle('rec-on', isRecording);
    btnRecord.textContent = isRecording ? 'REC ON' : 'REC';
  });
}

// Mode selector
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    scanMode = btn.dataset.mode;
    if (modeBadge) {
      const labels = { evp: 'EVP SCAN', spiritbox: 'SPIRIT BOX', visual: 'VISUAL', fullspectrum: 'FULL SPECTRUM' };
      modeBadge.textContent = labels[scanMode] || scanMode.toUpperCase();
    }
    if (visualModeSelector) {
      visualModeSelector.style.display = (scanMode === 'visual' || scanMode === 'fullspectrum') ? 'flex' : 'none';
    }
  });
});

// Duration selector
document.querySelectorAll('.duration-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    scanDuration = btn.dataset.duration;
  });
});

// Visual mode selector
document.querySelectorAll('.visual-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.visual-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    visualMode = btn.dataset.visual;
    visualAnomalyEngine.setMode(visualMode);
    if (visualMode === 'normal') {
      if (overlayCtx && overlay) {
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      }
      overlayCleared = true;
    } else {
      overlayCleared = false;
    }
  });
});

// Spirit box mode buttons
document.querySelectorAll('.spirit-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.spirit-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.spiritmode;
    spiritBoxEngine.setMode(mode);
  });
});

// Sweep speed slider
if (sweepSpeed) {
  sweepSpeed.addEventListener('input', () => {
    const speed = parseInt(sweepSpeed.value);
    spiritBoxEngine.setSweepSpeed(speed);
    if (sweepSpeedVal) sweepSpeedVal.textContent = speed + 'ms';
  });
}

// Detail toggle
if (detailToggle) {
  detailToggle.addEventListener('click', () => {
    if (technicalDetail) {
      technicalDetail.classList.toggle('visible');
      detailToggle.textContent = technicalDetail.classList.contains('visible')
        ? 'Hide Technical Detail'
        : 'Show Technical Detail';
    }
  });
}

// Playback controls
if (btnPlayForward) btnPlayForward.addEventListener('click', () => sessionRecorder.playForward());
if (btnPlayReverse) btnPlayReverse.addEventListener('click', () => sessionRecorder.playReverse());
if (btnStopPlayback) btnStopPlayback.addEventListener('click', () => sessionRecorder.stopPlayback());
if (btnDownload) btnDownload.addEventListener('click', () => sessionRecorder.downloadRecording());

// Export evidence
if (btnExport) {
  btnExport.addEventListener('click', () => {
    const summary = evidenceReport.getSummary();
    const timeline = evidenceReport.getTimelineEvents();

    let text = 'EVP-MINI INVESTIGATION REPORT\n';
    text += '================================\n\n';
    text += 'Generated: ' + new Date().toISOString() + '\n';
    text += 'Summary: ' + summary + '\n\n';

    text += 'TIMELINE:\n';
    for (const e of timeline) {
      text += '[' + formatTimer(e.time * 1000) + '] ' + e.type.toUpperCase() + ': ' + e.detail + '\n';
    }

    text += '\nDISCLAIMER: This app uses real sensor data but cannot verify paranormal phenomena.\n';
    text += 'Audio anomalies may be caused by environmental noise, electronic interference,\n';
    text += 'or auditory pareidolia (Nees & Phillips, 2015).\n';

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evp-mini-report-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sessionRecorder.downloadRecording();
  });
}

// ─── AudioContext Resume (mobile) ───────────────────────────────────────────────
document.addEventListener('click', () => {
  if (evpAudioEngine.audioContext && evpAudioEngine.audioContext.state === 'suspended') {
    evpAudioEngine.audioContext.resume();
  }
}, { once: true });

document.addEventListener('touchstart', () => {
  if (evpAudioEngine.audioContext && evpAudioEngine.audioContext.state === 'suspended') {
    evpAudioEngine.audioContext.resume();
  }
}, { once: true });

// ─── Initialize ─────────────────────────────────────────────────────────────────
async function init() {
  setStatus('Initializing EVP-MINI...', '');
  const success = await startCamera();
  if (!success) {
    setStatus('Failed to access camera/microphone. Check permissions.', 'error');
  }
}

if (document.getElementById('appWrapper') &&
    document.getElementById('appWrapper').classList.contains('authenticated')) {
  init();
} else {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.target.classList && m.target.classList.contains('authenticated')) {
        observer.disconnect();
        init();
        break;
      }
    }
  });
  const wrapper = document.getElementById('appWrapper');
  if (wrapper) {
    observer.observe(wrapper, { attributes: true, attributeFilter: ['class'] });
  }
}
