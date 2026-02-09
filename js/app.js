/* ============================================
   APP.JS - EVP-MINI Paranormal Investigation
   Main Controller
   ============================================ */

// ── DOM Elements ──────────────────────────────────────────────────────────────
const passwordGate       = document.getElementById('passwordGate');
const sitePassword       = document.getElementById('sitePassword');
const passwordError      = document.getElementById('passwordError');
const passwordSubmit     = document.getElementById('passwordSubmit');
const appWrapper         = document.getElementById('appWrapper');

const video              = document.getElementById('video');
const overlayCanvas      = document.getElementById('overlayCanvas');
const liveIndicator      = document.getElementById('liveIndicator');
const recordingIndicator = document.getElementById('recordingIndicator');

const modeSelector       = document.getElementById('modeSelector');
const durationSelector   = document.getElementById('durationSelector');

const btnStart           = document.getElementById('btnStart');
const btnStop            = document.getElementById('btnStop');
const btnFlip            = document.getElementById('btnFlip');

const statusBar          = document.getElementById('statusBar');
const modeBadge          = document.getElementById('modeBadge');
const nirBadge           = document.getElementById('nirBadge');

const timerSection       = document.getElementById('timerSection');
const timerValue         = document.getElementById('timerValue');

const spectrogramCanvas  = document.getElementById('spectrogramCanvas');

const meterRms           = document.getElementById('meterRms');
const meterHnr           = document.getElementById('meterHnr');
const meterSnr           = document.getElementById('meterSnr');
const meterRmsVal        = document.getElementById('meterRmsVal');
const meterHnrVal        = document.getElementById('meterHnrVal');
const meterSnrVal        = document.getElementById('meterSnrVal');

const sensorEmf          = document.getElementById('sensorEmf');
const sensorVibration    = document.getElementById('sensorVibration');
const sensorPressure     = document.getElementById('sensorPressure');
const emfValue           = document.getElementById('emfValue');
const vibrationValue     = document.getElementById('vibrationValue');
const pressureValue      = document.getElementById('pressureValue');
const emfStatus          = document.getElementById('emfStatus');
const vibrationStatus    = document.getElementById('vibrationStatus');
const pressureStatus     = document.getElementById('pressureStatus');

const spiritBoxPanel     = document.getElementById('spiritBoxPanel');
const spiritFreq         = document.getElementById('spiritFreq');
const sweepSpeed         = document.getElementById('sweepSpeed');
const sweepSpeedVal      = document.getElementById('sweepSpeedVal');
const noiseLevel         = document.getElementById('noiseLevel');
const toneLevel          = document.getElementById('toneLevel');
const spiritFragments    = document.getElementById('spiritFragments');

const visualModePanel    = document.getElementById('visualModePanel');
const visualModeSelector = document.getElementById('visualModeSelector');

const liveChips          = document.getElementById('liveChips');
const chipMotion         = document.getElementById('chipMotion');
const chipEmf            = document.getElementById('chipEmf');
const chipAudio          = document.getElementById('chipAudio');
const chipEvp            = document.getElementById('chipEvp');

const btnRecord          = document.getElementById('btnRecord');
const btnStopRecord      = document.getElementById('btnStopRecord');
const btnReverse         = document.getElementById('btnReverse');
const btnExport          = document.getElementById('btnExport');

const btnExportReport    = document.getElementById('btnExportReport');
const reportContent      = document.getElementById('reportContent');
const reportSections     = document.getElementById('reportSections');
const reportSummary      = document.getElementById('reportSummary');
const reportAudio        = document.getElementById('reportAudio');
const reportEvp          = document.getElementById('reportEvp');
const reportVisual       = document.getElementById('reportVisual');
const reportSensors      = document.getElementById('reportSensors');
const reportSpirit       = document.getElementById('reportSpirit');
const reportScience      = document.getElementById('reportScience');
const reportDisclaimer   = document.getElementById('reportDisclaimer');
const spiritBoxReportSection = document.getElementById('spiritBoxReportSection');

const sensorPermBanner   = document.getElementById('sensorPermBanner');
const btnSensorPerm      = document.getElementById('btnSensorPerm');

// ── State ─────────────────────────────────────────────────────────────────────
let running            = false;
let stream             = null;
let facingMode         = 'environment';
let scanStartTime      = null;
let frameCount         = 0;
let animFrameId        = null;
let scanMode           = 'evp';
let scanDuration       = 0;
let audioContextResumed = false;
let timedScanTimeout   = null;
let isRecordingActive  = false;

// UI throttle timestamps
let lastSensorUITime   = 0;
let lastChipUITime     = 0;

// ── Engines ───────────────────────────────────────────────────────────────────
const audioEngine    = new EVPAudioEngine();
const visualEngine   = new VisualAnomalyEngine();
const emfEngine      = new EMFSensorEngine();
const spiritBox      = new SpiritBoxEngine();
const classifier     = new EVPClassifier();
const recorder       = new SessionRecorder();
const report         = new EvidenceReport();

// ── Spectrogram State ─────────────────────────────────────────────────────────
let spectroCtx       = null;
let spectroInited    = false;

// ── Color map for spectrogram ─────────────────────────────────────────────────
function spectrogramColor(amplitude) {
  if (amplitude <= 30)  return [10, 10, 20];
  if (amplitude <= 60)  { const t = (amplitude - 31) / 29; return [Math.round(10 + 16 * t), Math.round(10 * (1 - t)), Math.round(20 + 38 * t)]; }
  if (amplitude <= 100) { const t = (amplitude - 61) / 39; return [Math.round(26 + 32 * t), Math.round(10 * (1 - t)), Math.round(58 + 48 * t)]; }
  if (amplitude <= 140) { const t = (amplitude - 101) / 39; return [Math.round(58 + 66 * t), Math.round(0 + 77 * t), Math.round(106 + 149 * t)]; }
  if (amplitude <= 180) { const t = (amplitude - 141) / 39; return [Math.round(124 * (1 - t)), Math.round(77 + 152 * t), Math.round(255)]; }
  if (amplitude <= 210) { const t = (amplitude - 181) / 29; return [0, Math.round(229 + 1 * t), Math.round(255 - 137 * t)]; }
  if (amplitude <= 240) { const t = (amplitude - 211) / 29; return [Math.round(255 * t), Math.round(230 + 4 * t), Math.round(118 * (1 - t))]; }
  { const t = (amplitude - 241) / 14; return [255, Math.round(234 - 211 * t), Math.round(0 + 68 * t)]; }
}

// ── Utility: safe HTML escape ─────────────────────────────────────────────────
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + s.toString().padStart(2, '0');
}

function formatTimeMs(ms) {
  return formatTime(ms / 1000);
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PRO LICENSE & AUTH
// ═══════════════════════════════════════════════════════════════════════════════

const PRO_KEY = 'evpmini_pro';
const PRO_EMAIL_KEY = 'evpmini_email';

function isProUser() {
  try {
    return localStorage.getItem(PRO_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function unlockPro(email) {
  try {
    localStorage.setItem(PRO_KEY, 'true');
    if (email) localStorage.setItem(PRO_EMAIL_KEY, email);
  } catch (e) {}
  applyProStatus();
}

function applyProStatus() {
  const isPro = isProUser();

  // Update mode buttons — lock pro-only modes if not pro
  const proModes = ['spiritbox', 'visual', 'fullspectrum'];
  const modeBtns = modeSelector ? modeSelector.querySelectorAll('[data-mode]') : [];
  modeBtns.forEach(function(btn) {
    const mode = btn.getAttribute('data-mode');
    if (proModes.includes(mode)) {
      if (isPro) {
        btn.classList.remove('locked');
        btn.disabled = false;
      } else {
        btn.classList.add('locked');
        // Don't disable — let click handler show upgrade modal
      }
    }
  });

  // Update recording buttons
  if (!isPro) {
    if (btnRecord) btnRecord.classList.add('locked');
    if (btnReverse) btnReverse.classList.add('locked');
    if (btnExport) btnExport.classList.add('locked');
    if (btnExportReport) btnExportReport.classList.add('locked');
  } else {
    if (btnRecord) btnRecord.classList.remove('locked');
    if (btnReverse) btnReverse.classList.remove('locked');
    if (btnExport) btnExport.classList.remove('locked');
    if (btnExportReport) btnExportReport.classList.remove('locked');
  }

  // Update mode badge
  if (modeBadge) {
    modeBadge.textContent = isPro ? 'PRO' : 'FREE';
    modeBadge.className = 'mode-badge ' + (isPro ? 'mode-badge-pro' : 'mode-badge-free');
    modeBadge.style.display = 'inline-block';
  }
}

// Show upgrade modal
function showUpgradeModal(featureName) {
  const modal = document.getElementById('upgradeModal');
  const msg = document.getElementById('upgradeMessage');
  if (modal) {
    if (msg) msg.textContent = (featureName || 'This feature') + ' requires EVP-MINI Pro.';
    modal.style.display = 'flex';
  }
}

function hideUpgradeModal() {
  const modal = document.getElementById('upgradeModal');
  if (modal) modal.style.display = 'none';
}

// Stripe Checkout redirect
async function startStripeCheckout() {
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 15000);
  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Payment system temporarily unavailable. Please try again.');
    }
  } catch (e) {
    clearTimeout(timeout);
    alert(e.name === 'AbortError'
      ? 'Request timed out. Please try again.'
      : 'Could not connect to payment server. Check your connection.');
  }
}

// Handle Stripe return
async function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const canceled = params.get('canceled');

  if (canceled) {
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (sessionId) {
    try {
      var verifyController = new AbortController();
      var verifyTimeout = setTimeout(function() { verifyController.abort(); }, 15000);
      const res = await fetch('/api/verify-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
        signal: verifyController.signal
      });
      clearTimeout(verifyTimeout);
      const data = await res.json();
      if (data.success) {
        unlockPro(data.email);
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
        // Show app directly
        showApp();
        return;
      }
    } catch (e) {}
    // Clean URL even on failure
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// Verify manual license key (email or session ID)
async function verifyLicenseKey(key) {
  const errorEl = document.getElementById('licenseError');
  const controller = new AbortController();
  const timeout = setTimeout(function() { controller.abort(); }, 15000);
  try {
    const res = await fetch('/api/verify-license-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key.trim() }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.success) {
      unlockPro(data.email);
      showApp();
    } else {
      if (errorEl) {
        errorEl.textContent = data.error || 'Invalid key. Check your purchase email.';
        errorEl.style.display = 'block';
      }
    }
  } catch (e) {
    clearTimeout(timeout);
    if (errorEl) {
      errorEl.textContent = e.name === 'AbortError'
        ? 'Request timed out. Please try again.'
        : 'Could not verify. Check your connection.';
      errorEl.style.display = 'block';
    }
  }
}

function showApp() {
  const landing = document.getElementById('landingPage');
  if (landing) landing.style.display = 'none';
  if (appWrapper) appWrapper.style.display = 'block';
  applyProStatus();
}


// ═══════════════════════════════════════════════════════════════════════════════
//  CAMERA INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

async function startCamera() {
  // Stop existing stream if any
  if (stream) {
    stream.getTracks().forEach(function(t) { t.stop(); });
    stream = null;
  }

  // Progressive fallback constraints
  const constraintSets = [
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: true },
    { video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true },
    { video: { facingMode: facingMode }, audio: true },
    { video: true, audio: true }
  ];

  for (let i = 0; i < constraintSets.length; i++) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraintSets[i]);
      if (video) {
        video.srcObject = stream;
        await new Promise(function(resolve, reject) {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
          setTimeout(reject, 5000);
        });
      }

      // Init overlay canvas to match video dimensions
      if (overlayCanvas && video) {
        overlayCanvas.width  = video.videoWidth  || 640;
        overlayCanvas.height = video.videoHeight || 480;
      }

      // Init visual engine with video dimensions
      if (video && video.videoWidth > 0) {
        visualEngine.init(video.videoWidth, video.videoHeight);
      }

      // Init audio engine with stream
      if (stream.getAudioTracks().length > 0) {
        await audioEngine.init(stream);
        // Init spirit box with shared AudioContext
        if (audioEngine.audioContext) {
          spiritBox.init(audioEngine.audioContext);
        }
      }

      // Init session recorder with stream
      recorder.init(stream);

      return true;
    } catch (err) {
      continue;
    }
  }

  return false;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  CAMERA FLIP
// ═══════════════════════════════════════════════════════════════════════════════

async function flipCamera() {
  facingMode = (facingMode === 'environment') ? 'user' : 'environment';
  // Show/hide NIR badge for front camera
  if (nirBadge) {
    nirBadge.style.display = (facingMode === 'user') ? 'inline-block' : 'none';
  }
  await startCamera();
}

if (btnFlip) {
  btnFlip.addEventListener('click', flipCamera);
}


// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIO CONTEXT RESUME (mobile gesture requirement)
// ═══════════════════════════════════════════════════════════════════════════════

function resumeAudioContext() {
  if (audioContextResumed) return;
  if (audioEngine.audioContext && audioEngine.audioContext.state === 'suspended') {
    audioEngine.audioContext.resume().catch(function() {});
  }
  audioContextResumed = true;
}


// ═══════════════════════════════════════════════════════════════════════════════
//  iOS SENSOR PERMISSION
// ═══════════════════════════════════════════════════════════════════════════════

function detectiOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function checkSensorPermBanner() {
  if (detectiOS() && typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    if (sensorPermBanner) sensorPermBanner.style.display = 'block';
  }
}

if (btnSensorPerm) {
  btnSensorPerm.addEventListener('click', async function() {
    const result = await emfEngine.requestPermissions();
    if (sensorPermBanner) sensorPermBanner.style.display = 'none';
    if (result.orientation === 'granted' || result.motion === 'granted') {
      setStatus('Sensor permissions granted.');
    }
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  STATUS BAR
// ═══════════════════════════════════════════════════════════════════════════════

function setStatus(msg, className) {
  if (statusBar) {
    statusBar.textContent = msg;
    statusBar.className = 'status-bar' + (className ? ' ' + className : '');
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  SCAN MODE SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

if (modeSelector) {
  const modeBtns = modeSelector.querySelectorAll('[data-mode]');
  modeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const mode = btn.getAttribute('data-mode');
      if (!mode) return;

      // Pro gate check
      const proModes = ['spiritbox', 'visual', 'fullspectrum'];
      if (proModes.includes(mode) && !isProUser()) {
        const names = { spiritbox: 'Spirit Box', visual: 'Visual Scan', fullspectrum: 'Full Spectrum' };
        showUpgradeModal(names[mode] || 'This mode');
        return;
      }

      // Update active button state
      modeBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      scanMode = mode;

      // Show/hide spirit box panel
      if (spiritBoxPanel) {
        spiritBoxPanel.style.display = (mode === 'spiritbox' || mode === 'fullspectrum') ? 'block' : 'none';
      }

      // Show/hide visual mode panel
      if (visualModePanel) {
        visualModePanel.style.display = (mode === 'visual' || mode === 'fullspectrum') ? 'block' : 'none';
      }

      // Update mode badge
      if (modeBadge) {
        var labels = { evp: 'EVP SCAN', spiritbox: 'SPIRIT BOX', visual: 'VISUAL', fullspectrum: 'FULL SPECTRUM' };
        modeBadge.textContent = labels[mode] || mode.toUpperCase();
        modeBadge.style.display = 'inline-block';
      }

      // If currently running, adjust active engines
      if (running) {
        if ((mode === 'spiritbox' || mode === 'fullspectrum') && !spiritBox.running) {
          spiritBox.start();
        } else if (mode !== 'spiritbox' && mode !== 'fullspectrum' && spiritBox.running) {
          spiritBox.stop();
        }
      }
    });
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DURATION SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

if (durationSelector) {
  var durBtns = durationSelector.querySelectorAll('[data-duration]');
  durBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var dur = parseInt(btn.getAttribute('data-duration'), 10);
      durBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      scanDuration = isNaN(dur) ? 0 : dur;
    });
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  START INVESTIGATION
// ═══════════════════════════════════════════════════════════════════════════════

async function startScan() {
  if (running) return;

  // Resume AudioContext from user gesture
  resumeAudioContext();

  // Start camera if not running
  if (!stream) {
    var camResult = await startCamera();
    if (!camResult) {
      setStatus('Camera/mic access failed. Please allow permissions.', 'error');
      return;
    }
  }

  // Reset all engines
  audioEngine.clearAll();
  if (visualEngine._initialized) {
    visualEngine.destroy();
    if (video && video.videoWidth > 0) {
      visualEngine.init(video.videoWidth, video.videoHeight);
    }
  }
  emfEngine.clearAll();
  spiritBox.clearAll();
  classifier.reset();
  recorder.clearAll();
  report.clearAll();

  // Start EMF sensor engine
  if (!emfEngine.isInitialized) {
    try { await emfEngine.init(); } catch (e) { /* sensors may not be available */ }
  } else {
    emfEngine.clearAll();
  }

  // If spiritbox or fullspectrum mode, start spirit box
  if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
    spiritBox.start();
  }

  // Set running state
  running = true;
  scanStartTime = Date.now();
  frameCount = 0;
  lastSensorUITime = 0;
  lastChipUITime = 0;

  // Reset spectrogram
  initSpectrogram();

  // Show timer, live indicator, live chips
  if (timerSection)    timerSection.style.display = 'block';
  if (liveIndicator)   liveIndicator.style.display = 'flex';
  if (liveChips)       liveChips.style.display = 'flex';

  // Hide start button, show stop button
  if (btnStart) btnStart.style.display = 'none';
  if (btnStop)  btnStop.style.display  = 'inline-block';

  // Enable record button
  if (btnRecord) btnRecord.disabled = false;

  // Update status bar
  setStatus('Scanning...', 'scanning');

  // Hide report sections from previous scan
  if (reportSections) reportSections.style.display = 'none';
  if (reportContent) {
    var placeholder = reportContent.querySelector('.report-placeholder');
    if (placeholder) placeholder.style.display = 'block';
  }

  // Start animation frame loop
  animFrameId = requestAnimationFrame(processFrame);

  // If timed scan, set timeout for auto-stop
  if (timedScanTimeout) {
    clearTimeout(timedScanTimeout);
    timedScanTimeout = null;
  }
  if (scanDuration > 0) {
    timedScanTimeout = setTimeout(function() {
      completeScan();
    }, scanDuration * 1000 + 100); // slight buffer
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  STOP INVESTIGATION
// ═══════════════════════════════════════════════════════════════════════════════

function stopScan() {
  completeScan();
}

function completeScan() {
  if (!running) return;
  running = false;

  // Cancel animation frame
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Clear timed scan timeout
  if (timedScanTimeout) {
    clearTimeout(timedScanTimeout);
    timedScanTimeout = null;
  }

  // Stop spirit box if active
  if (spiritBox.running) {
    spiritBox.stop();
  }

  // Stop recording if active
  if (isRecordingActive) {
    recorder.stopRecording();
    isRecordingActive = false;
    if (recordingIndicator) recordingIndicator.style.display = 'none';
    if (btnRecord)     btnRecord.style.display     = 'inline-block';
    if (btnStopRecord) btnStopRecord.style.display = 'none';
  }

  // Hide live indicator, timer
  if (liveIndicator) liveIndicator.style.display = 'none';
  if (timerSection)  timerSection.style.display   = 'none';

  // Show start button, hide stop button
  if (btnStart) btnStart.style.display = 'inline-block';
  if (btnStop)  btnStop.style.display  = 'none';

  // Update status bar
  setStatus('Scan complete');

  // Enable recording export/reverse if recording exists
  var recState = recorder.getRecordingState();
  if (recState.hasRecording) {
    if (btnReverse) btnReverse.disabled = false;
    if (btnExport)  btnExport.disabled  = false;
  }

  // Generate and render evidence report
  renderEvidenceReport();
}

if (btnStart) btnStart.addEventListener('click', startScan);
if (btnStop)  btnStop.addEventListener('click', stopScan);


// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PROCESSING LOOP
// ═══════════════════════════════════════════════════════════════════════════════

function processFrame() {
  if (!running) return;

  var now = performance.now();
  var elapsed = Date.now() - scanStartTime;

  // 1. Update timer display
  updateTimer(elapsed);

  // 2. Check timed scan completion
  if (scanDuration > 0 && elapsed >= scanDuration * 1000) {
    completeScan();
    return;
  }

  // 3. Visual processing
  var visualResult = null;
  if (scanMode === 'visual' || scanMode === 'fullspectrum') {
    if (video && video.readyState >= 2 && overlayCanvas) {
      visualResult = visualEngine.processFrame(video, overlayCanvas);
    }
  } else {
    // In non-visual modes, just draw video to canvas (passthrough)
    if (overlayCanvas && video && video.readyState >= 2) {
      var ctx = overlayCanvas.getContext('2d');
      if (ctx) {
        if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
          overlayCanvas.width  = video.videoWidth;
          overlayCanvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, overlayCanvas.width, overlayCanvas.height);
      }
    }
  }

  // 4. Audio processing (all modes)
  var audioResult = null;
  if (audioEngine.isInitialized) {
    audioResult = audioEngine.processAudioFrame();
  }

  // 5. Spirit box processing
  var spiritResult = null;
  if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') {
    spiritResult = spiritBox.processFrame();
  }

  // 6. EMF sensor processing (all modes)
  var sensorResult = null;
  if (emfEngine.isInitialized) {
    sensorResult = emfEngine.processFrame();
  }

  // 7. EVP classification
  var evpResult = null;
  if (audioResult && audioEngine.isInitialized) {
    var quickAssess = audioEngine.getQuickAssess();
    var noiseFloor  = audioEngine.getNoiseFloor();
    evpResult = classifier.processFrame(quickAssess, noiseFloor);
  }

  // 8. Update all UI elements
  updateSpectrogramCanvas(audioResult);
  updateAudioMeters(audioResult);

  // Throttle sensor and chip UI updates
  if (now - lastSensorUITime > 100) {
    updateSensorDisplay(sensorResult);
    updateSpiritBoxDisplay(spiritResult);
    lastSensorUITime = now;
  }
  if (now - lastChipUITime > 200) {
    updateLiveChips(audioResult, visualResult, sensorResult);
    lastChipUITime = now;
  }

  // 9. Handle anomaly alerts
  var audioAnomaly   = audioResult && audioResult.anomalyDetected;
  var sensorAnomaly  = sensorResult && sensorResult.overallAnomaly;
  var visualAnomaly  = visualResult && visualResult.anomalyDetected;

  if (audioAnomaly || sensorAnomaly || visualAnomaly) {
    handleAnomaly(audioResult, visualResult, sensorResult, evpResult);
  }

  // 10. If EVP classified, show live notification
  if (evpResult) {
    showEVPNotification(evpResult);
  }

  frameCount++;
  animFrameId = requestAnimationFrame(processFrame);
}


// ═══════════════════════════════════════════════════════════════════════════════
//  UI UPDATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function updateTimer(elapsed) {
  if (!timerValue) return;

  if (scanDuration > 0) {
    // Show countdown for timed scans
    var remaining = Math.max(0, scanDuration * 1000 - elapsed);
    timerValue.textContent = formatTimeMs(remaining);
  } else {
    // Show elapsed time for continuous scans
    timerValue.textContent = formatTimeMs(elapsed);
  }
}


// ── Spectrogram ───────────────────────────────────────────────────────────────

function initSpectrogram() {
  if (!spectrogramCanvas) return;
  spectroCtx = spectrogramCanvas.getContext('2d');
  if (spectroCtx) {
    spectroCtx.fillStyle = '#0a0a14';
    spectroCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
    spectroInited = true;
  }
}

function updateSpectrogramCanvas(audioResult) {
  if (!spectroCtx || !spectrogramCanvas || !spectroInited) return;
  if (!audioResult || !audioResult.frequencyData) return;

  var w = spectrogramCanvas.width;
  var h = spectrogramCanvas.height;
  if (w === 0 || h === 0) return;

  // Scroll spectrogram left by 1 pixel
  var imgData = spectroCtx.getImageData(1, 0, w - 1, h);
  spectroCtx.putImageData(imgData, 0, 0);

  // Draw new column on right edge using frequency data
  // Focus on voice range (0-4000Hz) mapped to bottom 40% of canvas
  // But we also show up to ~8000Hz across the full canvas for visual context
  var freqData = audioResult.frequencyData;
  var binCount = freqData.length;
  var sampleRate = audioEngine.sampleRate || 48000;
  var binResolution = sampleRate / (audioEngine.fftSize || 8192);

  // Max frequency to display ~8000Hz
  var maxFreqHz = 8000;
  var maxBin = Math.min(binCount - 1, Math.ceil(maxFreqHz / binResolution));

  // Draw from bottom (0Hz) to top (maxFreqHz)
  for (var y = 0; y < h; y++) {
    // y=0 is top (high freq), y=h-1 is bottom (low freq)
    var freqRatio = 1 - (y / h);
    var bin = Math.floor(freqRatio * maxBin);
    if (bin < 0) bin = 0;
    if (bin >= binCount) bin = binCount - 1;

    var amplitude = freqData[bin];
    var rgb = spectrogramColor(amplitude);

    spectroCtx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
    spectroCtx.fillRect(w - 1, y, 1, 1);
  }
}


// ── Audio Meters ──────────────────────────────────────────────────────────────

function updateAudioMeters(audioResult) {
  if (!audioResult) return;

  // RMS meter
  var rmsPercent = Math.min(100, audioResult.rmsLevel * 500);
  var rmsDb = audioResult.rmsDb !== undefined ? audioResult.rmsDb : -100;
  if (meterRms) {
    meterRms.style.width = rmsPercent + '%';
    if (rmsPercent > 60) {
      meterRms.style.backgroundColor = '#ff1744';
    } else if (rmsPercent > 30) {
      meterRms.style.backgroundColor = '#ffea00';
    } else {
      meterRms.style.backgroundColor = '';
    }
  }
  if (meterRmsVal) {
    meterRmsVal.textContent = (rmsDb > -100) ? rmsDb.toFixed(1) + ' dB' : '-\u221E dB';
  }

  // HNR meter
  var hnr = audioResult.hnr !== undefined ? audioResult.hnr : 0;
  var hnrPercent = Math.min(100, Math.max(0, (hnr + 20) / 60 * 100));
  if (meterHnr) {
    meterHnr.style.width = hnrPercent + '%';
    if (hnr > 15) {
      meterHnr.style.backgroundColor = '#00e676';
    } else if (hnr > 8) {
      meterHnr.style.backgroundColor = '#ffea00';
    } else {
      meterHnr.style.backgroundColor = '';
    }
  }
  if (meterHnrVal) {
    meterHnrVal.textContent = hnr.toFixed(1) + ' dB';
  }

  // SNR meter
  var snr = audioResult.snr !== undefined ? audioResult.snr : 0;
  var snrPercent = Math.min(100, Math.max(0, (snr + 10) / 70 * 100));
  if (meterSnr) {
    meterSnr.style.width = snrPercent + '%';
    if (snr > 20) {
      meterSnr.style.backgroundColor = '#00e676';
    } else if (snr > 10) {
      meterSnr.style.backgroundColor = '#ffea00';
    } else {
      meterSnr.style.backgroundColor = '';
    }
  }
  if (meterSnrVal) {
    meterSnrVal.textContent = snr.toFixed(1) + ' dB';
  }
}


// ── Sensor Display ────────────────────────────────────────────────────────────

function updateSensorDisplay(sensorResult) {
  if (!sensorResult) return;

  // EMF
  var emf = sensorResult.emf;
  if (emf) {
    if (emfValue) {
      emfValue.textContent = emf.available ? emf.magnitude.toFixed(1) : '--';
    }
    if (emfStatus) {
      if (!emf.available) {
        emfStatus.textContent = 'Unavailable';
      } else if (emf.anomaly) {
        emfStatus.textContent = 'ANOMALY +' + emf.deviation.toFixed(1) + '\u00B5T';
      } else if (emf.baseline > 0) {
        emfStatus.textContent = 'Baseline: ' + emf.baseline.toFixed(1) + '\u00B5T';
      } else {
        emfStatus.textContent = 'Calibrating...';
      }
    }
    if (sensorEmf) {
      if (emf.anomaly) {
        sensorEmf.classList.add('anomaly');
      } else {
        sensorEmf.classList.remove('anomaly');
      }
    }
  }

  // Vibration
  var vib = sensorResult.vibration;
  if (vib) {
    if (vibrationValue) {
      vibrationValue.textContent = vib.available ? vib.magnitude.toFixed(2) : '--';
    }
    if (vibrationStatus) {
      if (!vib.available) {
        vibrationStatus.textContent = 'Unavailable';
      } else if (vib.fearFreqDetected) {
        vibrationStatus.textContent = 'FEAR FREQ 18.98Hz';
      } else if (vib.infrasoundDetected) {
        vibrationStatus.textContent = 'Infrasound ' + vib.dominantFreq.toFixed(1) + 'Hz';
      } else if (vib.dominantFreq > 0) {
        vibrationStatus.textContent = vib.dominantFreq.toFixed(1) + ' Hz dominant';
      } else {
        vibrationStatus.textContent = 'Monitoring';
      }
    }
    if (sensorVibration) {
      if (vib.anomaly || vib.fearFreqDetected) {
        sensorVibration.classList.add('anomaly');
      } else {
        sensorVibration.classList.remove('anomaly');
      }
    }
  }

  // Pressure
  var pres = sensorResult.pressure;
  if (pres) {
    if (pressureValue) {
      pressureValue.textContent = pres.hPa ? pres.hPa.toFixed(1) : '--';
    }
    if (pressureStatus) {
      if (pres.anomaly) {
        pressureStatus.textContent = 'ANOMALY \u0394' + pres.change.toFixed(1) + ' hPa';
      } else if (pres.simulated) {
        pressureStatus.textContent = 'Simulated';
      } else if (pres.available) {
        pressureStatus.textContent = 'Monitoring';
      } else {
        pressureStatus.textContent = 'Unavailable';
      }
    }
    if (sensorPressure) {
      if (pres.anomaly) {
        sensorPressure.classList.add('anomaly');
      } else {
        sensorPressure.classList.remove('anomaly');
      }
    }
  }
}


// ── Spirit Box Display ────────────────────────────────────────────────────────

function updateSpiritBoxDisplay(spiritResult) {
  if (!spiritResult) return;

  // Update frequency display
  if (spiritFreq) {
    spiritFreq.textContent = spiritResult.displayFreq || '87.5';
  }

  // Update fragment list
  if (spiritResult.fragmentCaptured && spiritResult.currentFragment && spiritFragments) {
    var frag = spiritResult.currentFragment;
    var fragEl = document.createElement('div');
    fragEl.className = 'spirit-fragment';
    fragEl.textContent = frag.freq + ' MHz @ ' + frag.startTime + 's (' + frag.duration + 'ms)';
    spiritFragments.insertBefore(fragEl, spiritFragments.firstChild);
    // Keep list bounded
    while (spiritFragments.children.length > 20) {
      spiritFragments.removeChild(spiritFragments.lastChild);
    }
  }
}


// ── Live Chips ────────────────────────────────────────────────────────────────

function updateLiveChips(audioResult, visualResult, sensorResult) {
  // Motion chip
  if (chipMotion) {
    var motionLvl = (visualResult && typeof visualResult.motionLevel === 'number')
      ? visualResult.motionLevel
      : visualEngine.getMotionLevel();
    chipMotion.textContent = 'Motion: ' + motionLvl.toFixed(0) + '%';
    if (motionLvl > 20) {
      chipMotion.style.color = '#ff1744';
    } else if (motionLvl > 5) {
      chipMotion.style.color = '#ffea00';
    } else {
      chipMotion.style.color = '';
    }
  }

  // EMF chip
  if (chipEmf && sensorResult && sensorResult.emf) {
    var emf = sensorResult.emf;
    if (emf.available) {
      chipEmf.textContent = 'EMF: ' + emf.magnitude.toFixed(1) + ' \u00B5T';
      if (emf.anomaly) {
        chipEmf.style.color = '#ff1744';
      } else {
        chipEmf.style.color = '';
      }
    } else {
      chipEmf.textContent = 'EMF: -- \u00B5T';
      chipEmf.style.color = '';
    }
  }

  // Audio chip
  if (chipAudio && audioResult) {
    var rmsDb = audioResult.rmsDb !== undefined ? audioResult.rmsDb : -100;
    chipAudio.textContent = 'Audio: ' + (rmsDb > -100 ? rmsDb.toFixed(1) : '-\u221E') + ' dB';
    if (audioResult.anomalyDetected) {
      chipAudio.style.color = '#ff1744';
    } else if (rmsDb > -30) {
      chipAudio.style.color = '#ffea00';
    } else {
      chipAudio.style.color = '';
    }
  }
}


// ── Anomaly Handling ──────────────────────────────────────────────────────────

var anomalyAlertTimeout = null;

function handleAnomaly(audioResult, visualResult, sensorResult, evpResult) {
  // Flash anomaly alert on status bar
  if (statusBar) {
    statusBar.classList.add('anomaly');
  }

  // Add anomaly class to relevant panels
  if (audioResult && audioResult.anomalyDetected && sensorEmf) {
    // Audio anomaly visual cue - handled by meter colors
  }

  // Remove after 1 second
  if (anomalyAlertTimeout) clearTimeout(anomalyAlertTimeout);
  anomalyAlertTimeout = setTimeout(function() {
    if (statusBar) statusBar.classList.remove('anomaly');
    if (sensorEmf)       sensorEmf.classList.remove('anomaly');
    if (sensorVibration) sensorVibration.classList.remove('anomaly');
    if (sensorPressure)  sensorPressure.classList.remove('anomaly');
  }, 1000);
}


// ── EVP Notification ──────────────────────────────────────────────────────────

function showEVPNotification(evpResult) {
  if (!evpResult || !evpResult.class) return;

  // Show the EVP chip
  if (chipEvp) {
    chipEvp.style.display = 'inline-block';
    chipEvp.textContent = 'EVP: Class ' + evpResult.class + ' (' + evpResult.confidence + '%)';

    if (evpResult.class === 'A') {
      chipEvp.style.color = '#00e676';
    } else if (evpResult.class === 'B') {
      chipEvp.style.color = '#ffea00';
    } else {
      chipEvp.style.color = '#ff9100';
    }
  }

  // Create floating notification
  var notification = document.createElement('div');
  notification.className = 'evp-notification';
  notification.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:1000;' +
    'padding:12px 24px;border-radius:8px;font-weight:bold;font-size:1rem;' +
    'animation:fadeInOut 3s ease forwards;pointer-events:none;text-align:center;' +
    'box-shadow:0 4px 20px rgba(0,0,0,0.5);';

  if (evpResult.class === 'A') {
    notification.style.backgroundColor = 'rgba(0, 230, 118, 0.9)';
    notification.style.color = '#000';
    notification.textContent = 'EVP Class A Detected! (' + evpResult.confidence + '% confidence)';
  } else if (evpResult.class === 'B') {
    notification.style.backgroundColor = 'rgba(255, 234, 0, 0.9)';
    notification.style.color = '#000';
    notification.textContent = 'EVP Class B Detected (' + evpResult.confidence + '% confidence)';
  } else {
    notification.style.backgroundColor = 'rgba(255, 145, 0, 0.9)';
    notification.style.color = '#000';
    notification.textContent = 'EVP Class C Detected (' + evpResult.confidence + '% confidence)';
  }

  document.body.appendChild(notification);

  // Auto-dismiss after 3 seconds
  setTimeout(function() {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);

  // Haptic feedback
  if (navigator.vibrate) {
    if (evpResult.class === 'A') {
      navigator.vibrate([100, 50, 100, 50, 100]);
    } else if (evpResult.class === 'B') {
      navigator.vibrate([100, 50, 100]);
    } else {
      navigator.vibrate(100);
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  EVIDENCE REPORT RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

function renderEvidenceReport() {
  // Collect analysis from all engines
  var audioAnalysis   = audioEngine.isInitialized ? audioEngine.fullAnalysis() : null;
  var visualAnalysis  = visualEngine._initialized ? visualEngine.fullAnalysis() : null;
  var sensorAnalysis  = emfEngine.isInitialized   ? emfEngine.fullAnalysis()   : null;
  var evpAnalysis     = classifier.fullAnalysis();
  var spiritAnalysis  = spiritBox.isInitialized    ? spiritBox.fullAnalysis()   : null;
  var recState        = recorder.getRecordingState();

  // Use EvidenceReport engine to analyze
  report.analyze(audioAnalysis, spiritAnalysis, visualAnalysis, sensorAnalysis, evpAnalysis, recState);

  // Hide placeholder, show report sections
  if (reportContent) {
    var placeholder = reportContent.querySelector('.report-placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }
  if (reportSections) reportSections.style.display = 'block';

  // ── Render summary section ──
  if (reportSummary) {
    var elapsed = scanStartTime ? (Date.now() - scanStartTime) / 1000 : 0;
    var totalAnomalies = (audioAnalysis ? audioAnalysis.anomalyCount : 0) +
                         (visualAnalysis ? visualAnalysis.anomalyCount : 0) +
                         (sensorAnalysis ? sensorAnalysis.totalEvents : 0);
    var evpStats = evpAnalysis.stats || { classA: 0, classB: 0, classC: 0, total: 0 };

    // Overall score (0-100)
    var overallScore = 0;
    if (evpStats.classA > 0)      overallScore += 40;
    if (evpStats.classB > 0)      overallScore += 20;
    if (evpStats.classC > 0)      overallScore += 10;
    if (totalAnomalies > 20)      overallScore += 30;
    else if (totalAnomalies > 10) overallScore += 20;
    else if (totalAnomalies > 3)  overallScore += 10;
    overallScore = Math.min(100, overallScore);

    var verdict = 'No significant anomalous activity detected.';
    var scoreColor = '#00e5ff';
    if (overallScore >= 70)      { verdict = 'Significant anomalous activity detected. Multiple correlated sensor readings suggest environmental anomalies worthy of further investigation.'; scoreColor = '#ff1744'; }
    else if (overallScore >= 40) { verdict = 'Moderate anomalous activity detected. Some sensor readings deviated from baseline, though mundane explanations are plausible.'; scoreColor = '#ffea00'; }
    else if (overallScore >= 15) { verdict = 'Minimal anomalous activity detected. Brief fluctuations noted but within typical environmental variance.'; scoreColor = '#00e676'; }

    reportSummary.innerHTML =
      '<div class="report-row"><strong>Date:</strong> ' + escHtml(new Date().toLocaleString()) + '</div>' +
      '<div class="report-row"><strong>Duration:</strong> ' + escHtml(formatTime(elapsed)) + '</div>' +
      '<div class="report-row"><strong>Mode:</strong> ' + escHtml(scanMode.toUpperCase()) + '</div>' +
      '<div class="report-row"><strong>Total Anomalies:</strong> ' + totalAnomalies + '</div>' +
      '<div class="report-row"><strong>EVP Candidates:</strong> A:' + evpStats.classA + ' B:' + evpStats.classB + ' C:' + evpStats.classC + ' (Total: ' + evpStats.total + ')</div>' +
      '<div class="report-row"><strong>Overall Score:</strong> <span style="color:' + scoreColor + ';font-weight:bold;">' + overallScore + '/100</span></div>' +
      '<div style="margin-top:8px;height:8px;background:#1a1a3e;border-radius:4px;overflow:hidden;">' +
        '<div style="width:' + overallScore + '%;height:100%;background:' + scoreColor + ';border-radius:4px;transition:width 0.5s;"></div>' +
      '</div>' +
      '<div class="report-row" style="margin-top:8px;color:#9e9ec0;font-style:italic;">' + escHtml(verdict) + '</div>';
  }

  // ── Render audio evidence section ──
  if (reportAudio && audioAnalysis) {
    var voiceActivity = audioAnalysis.voiceRangeActivity !== undefined ? audioAnalysis.voiceRangeActivity.toFixed(1) : '0';
    reportAudio.innerHTML =
      '<div class="report-row"><strong>Audio Anomaly Events:</strong> ' + (audioAnalysis.anomalyCount || 0) + '</div>' +
      '<div class="report-row"><strong>Baseline Noise Floor:</strong> ' + (audioAnalysis.baselineNoiseFloor > -100 ? audioAnalysis.baselineNoiseFloor.toFixed(1) + ' dB' : 'Not established') + '</div>' +
      '<div class="report-row"><strong>Average RMS:</strong> ' + (audioAnalysis.averageRms !== undefined ? audioAnalysis.averageRms.toFixed(1) + ' dB' : 'N/A') + '</div>' +
      '<div class="report-row"><strong>Peak RMS:</strong> ' + (audioAnalysis.peakRms > -100 ? audioAnalysis.peakRms.toFixed(1) + ' dB' : 'N/A') + '</div>' +
      '<div class="report-row"><strong>Average HNR:</strong> ' + (audioAnalysis.averageHnr !== undefined ? audioAnalysis.averageHnr.toFixed(1) + ' dB' : 'N/A') + '</div>' +
      '<div class="report-row"><strong>Voice Range Activity:</strong> ' + voiceActivity + '%</div>' +
      '<div class="report-row"><strong>Sample Rate:</strong> ' + (audioAnalysis.sampleRate || 'N/A') + ' Hz | FFT: ' + (audioAnalysis.fftSize || 'N/A') + '</div>';
  } else if (reportAudio) {
    reportAudio.innerHTML = '<div class="report-row">Audio engine was not initialized during this session.</div>';
  }

  // ── Render EVP classifications section ──
  if (reportEvp && evpAnalysis) {
    var classifications = evpAnalysis.classifications || [];
    if (classifications.length > 0) {
      var evpHtml = '';
      for (var i = 0; i < classifications.length; i++) {
        var c = classifications[i];
        var badgeColor = c.class === 'A' ? '#00e676' : c.class === 'B' ? '#ffea00' : '#ff9100';
        evpHtml +=
          '<div style="margin-bottom:12px;padding:8px;background:#1a1a3e;border-radius:6px;border-left:3px solid ' + badgeColor + ';">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
              '<span style="background:' + badgeColor + ';color:#000;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:0.85rem;">Class ' + escHtml(c.class) + '</span>' +
              '<span style="color:#9e9ec0;font-size:0.85rem;">' + escHtml(formatTime(c.timestamp)) + '</span>' +
              '<span style="color:#9e9ec0;font-size:0.85rem;">Confidence: ' + c.confidence + '%</span>' +
            '</div>' +
            '<div style="font-size:0.8rem;color:#8888bb;">' +
              'Duration: ' + c.duration + 's | Centroid: ' + c.spectralCentroid + 'Hz | HNR: ' + c.hnr + 'dB | SNR: ' + c.snr + 'dB' +
              (c.hasVoicePattern ? ' | <span style="color:#00e676;">Voice Pattern</span>' : '') +
            '</div>' +
            '<div style="font-size:0.8rem;color:#8888bb;margin-top:2px;">' +
              'Formants: F1=' + (c.formants ? c.formants.f1 : 0) + 'Hz F2=' + (c.formants ? c.formants.f2 : 0) + 'Hz F3=' + (c.formants ? c.formants.f3 : 0) + 'Hz' +
            '</div>' +
            (c.pareidoliaWarning ? '<div style="font-size:0.75rem;color:#ff9100;margin-top:4px;">Note: Low confidence - may be auditory pareidolia (Nees &amp; Phillips, 2015)</div>' : '') +
          '</div>';
      }
      reportEvp.innerHTML = evpHtml;
    } else {
      reportEvp.innerHTML = '<div class="report-row" style="color:#9e9ec0;">No EVP detected during this session.</div>';
    }
  }

  // ── Render visual findings section ──
  if (reportVisual && visualAnalysis) {
    reportVisual.innerHTML =
      '<div class="report-row"><strong>Total Frames Processed:</strong> ' + (visualAnalysis.totalFrames || 0) + '</div>' +
      '<div class="report-row"><strong>Average Motion Level:</strong> ' + (visualAnalysis.averageMotionLevel || 0).toFixed(1) + '%</div>' +
      '<div class="report-row"><strong>Peak Motion Level:</strong> ' + (visualAnalysis.peakMotionLevel || 0).toFixed(1) + '%</div>' +
      '<div class="report-row"><strong>Visual Anomaly Count:</strong> ' + (visualAnalysis.anomalyCount || 0) + '</div>' +
      '<div class="report-row"><strong>Modes Used:</strong> ' + escHtml((visualAnalysis.modesUsed || ['normal']).join(', ')) + '</div>' +
      '<div class="report-row"><strong>Processing FPS:</strong> ' + (visualAnalysis.processingFps || 0).toFixed(1) + '</div>';
  } else if (reportVisual) {
    reportVisual.innerHTML = '<div class="report-row">Visual engine was not active during this session.</div>';
  }

  // ── Render sensor data section ──
  if (reportSensors && sensorAnalysis) {
    var magData = sensorAnalysis.magnetometer || {};
    var vibData = sensorAnalysis.vibration || {};
    var presData = sensorAnalysis.pressure || {};
    var scientificNotes = sensorAnalysis.scientificNotes || [];

    var sensorHtml = '<div style="margin-bottom:10px;"><strong>EMF (Magnetometer)</strong></div>';
    if (magData.available) {
      sensorHtml +=
        '<div class="report-row">Source: ' + escHtml(magData.source) + '</div>' +
        '<div class="report-row">Baseline: ' + (magData.baseline || 0).toFixed(1) + ' \u00B5T</div>' +
        '<div class="report-row">Average: ' + (magData.averageMagnitude || 0).toFixed(1) + ' \u00B5T</div>' +
        '<div class="report-row">Peak Deviation: ' + (magData.peakDeviation || 0).toFixed(1) + ' \u00B5T</div>' +
        '<div class="report-row">Anomaly Count: ' + (magData.anomalyCount || 0) + '</div>';
    } else {
      sensorHtml += '<div class="report-row" style="color:#9e9ec0;">Magnetometer unavailable on this device.</div>';
    }

    sensorHtml += '<div style="margin-top:12px;margin-bottom:10px;"><strong>Vibration / Infrasound</strong></div>';
    if (vibData.available) {
      sensorHtml +=
        '<div class="report-row">Infrasound Events: ' + (vibData.infrasoundEvents || 0) + '</div>' +
        '<div class="report-row">Fear Frequency (18.98Hz) Detections: ' + (vibData.fearFreqDetections || 0) + '</div>' +
        '<div class="report-row">Vibration Anomalies: ' + (vibData.anomalyCount || 0) + '</div>' +
        '<div class="report-row">Dominant Frequency: ' + (vibData.dominantFrequency > 0 ? vibData.dominantFrequency.toFixed(1) + ' Hz' : 'N/A') + '</div>';
    } else {
      sensorHtml += '<div class="report-row" style="color:#9e9ec0;">Accelerometer unavailable on this device.</div>';
    }

    sensorHtml += '<div style="margin-top:12px;margin-bottom:10px;"><strong>Barometric Pressure</strong></div>';
    sensorHtml +=
      '<div class="report-row">Baseline: ' + (presData.baseline > 0 ? presData.baseline.toFixed(1) + ' hPa' : 'Not established') + '</div>' +
      '<div class="report-row">Max Change: ' + (presData.maxChange || 0).toFixed(1) + ' hPa</div>' +
      '<div class="report-row">Pressure Anomalies: ' + (presData.anomalyCount || 0) + '</div>' +
      '<div class="report-row">Data Source: ' + (presData.simulated ? 'Simulated' : presData.available ? 'Hardware' : 'Unavailable') + '</div>';

    reportSensors.innerHTML = sensorHtml;
  } else if (reportSensors) {
    reportSensors.innerHTML = '<div class="report-row">Sensor engine was not initialized during this session.</div>';
  }

  // ── Render spirit box section ──
  if (spiritAnalysis && (scanMode === 'spiritbox' || scanMode === 'fullspectrum')) {
    if (spiritBoxReportSection) spiritBoxReportSection.style.display = 'block';
    if (reportSpirit) {
      var fragments = spiritAnalysis.fragments || [];
      var spiritHtml =
        '<div class="report-row"><strong>Total Sweep Time:</strong> ' + (spiritAnalysis.totalSweepTime || 0) + 's</div>' +
        '<div class="report-row"><strong>Frequency Range:</strong> ' + escHtml(spiritAnalysis.frequencyRange || '87.5 - 108.0 MHz') + '</div>' +
        '<div class="report-row"><strong>Sweep Speed:</strong> ' + (spiritAnalysis.sweepSpeed || 100) + 'ms</div>' +
        '<div class="report-row"><strong>Total Sweeps:</strong> ' + (spiritAnalysis.totalSweeps || 0) + '</div>' +
        '<div class="report-row"><strong>Fragments Captured:</strong> ' + fragments.length + '</div>';

      if (fragments.length > 0) {
        spiritHtml += '<div style="margin-top:8px;"><strong>Fragment Log:</strong></div>';
        var maxFragShow = Math.min(fragments.length, 15);
        for (var fi = 0; fi < maxFragShow; fi++) {
          var frag = fragments[fi];
          spiritHtml += '<div class="report-row" style="font-size:0.8rem;color:#8888bb;">' +
            escHtml(frag.freq) + ' MHz at ' + frag.time + 's (' + frag.duration + 'ms)</div>';
        }
        if (fragments.length > 15) {
          spiritHtml += '<div class="report-row" style="color:#9e9ec0;">... and ' + (fragments.length - 15) + ' more fragments</div>';
        }
      }
      reportSpirit.innerHTML = spiritHtml;
    }
  } else {
    if (spiritBoxReportSection) spiritBoxReportSection.style.display = 'none';
  }

  // ── Render scientific context section ──
  if (reportScience) {
    reportScience.innerHTML =
      '<div style="margin-bottom:8px;"><strong>Methodology</strong></div>' +
      '<div class="report-row" style="font-size:0.85rem;color:#9e9ec0;">This investigation used real-time FFT audio analysis (' +
        (audioEngine.fftSize || 8192) + '-point, ' + (audioEngine.sampleRate || 48000) + ' Hz sample rate), ' +
        'device magnetometer/accelerometer sensors, and frame-differencing motion detection. ' +
        'EVP classification follows the standard A/B/C system based on formant structure, harmonic-to-noise ratio, and signal-to-noise ratio.</div>' +
      '<div style="margin-top:12px;margin-bottom:8px;"><strong>Scientific References</strong></div>' +
      '<div class="report-row" style="font-size:0.8rem;color:#8888bb;">Nees, M.A. &amp; Phillips, C. (2015). "Auditory pareidolia: Effects of contextual priming on perceptions of purportedly paranormal and ambiguous auditory stimuli." <em>Applied Cognitive Psychology</em>, 29(1), 129-134.</div>' +
      '<div class="report-row" style="font-size:0.8rem;color:#8888bb;">Tandy, V. &amp; Lawrence, T.R. (1998). "The ghost in the machine." <em>Journal of the Society for Psychical Research</em>, 62(851), 360-364.</div>' +
      '<div class="report-row" style="font-size:0.8rem;color:#8888bb;">Baruss, I. (2001). "Failure to replicate electronic voice phenomenon." <em>Journal of Scientific Exploration</em>, 15(3), 355-367.</div>' +
      '<div class="report-row" style="font-size:0.8rem;color:#8888bb;">Persinger, M.A. (1987). <em>Neuropsychological Bases of God Beliefs</em>. Praeger Publishers.</div>' +
      '<div style="margin-top:12px;margin-bottom:8px;"><strong>Limitations</strong></div>' +
      '<div class="report-row" style="font-size:0.85rem;color:#9e9ec0;">Smartphone microphones apply automatic gain control (AGC) that can amplify noise during quiet periods. ' +
        'DeviceOrientation-derived magnetometer values are approximations, not raw sensor data. ' +
        'Barometric pressure is simulated when hardware is unavailable. ' +
        'All EVP classifications are susceptible to auditory pareidolia.</div>';
  }

  // ── Show disclaimer ──
  if (reportDisclaimer) {
    reportDisclaimer.style.display = 'block';
  }

  // ── Enable export button ──
  if (btnExportReport) {
    btnExportReport.disabled = false;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  REPORT SECTION TOGGLES
// ═══════════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.report-section-header').forEach(function(header) {
  header.addEventListener('click', function() {
    var targetId = header.getAttribute('data-toggle');
    if (!targetId) return;

    var body = document.getElementById(targetId);
    if (!body) return;

    var isCollapsed = body.classList.contains('collapsed');
    body.classList.toggle('collapsed');

    // Rotate toggle icon chevron
    var icon = header.querySelector('.toggle-icon');
    if (icon) {
      icon.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
    }

    // Toggle body visibility
    if (isCollapsed) {
      body.style.display = '';
    } else {
      body.style.display = 'none';
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  REPORT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

if (btnExportReport) {
  btnExportReport.addEventListener('click', function() {
    if (!isProUser()) { showUpgradeModal('Report Export'); return; }
    var rpt = report.report;
    if (!rpt) return;

    var text = 'EVP-MINI INVESTIGATION REPORT\n';
    text += '================================\n\n';
    text += 'Generated: ' + new Date().toISOString() + '\n';
    text += 'Summary: ' + report.getSummary() + '\n\n';

    // Timeline events
    var timeline = report.getTimelineEvents();
    if (timeline.length > 0) {
      text += 'TIMELINE:\n';
      for (var i = 0; i < timeline.length; i++) {
        var ev = timeline[i];
        text += '[' + formatTime(ev.time) + '] ' + ev.type.toUpperCase() + ': ' + ev.detail + '\n';
      }
      text += '\n';
    }

    text += 'DISCLAIMER: This application uses real sensor data and signal processing algorithms. However, it cannot verify or confirm paranormal activity. All findings should be interpreted with scientific skepticism.\n';

    var blob = new Blob([text], { type: 'text/plain' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'evp-mini-report-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  RECORDING CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

if (btnRecord) {
  btnRecord.addEventListener('click', function() {
    if (!isProUser()) { showUpgradeModal('Recording'); return; }
    if (!stream || isRecordingActive) return;
    var started = recorder.startRecording(stream);
    if (started) {
      isRecordingActive = true;
      if (recordingIndicator) recordingIndicator.style.display = 'flex';
      if (btnRecord)     btnRecord.style.display     = 'none';
      if (btnStopRecord) btnStopRecord.style.display = 'inline-block';
    }
  });
}

if (btnStopRecord) {
  btnStopRecord.addEventListener('click', function() {
    if (!isRecordingActive) return;
    recorder.stopRecording();
    isRecordingActive = false;
    if (recordingIndicator) recordingIndicator.style.display = 'none';
    if (btnRecord)     btnRecord.style.display     = 'inline-block';
    if (btnStopRecord) btnStopRecord.style.display = 'none';

    // Enable reverse and export buttons
    if (btnReverse) btnReverse.disabled = false;
    if (btnExport)  btnExport.disabled  = false;
  });
}

if (btnReverse) {
  btnReverse.addEventListener('click', function() {
    if (!isProUser()) { showUpgradeModal('Reverse Playback'); return; }
    recorder.playReverse();
  });
}

if (btnExport) {
  btnExport.addEventListener('click', function() {
    if (!isProUser()) { showUpgradeModal('Audio Export'); return; }
    recorder.exportDownload();
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  SPIRIT BOX CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

if (sweepSpeed) {
  sweepSpeed.addEventListener('input', function() {
    var val = parseInt(sweepSpeed.value, 10);
    spiritBox.setSweepSpeed(val);
    if (sweepSpeedVal) sweepSpeedVal.textContent = val + 'ms';
  });
}

if (noiseLevel) {
  noiseLevel.addEventListener('input', function() {
    var val = parseInt(noiseLevel.value, 10);
    spiritBox.setNoiseLevel(val / 100);
  });
}

if (toneLevel) {
  toneLevel.addEventListener('input', function() {
    var val = parseInt(toneLevel.value, 10);
    spiritBox.setToneLevel(val / 100);
  });
}

// Noise toggle buttons
document.querySelectorAll('.noise-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var noiseType = btn.getAttribute('data-noise');
    if (!noiseType) return;

    document.querySelectorAll('.noise-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');

    spiritBox.setNoiseType(noiseType);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  VISUAL MODE CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

if (visualModeSelector) {
  var visBtns = visualModeSelector.querySelectorAll('[data-visual]');
  visBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = btn.getAttribute('data-visual');
      if (!mode) return;

      visBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      visualEngine.setMode(mode);
    });
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
//  CSS ANIMATION FOR EVP NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

(function injectNotificationCSS() {
  var style = document.createElement('style');
  style.textContent =
    '@keyframes fadeInOut {' +
    '  0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }' +
    '  10% { opacity: 1; transform: translateX(-50%) translateY(0); }' +
    '  80% { opacity: 1; transform: translateX(-50%) translateY(0); }' +
    '  100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }' +
    '}';
  document.head.appendChild(style);
})();


// ═══════════════════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
  // Handle Stripe return first
  await handleStripeReturn();

  // Check if pro user — skip landing page
  if (isProUser()) {
    showApp();
  }
  // else: landing page is shown by default

  // Detect iOS and show sensor permission banner if needed
  checkSensorPermBanner();

  // Start camera
  var camOk = await startCamera();

  // Init EMF sensors
  if (emfEngine && !emfEngine.isInitialized) {
    try { await emfEngine.init(); } catch (e) { /* sensors may not be available */ }
  }

  // Update sensor display with initial values
  if (emfEngine.isInitialized) {
    var initialReading = emfEngine.processFrame();
    updateSensorDisplay(initialReading);
  }

  // Set status
  if (camOk) {
    setStatus('Ready. Select mode and start investigation.', 'ready');
  } else {
    setStatus('Camera/mic access failed. Check permissions.', 'error');
  }

  // Enable start button
  if (btnStart) btnStart.disabled = false;
}

// Landing page buttons
const btnStartFree = document.getElementById('btnStartFree');
const btnUnlockPro = document.getElementById('btnUnlockPro');
const btnShowLicense = document.getElementById('btnShowLicense');
const btnVerifyLicense = document.getElementById('btnVerifyLicense');
const btnUpgradeNow = document.getElementById('btnUpgradeNow');
const btnCloseUpgrade = document.getElementById('btnCloseUpgrade');
const btnUpgradeClose = document.getElementById('btnUpgradeClose');

if (btnStartFree) {
  btnStartFree.addEventListener('click', function() {
    showApp();
  });
}

if (btnUnlockPro) {
  btnUnlockPro.addEventListener('click', startStripeCheckout);
}

if (btnShowLicense) {
  btnShowLicense.addEventListener('click', function() {
    const form = document.getElementById('licenseForm');
    if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
  });
}

if (btnVerifyLicense) {
  btnVerifyLicense.addEventListener('click', function() {
    const input = document.getElementById('licenseKeyInput');
    if (input && input.value.trim()) verifyLicenseKey(input.value);
  });
}

if (btnUpgradeNow) {
  btnUpgradeNow.addEventListener('click', function() {
    hideUpgradeModal();
    startStripeCheckout();
  });
}

if (btnCloseUpgrade) btnCloseUpgrade.addEventListener('click', hideUpgradeModal);
if (btnUpgradeClose) btnUpgradeClose.addEventListener('click', hideUpgradeModal);

// AudioContext resume on first user gesture
document.addEventListener('click', function() {
  resumeAudioContext();
}, { once: true });
document.addEventListener('touchstart', function() {
  resumeAudioContext();
}, { once: true });

// Run initialization
init();
