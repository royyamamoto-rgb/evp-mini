/**
 * EVP-MINI — Main Application Controller
 * Orchestrates all engines: audio, visual, sensors, spirit box, classifier, recorder, report
 */

// ─── DOM Elements ───────────────────────────────────────────────────────────────
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay ? overlay.getContext('2d') : null;

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnFlipCamera = document.getElementById('btnFlipCamera');
const btnRecord = document.getElementById('btnRecord');
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

const spectrogramSection = document.getElementById('spectrogramSection');
const spectrogramCanvas = document.getElementById('spectrogramCanvas');
const spectrogramCtx = spectrogramCanvas ? spectrogramCanvas.getContext('2d') : null;

const audioPanel = document.getElementById('audioPanel');
const sensorPanel = document.getElementById('sensorPanel');
const spiritBoxPanel = document.getElementById('spiritBoxPanel');
const visualInfoPanel = document.getElementById('visualInfoPanel');
const visualModeSelector = document.getElementById('visualModeSelector');
const playbackSection = document.getElementById('playbackSection');
const evpAlert = document.getElementById('evpAlert');
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

// Spirit box elements
const sweepFreq = document.getElementById('sweepFreq');
const sweepSpeed = document.getElementById('sweepSpeed');
const sweepSpeedVal = document.getElementById('sweepSpeedVal');
const fragmentCount = document.getElementById('fragmentCount');
const sweepMode = document.getElementById('sweepMode');

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
let scanMode = 'evp'; // evp, spiritbox, visual, fullspectrum
let scanDuration = 'continuous'; // continuous, 30, 60, 120
let visualMode = 'normal';
let scanStartTime = 0;
let scanTimerInterval = null;
let animFrameId = null;
let frameCount = 0;
let isRecording = false;
let audioInitialized = false;
let sensorsInitialized = false;

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

  // Stop existing stream
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  // Audio constraints: disable browser processing to capture faint EVP signals
  const evpAudio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000,
    channelCount: 1
  };

  // Progressive constraint fallback
  const constraintSets = [
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: evpAudio },
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: evpAudio },
    { video: { facingMode: facingMode }, audio: evpAudio },
    { video: true, audio: evpAudio },
    // Simplified audio fallbacks
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },
    { video: { facingMode: facingMode }, audio: true },
    { video: true, audio: true },
    // Video-only fallbacks
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

      // Size overlay to video
      if (overlay) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }

      // Size spectrogram canvas
      if (spectrogramCanvas) {
        spectrogramCanvas.width = spectrogramCanvas.offsetWidth * (window.devicePixelRatio || 1);
        spectrogramCanvas.height = 120 * (window.devicePixelRatio || 1);
      }

      // Init audio if stream has audio tracks
      const hasAudio = stream.getAudioTracks().length > 0;
      if (hasAudio && !audioInitialized) {
        const success = await evpAudioEngine.initAudioContext(stream);
        if (success) {
          audioInitialized = true;
          // Init spirit box with same audio context
          spiritBoxEngine.init(evpAudioEngine.audioContext);
        }
      }

      // Init sensors
      if (!sensorsInitialized) {
        await emfSensorEngine.init();
        sensorsInitialized = true;
      }

      // Update NIR badge
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

// ─── Scan Lifecycle ─────────────────────────────────────────────────────────────
function startScan() {
  if (running) return;
  running = true;
  frameCount = 0;

  // Clear all engines
  evpAudioEngine.clearAll();
  visualAnomalyEngine.clearAll();
  emfSensorEngine.clearAll();
  spiritBoxEngine.clearAll();
  evpClassifier.clearAll();
  evidenceReport.clearAll();

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

  // Start timer interval
  scanTimerInterval = setInterval(() => {
    const elapsed = Date.now() - scanStartTime;
    if (timerDisplay) timerDisplay.textContent = formatTimer(elapsed);

    // Check duration limit
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

  // Start processing loop
  processFrame();
}

function stopScan() {
  completeScan();
}

function completeScan() {
  if (!running) return;
  running = false;

  // Stop timer
  if (scanTimerInterval) {
    clearInterval(scanTimerInterval);
    scanTimerInterval = null;
  }

  // Stop animation frame
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Stop spirit box
  spiritBoxEngine.stop();

  // Stop recording
  sessionRecorder.stopRecording();

  // Generate report
  const audioReport = evpAudioEngine.fullAnalysis();
  const spiritBoxReport = spiritBoxEngine.fullAnalysis();
  const visualReport = visualAnomalyEngine.fullAnalysis();
  const sensorReport = emfSensorEngine.fullAnalysis();
  const evpReport = evpClassifier.fullAnalysis();
  const recordingData = sessionRecorder.getRecordingState();

  evidenceReport.analyze(audioReport, spiritBoxReport, visualReport, sensorReport, evpReport, recordingData);

  // Render report
  renderReport();

  // UI state
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.classList.remove('visible');
  if (timerDisplay) timerDisplay.classList.remove('visible');
  if (playbackSection && sessionRecorder.getRecordingState().hasRecording) {
    playbackSection.classList.add('visible');
  }

  setStatus('Investigation complete — Review evidence report', 'complete');
}

function renderReport() {
  if (reportContent) {
    reportContent.innerHTML = evidenceReport.renderFriendlyReport();
  }
  if (technicalDetail) {
    technicalDetail.innerHTML = evidenceReport.renderTechnicalDetail();
  }
  if (resultsPanel) {
    resultsPanel.classList.add('visible');
  }
}

// ─── Frame Processing Loop ──────────────────────────────────────────────────────
function processFrame() {
  if (!running) return;
  animFrameId = requestAnimationFrame(processFrame);
  frameCount++;

  // 1. Audio processing
  if (audioInitialized) {
    evpAudioEngine.processAudioFrame();
    updateAudioUI();
    drawSpectrogram();

    // 2. EVP classification
    if (scanMode === 'evp' || scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
      const assess = evpAudioEngine.getQuickAssess();
      const noiseFloor = evpAudioEngine.getNoiseFloor();
      const classification = evpClassifier.processFrame(assess, noiseFloor);
      if (classification) {
        showEVPAlert(classification);
      }
    }
  }

  // 3. Spirit box processing
  if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
    spiritBoxEngine.processFrame();
    updateSpiritBoxUI();
  }

  // 4. Visual processing
  if (scanMode === 'visual' || scanMode === 'fullspectrum') {
    const processed = visualAnomalyEngine.processFrame(video);
    if (processed && overlayCtx && overlay) {
      overlayCtx.putImageData(processed, 0, 0);
    }
    updateVisualUI();
  } else {
    // Normal mode — clear overlay
    if (overlayCtx && overlay) {
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    }
    // Still track motion in background
    visualAnomalyEngine.processFrame(video);
  }

  // 5. Sensor processing
  emfSensorEngine.processFrame();
  updateSensorUI();

  // 6. Live indicators
  updateLiveIndicators();
}

// ─── Audio UI Updates ───────────────────────────────────────────────────────────
function updateAudioUI() {
  const assess = evpAudioEngine.getQuickAssess();

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

  // Scroll left by 1 pixel
  const existing = spectrogramCtx.getImageData(1, 0, w - 1, h);
  spectrogramCtx.putImageData(existing, 0, 0);

  // Draw new column at right edge
  // Only show up to ~8000Hz (relevant range)
  const maxBin = Math.min(slice.length, Math.ceil(8000 / evpAudioEngine.binResolution));

  for (let y = 0; y < h; y++) {
    const bin = Math.floor((1 - y / h) * maxBin);
    if (bin >= 0 && bin < slice.length) {
      // Map dB (-100 to -10) to color intensity
      const db = slice[bin];
      const normalized = Math.max(0, Math.min(1, (db + 100) / 90));
      const color = spectrogramColor(normalized);
      spectrogramCtx.fillStyle = color;
      spectrogramCtx.fillRect(w - 1, y, 1, 1);
    }
  }
}

function spectrogramColor(t) {
  // Black -> deep blue -> cyan -> green -> yellow -> red -> white
  if (t < 0.15) {
    const s = t / 0.15;
    return `rgb(0,0,${Math.round(s * 100)})`;
  } else if (t < 0.3) {
    const s = (t - 0.15) / 0.15;
    return `rgb(0,${Math.round(s * 180)},${Math.round(100 + s * 120)})`;
  } else if (t < 0.5) {
    const s = (t - 0.3) / 0.2;
    return `rgb(0,${Math.round(180 + s * 75)},${Math.round(220 - s * 220)})`;
  } else if (t < 0.7) {
    const s = (t - 0.5) / 0.2;
    return `rgb(${Math.round(s * 255)},255,0)`;
  } else if (t < 0.85) {
    const s = (t - 0.7) / 0.15;
    return `rgb(255,${Math.round(255 - s * 200)},0)`;
  } else {
    const s = (t - 0.85) / 0.15;
    return `rgb(255,${Math.round(55 + s * 200)},${Math.round(s * 255)})`;
  }
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
  if (sweepMode) sweepMode.textContent = state.mode === 'sweep' ? 'Sweep' : state.mode === 'white-noise' ? 'White' : 'Pink';
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
      `Confidence: ${classification.confidence}% | Duration: ${classification.duration}s | ` +
      `Centroid: ${classification.spectralCentroid}Hz | HNR: ${classification.hnr}dB` +
      (classification.hasVoicePattern ? ' | Voice pattern detected' : '');
  }

  // Auto-hide after 5 seconds
  if (evpAlertTimeout) clearTimeout(evpAlertTimeout);
  evpAlertTimeout = setTimeout(() => {
    if (evpAlert) evpAlert.classList.remove('visible');
  }, 5000);
}

// ─── Live Indicators ────────────────────────────────────────────────────────────
function updateLiveIndicators() {
  if (!liveIndicators) return;
  const chips = [];

  // Audio anomaly
  if (evpAudioEngine.isAnomaly) {
    chips.push('<span class="indicator-chip anomaly">AUDIO ANOMALY</span>');
  }

  // Voice pattern
  const formants = evpAudioEngine.getFormantAnalysis();
  if (formants && formants.hasVoicePattern) {
    chips.push('<span class="indicator-chip voice">VOICE PATTERN</span>');
  }

  // EMF
  const emfState = emfSensorEngine.getEMFAnomaly();
  if (emfState.isAnomaly) {
    chips.push('<span class="indicator-chip emf">EMF SPIKE +' + emfState.deviationMicroTesla.toFixed(1) + 'uT</span>');
  }

  // Motion
  if (visualAnomalyEngine.getMotionLevel() > 10) {
    chips.push('<span class="indicator-chip motion">MOTION ' + visualAnomalyEngine.getMotionLevel().toFixed(0) + '%</span>');
  }

  // Infrasound
  const vibState = emfSensorEngine.getVibrationAnalysis();
  if (vibState.fearFreqAlert) {
    chips.push('<span class="indicator-chip infrasound">FEAR FREQ 18.98Hz</span>');
  } else if (vibState.infrasoundDetected) {
    chips.push('<span class="indicator-chip infrasound">INFRASOUND ' + vibState.dominantFreqHz.toFixed(1) + 'Hz</span>');
  }

  liveIndicators.innerHTML = chips.join('');
}

// ─── Panel Visibility ───────────────────────────────────────────────────────────
function showPanelsForMode() {
  // Audio panel — always shown when scanning
  if (audioPanel) audioPanel.classList.add('visible');
  if (spectrogramSection) spectrogramSection.classList.add('visible');

  // Sensor panel — always shown
  if (sensorPanel) sensorPanel.classList.add('visible');

  // Spirit box panel
  if (spiritBoxPanel) {
    spiritBoxPanel.classList.toggle('visible', scanMode === 'spiritbox' || scanMode === 'fullspectrum');
  }

  // Visual info panel
  if (visualInfoPanel) {
    visualInfoPanel.classList.toggle('visible', scanMode === 'visual' || scanMode === 'fullspectrum');
  }

  // Visual mode selector
  if (visualModeSelector) {
    visualModeSelector.style.display = (scanMode === 'visual' || scanMode === 'fullspectrum') ? 'flex' : 'none';
  }
}

function hidePanels() {
  if (audioPanel) audioPanel.classList.remove('visible');
  if (spectrogramSection) spectrogramSection.classList.remove('visible');
  if (sensorPanel) sensorPanel.classList.remove('visible');
  if (spiritBoxPanel) spiritBoxPanel.classList.remove('visible');
  if (visualInfoPanel) visualInfoPanel.classList.remove('visible');
  if (evpAlert) evpAlert.classList.remove('visible');
}

// ─── Event Listeners ────────────────────────────────────────────────────────────

// Start/Stop
if (btnStart) btnStart.addEventListener('click', startScan);
if (btnStop) btnStop.addEventListener('click', stopScan);

// New Scan
if (btnNewScan) {
  btnNewScan.addEventListener('click', () => {
    if (resultsPanel) resultsPanel.classList.remove('visible');
    if (playbackSection) playbackSection.classList.remove('visible');
    hidePanels();
    sessionRecorder.clearAll();
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
    btnRecord.classList.toggle('active', isRecording);
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
    // Show/hide visual mode selector
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
    // Download report as text file
    const summary = evidenceReport.getSummary();
    const timeline = evidenceReport.getTimelineEvents();

    let text = 'EVP-MINI INVESTIGATION REPORT\n';
    text += '================================\n\n';
    text += 'Generated: ' + new Date().toISOString() + '\n';
    text += 'Summary: ' + summary + '\n\n';

    text += 'TIMELINE:\n';
    for (const e of timeline) {
      text += `[${formatTimer(e.time * 1000)}] ${e.type.toUpperCase()}: ${e.detail}\n`;
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

    // Also download recording if available
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

// Only init if authenticated
if (document.getElementById('appWrapper') &&
    document.getElementById('appWrapper').classList.contains('authenticated')) {
  init();
} else {
  // Watch for authentication
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
