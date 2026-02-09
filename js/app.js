/**
 * EVP-MINI — Main Application Controller v7
 * Commercial edition with Pro gate, gear shop, investigation map,
 * share evidence, PWA install, and bottom navigation
 */

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS CONFIG — Edit these 3 values to start earning revenue
// ═══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
  // Amazon Associates affiliate tag
  // Sign up: https://affiliate-program.amazon.com → get your tag → replace below
  amazonTag: 'anime88801-20',

  // Gumroad product URL for Pro upgrade
  // 1. Create account: https://gumroad.com
  // 2. Create product "EVP-MINI Pro" at $9.99, enable license keys
  // 3. Replace URL below with your product URL
  gumroadUrl: 'https://lumina888.gumroad.com/l/pptpp',

  // Price display (update if you change pricing)
  proPrice: '$4.99',
};

// ─── DOM Elements ───────────────────────────────────────────────────────────────
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay ? overlay.getContext('2d') : null;
const videoContainer = document.getElementById('videoContainer');
const dowsingCanvas = document.getElementById('dowsingCanvas');

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnFlipCamera = document.getElementById('btnFlipCamera');
const btnRecord = document.getElementById('btnRecord');
const btnTorch = document.getElementById('btnTorch');
const btnScreenshot = document.getElementById('btnScreenshot');
const btnNewScan = document.getElementById('btnNewScan');
const btnExport = document.getElementById('btnExport');
const btnShare = document.getElementById('btnShare');
const btnPlayForward = document.getElementById('btnPlayForward');
const btnPlayReverse = document.getElementById('btnPlayReverse');
const btnStopPlayback = document.getElementById('btnStopPlayback');
const btnDownload = document.getElementById('btnDownload');
const btnGeiger = document.getElementById('btnGeiger');
const btnDowsing = document.getElementById('btnDowsing');
const btnWords = document.getElementById('btnWords');
const btnCloseHistory = document.getElementById('btnCloseHistory');
const btnCloseMap = document.getElementById('btnCloseMap');
const btnCloseGear = document.getElementById('btnCloseGear');
const btnUpgrade = document.getElementById('btnUpgrade');
const btnInstall = document.getElementById('btnInstall');
const btnDismissInstall = document.getElementById('btnDismissInstall');

const statusBar = document.getElementById('statusBar');
const timerDisplay = document.getElementById('timerDisplay');
const modeBadge = document.getElementById('modeBadge');
const nirBadge = document.getElementById('nirBadge');
const evpCountEl = document.getElementById('evpCount');
const scanLine = document.getElementById('scanLine');
const screenFlash = document.getElementById('screenFlash');
const gpsText = document.getElementById('gpsText');
const proBadge = document.getElementById('proBadge');
const upgradeBanner = document.getElementById('upgradeBanner');

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
const wordDetectPanel = document.getElementById('wordDetectPanel');
const wordDisplay = document.getElementById('wordDisplay');
const wordLog = document.getElementById('wordLog');
const geigerRate = document.getElementById('geigerRate');
const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');
const historyStorage = document.getElementById('historyStorage');
const mapPanel = document.getElementById('mapPanel');
const mapInfo = document.getElementById('mapInfo');
const gearPanel = document.getElementById('gearPanel');
const gearGrid = document.getElementById('gearGrid');
const mainContainer = document.getElementById('mainContainer');
const installBanner = document.getElementById('installBanner');

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

const currentFilter = document.getElementById('currentFilter');
const motionLevel = document.getElementById('motionLevel');
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
let geigerEnabled = false;
let dowsingActive = false;
let wordDetectEnabled = true;
let deferredInstallPrompt = null;

// Performance throttling
let lastAudioUITime = 0;
let lastSensorUITime = 0;
let lastIndicatorTime = 0;
let lastVisualTime = 0;
let lastWaveformTime = 0;
let lastWordTime = 0;
let lastGeigerUITime = 0;
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
const sessionVault = new SessionVault();
const geigerCounter = new GeigerCounter();
const dowsingRods = new DowsingRods();
const wordDetector = new WordDetector();
const investigationMap = new InvestigationMap();

// ─── Pro Gate Reference ─────────────────────────────────────────────────────────
function getProGate() { return window.proGateInstance || null; }
function isPro() { const pg = getProGate(); return pg ? pg.isPro : false; }

// ─── Gear Shop Data ─────────────────────────────────────────────────────────────
// Amazon search URLs — work immediately, affiliate tag added from CONFIG
const GEAR_ITEMS = [
  { emoji: '\u26A1', name: 'K-II EMF Meter', desc: 'Industry-standard electromagnetic field detector used by professional ghost hunters worldwide.', price: '$24.99', search: 'K-II+EMF+Meter+ghost+hunting' },
  { emoji: '\uD83D\uDCFB', name: 'Spirit Box SB7', desc: 'Adjustable FM sweep radio for real-time spirit communication. Forward & reverse sweep modes.', price: '$69.99', search: 'Spirit+Box+SB7+ghost+hunting' },
  { emoji: '\uD83C\uDFA4', name: 'Digital Voice Recorder', desc: 'High-sensitivity voice recorder optimized for EVP capture sessions in quiet environments.', price: '$39.99', search: 'digital+voice+recorder+EVP+ghost+hunting' },
  { emoji: '\uD83D\uDCF7', name: 'Full Spectrum Camera', desc: 'Modified camera capturing UV, visible, and infrared light simultaneously.', price: '$189.99', search: 'full+spectrum+camera+paranormal+ghost' },
  { emoji: '\uD83C\uDF21', name: 'FLIR Thermal Camera', desc: 'Smartphone thermal imaging attachment. Detect cold spots and temperature anomalies.', price: '$299.99', search: 'FLIR+ONE+Pro+thermal+camera+smartphone' },
  { emoji: '\uD83D\uDD26', name: 'Infrared Thermometer', desc: 'Non-contact temperature gun for rapid cold spot detection during investigations.', price: '$14.99', search: 'infrared+thermometer+non+contact+temperature+gun' },
  { emoji: '\uD83D\uDEF8', name: 'REM Pod', desc: 'Radiating electromagnetic pod that alerts when the EM field is disturbed near it.', price: '$99.99', search: 'REM+Pod+ghost+detection+EMF' },
  { emoji: '\uD83E\uDDF0', name: 'Complete Investigation Kit', desc: 'Starter ghost hunting kit with EMF meter, flashlight, thermometer, and carrying case.', price: '$59.99', search: 'ghost+hunting+equipment+kit+starter' }
];

// ─── Helpers ────────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  if (statusBar) { statusBar.textContent = msg; statusBar.className = 'status-bar' + (type ? ' ' + type : ''); }
}

function formatTimer(ms) {
  const totalSec = Math.floor(ms / 1000);
  return Math.floor(totalSec / 60) + ':' + (totalSec % 60).toString().padStart(2, '0');
}

// ─── Pro Gate UI ────────────────────────────────────────────────────────────────
function applyProRestrictions() {
  const pro = isPro();

  // Upgrade banner
  if (upgradeBanner) upgradeBanner.classList.toggle('visible', !pro);

  // Pro badge
  if (proBadge) proBadge.style.display = pro ? 'inline-block' : 'none';

  // Lock icons on restricted features
  document.querySelectorAll('.lock-icon').forEach(el => {
    el.classList.toggle('unlocked', pro);
  });

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const mode = btn.dataset.mode;
    if (mode !== 'evp') btn.classList.toggle('locked', !pro);
  });

  // Duration buttons — free users limited to 30s
  if (!pro) {
    document.querySelectorAll('.duration-btn').forEach(btn => {
      const dur = btn.dataset.duration;
      if (dur === 'continuous' || parseInt(dur) > 30) {
        btn.classList.add('locked');
        btn.style.opacity = '0.4';
      }
    });
    // Force 30s
    scanDuration = '30';
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
    const btn30 = document.querySelector('.duration-btn[data-duration="30"]');
    if (btn30) btn30.classList.add('active');
  }
}

function showUpgradePrompt(feature) {
  if (confirm('Upgrade to Pro to unlock ' + feature + '!\n\nPro includes all 4 scan modes, unlimited sessions, investigation tools, history, map, and export.\n\nPrice: ' + CONFIG.proPrice + ' (lifetime)\n\nOpen purchase page?')) {
    window.open(CONFIG.gumroadUrl, '_blank');
  }
}

// ─── Camera ─────────────────────────────────────────────────────────────────────
async function startCamera() {
  setStatus('Accessing camera and microphone...', '');
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  torchOn = false;
  if (btnTorch) btnTorch.classList.remove('torch-on');

  const evpAudio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 };
  const constraintSets = [
    { video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: evpAudio },
    { video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: evpAudio },
    { video: { facingMode }, audio: evpAudio },
    { video: true, audio: evpAudio },
    { video: { facingMode }, audio: true },
    { video: true, audio: true },
    { video: true, audio: false }
  ];

  for (const constraints of constraintSets) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; setTimeout(reject, 5000); });

      if (overlay) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
      if (spectrogramCanvas) { spectrogramCanvas.width = spectrogramCanvas.offsetWidth * (window.devicePixelRatio || 1); spectrogramCanvas.height = 120 * (window.devicePixelRatio || 1); spectroColImg = null; }
      if (waveformCanvas) { waveformCanvas.width = waveformCanvas.offsetWidth * (window.devicePixelRatio || 1); waveformCanvas.height = 60 * (window.devicePixelRatio || 1); }

      if (stream.getAudioTracks().length > 0 && !audioInitialized) {
        const success = await evpAudioEngine.initAudioContext(stream);
        if (success) {
          audioInitialized = true;
          spiritBoxEngine.init(evpAudioEngine.audioContext);
          geigerCounter.init(evpAudioEngine.audioContext);
        }
      }

      if (nirBadge) nirBadge.classList.toggle('visible', facingMode === 'user');
      setStatus('Ready — Select mode and start investigation', 'ready');
      return true;
    } catch (err) { continue; }
  }
  setStatus('Camera/mic access failed. Please allow permissions.', 'error');
  return false;
}

// ─── Torch ──────────────────────────────────────────────────────────────────────
async function toggleTorch() {
  if (!stream) return;
  const vt = stream.getVideoTracks()[0];
  if (!vt) return;
  try {
    const cap = vt.getCapabilities();
    if (!cap.torch) { setStatus('Torch not available on this device', ''); setTimeout(() => { if (!running) setStatus('Ready — Select mode and start investigation', 'ready'); }, 2000); return; }
    torchOn = !torchOn;
    await vt.applyConstraints({ advanced: [{ torch: torchOn }] });
    if (btnTorch) btnTorch.classList.toggle('torch-on', torchOn);
  } catch (e) { torchOn = false; if (btnTorch) btnTorch.classList.remove('torch-on'); }
}

// ─── Screenshot ─────────────────────────────────────────────────────────────────
function takeScreenshot() {
  if (!video || !video.videoWidth) return;
  const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
  const cx = c.getContext('2d'); cx.drawImage(video, 0, 0);
  if (overlay && !overlayCleared) cx.drawImage(overlay, 0, 0);
  const link = document.createElement('a');
  link.download = 'evp-mini-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
  link.href = c.toDataURL('image/png'); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ─── Screen Flash + Haptic ──────────────────────────────────────────────────────
function triggerScreenFlash(evpClass) {
  if (!screenFlash) return;
  screenFlash.className = 'screen-flash'; void screenFlash.offsetWidth;
  screenFlash.classList.add('flash-' + evpClass.toLowerCase());
  if (navigator.vibrate) {
    if (evpClass === 'A') navigator.vibrate([100, 50, 100, 50, 100]);
    else if (evpClass === 'B') navigator.vibrate([100, 50, 100]);
    else navigator.vibrate(100);
  }
  setTimeout(() => { screenFlash.className = 'screen-flash'; }, 900);
}

// ─── EVP Log ────────────────────────────────────────────────────────────────────
function addEVPLogEntry(classification) {
  if (!evpLogEntries) return;
  const elapsed = Date.now() - scanStartTime;
  const cls = classification.class.toLowerCase();
  const entry = document.createElement('div');
  entry.className = 'evp-log-entry class-' + cls;
  entry.innerHTML = '<span class="log-time">' + formatTimer(elapsed) + '</span><span class="log-class">Class ' + classification.class + '</span><span class="log-detail">' + classification.confidence + '% | ' + Math.round(classification.spectralCentroid) + 'Hz' + (classification.hasVoicePattern ? ' | Voice' : '') + '</span>';
  evpLogEntries.insertBefore(entry, evpLogEntries.firstChild);
  while (evpLogEntries.children.length > 50) evpLogEntries.removeChild(evpLogEntries.lastChild);
}

function updateEVPCount() {
  if (evpCountEl) { evpCountEl.textContent = 'EVP: ' + evpTotalCount; evpCountEl.classList.toggle('has-evp', evpTotalCount > 0); }
}

// ─── Anomaly Border ─────────────────────────────────────────────────────────────
let anomalyBorderTimeout = null;
function setAnomalyBorder(active) {
  if (!videoContainer) return;
  if (active) {
    videoContainer.classList.add('anomaly-border');
    if (anomalyBorderTimeout) clearTimeout(anomalyBorderTimeout);
    anomalyBorderTimeout = setTimeout(() => { videoContainer.classList.remove('anomaly-border'); }, 2000);
  }
}

// ─── Word Detection UI ──────────────────────────────────────────────────────────
function showWordDetection(detection) {
  if (!wordDisplay || !wordLog) return;
  wordDisplay.textContent = detection.word;
  wordDisplay.classList.remove('detected'); void wordDisplay.offsetWidth;
  wordDisplay.classList.add('detected');
  const elapsed = Date.now() - scanStartTime;
  const entry = document.createElement('div');
  entry.className = 'word-log-entry';
  entry.innerHTML = '<span class="wl-time">' + formatTimer(elapsed) + '</span><span class="wl-word">' + detection.word + '</span><span class="wl-conf">' + detection.confidence + '%</span>';
  wordLog.insertBefore(entry, wordLog.firstChild);
  while (wordLog.children.length > 30) wordLog.removeChild(wordLog.lastChild);
  if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
}

// ─── GPS ────────────────────────────────────────────────────────────────────────
async function updateGPS() {
  const loc = await sessionVault.acquireLocation();
  if (gpsText) {
    if (loc.available) {
      gpsText.textContent = loc.latitude.toFixed(5) + ', ' + loc.longitude.toFixed(5);
      gpsText.classList.add('located');
      const name = await sessionVault.reverseGeocode(loc.latitude, loc.longitude);
      if (name && gpsText) gpsText.textContent = name;
    } else {
      gpsText.textContent = 'Location unavailable';
    }
  }
}

// ─── History Panel ──────────────────────────────────────────────────────────────
async function showHistory() {
  if (!isPro()) { showUpgradePrompt('Investigation History'); return; }
  if (!historyPanel) return;
  historyPanel.classList.add('visible');
  const sessions = await sessionVault.getAllSessions();
  if (historyList) historyList.innerHTML = sessionVault.renderHistoryList(sessions);
  const storage = await sessionVault.getStorageEstimate();
  if (historyStorage) historyStorage.textContent = 'Sessions: ' + sessions.length + ' | Storage: ' + storage.usedMB + ' MB used';
  document.querySelectorAll('.vault-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.deleteId);
      await sessionVault.deleteSession(id);
      showHistory();
    });
  });
}

// ─── Map Panel ──────────────────────────────────────────────────────────────────
async function showMap() {
  if (!isPro()) { showUpgradePrompt('Investigation Map'); return; }
  if (!mapPanel) return;
  mapPanel.classList.add('visible');
  const mapReady = investigationMap.init('mapContainer');
  if (!mapReady && !investigationMap.ready) {
    if (mapInfo) mapInfo.textContent = 'Map unavailable — Leaflet.js failed to load';
    return;
  }
  investigationMap.refresh();
  const sessions = await sessionVault.getAllSessions();
  investigationMap.plot(sessions);
  const located = sessions.filter(s => s.location && s.location.available).length;
  if (mapInfo) mapInfo.textContent = located + ' investigation' + (located !== 1 ? 's' : '') + ' with GPS data';
}

// ─── Gear Shop Panel ────────────────────────────────────────────────────────────
function renderGearShop() {
  if (!gearGrid) return;
  let html = '';
  for (const item of GEAR_ITEMS) {
    const url = 'https://www.amazon.com/s?k=' + item.search + '&tag=' + CONFIG.amazonTag;
    html += '<div class="gear-card">';
    html += '<div class="gear-emoji">' + item.emoji + '</div>';
    html += '<div class="gear-name">' + item.name + '</div>';
    html += '<div class="gear-desc">' + item.desc + '</div>';
    html += '<div class="gear-price">' + item.price + '</div>';
    html += '<a href="' + url + '" target="_blank" rel="noopener" class="gear-buy">View on Amazon</a>';
    html += '</div>';
  }
  gearGrid.innerHTML = html;
}

function showGear() {
  if (!gearPanel) return;
  gearPanel.classList.add('visible');
  renderGearShop();
}

// ─── Share Evidence ─────────────────────────────────────────────────────────────
async function shareEvidence() {
  const summary = evidenceReport.getSummary();
  const shareData = {
    title: 'EVP-MINI Investigation Report',
    text: summary + '\n\nCaptured with EVP-MINI — Professional Paranormal Investigation',
    url: window.location.href
  };

  if (navigator.share) {
    try { await navigator.share(shareData); } catch (e) { /* user cancelled */ }
  } else {
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareData.text + '\n' + shareData.url);
      setStatus('Report copied to clipboard!', 'complete');
      setTimeout(() => setStatus('Investigation complete — Evidence saved', 'complete'), 2000);
    } catch (e) {
      setStatus('Share not available on this browser', '');
    }
  }
}

// ─── PWA Install Prompt ─────────────────────────────────────────────────────────
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const installText = document.querySelector('.install-text');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBanner && !sessionStorage.getItem('installDismissed')) {
    installBanner.classList.add('visible');
  }
});

// Show iOS instructions if not already installed
if (isIOS && !isStandalone && !sessionStorage.getItem('installDismissed')) {
  if (installBanner) {
    if (installText) installText.textContent = 'Tap Share \u2B06 then "Add to Home Screen"';
    if (btnInstall) btnInstall.textContent = 'Got it';
    installBanner.classList.add('visible');
  }
}

// ─── Bottom Navigation ──────────────────────────────────────────────────────────
function closeAllOverlays() {
  [historyPanel, mapPanel, gearPanel].forEach(p => { if (p) p.classList.remove('visible'); });
}

function setActiveNav(navName) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === navName);
  });
}

function navigateTo(navName) {
  closeAllOverlays();
  setActiveNav(navName);

  if (navName === 'investigate') {
    if (mainContainer) mainContainer.style.display = '';
  } else if (navName === 'map') {
    showMap();
  } else if (navName === 'gear') {
    showGear();
  } else if (navName === 'history') {
    showHistory();
  }
}

// ─── Scan Lifecycle ─────────────────────────────────────────────────────────────
async function startScan() {
  if (running) return;

  // Pro gate check for mode
  if (!isPro() && scanMode !== 'evp') {
    showUpgradePrompt(scanMode + ' mode');
    return;
  }

  running = true;
  frameCount = 0;
  evpTotalCount = 0;
  updateEVPCount();

  if (!sensorsInitialized) {
    try { await emfSensorEngine.init(); } catch (e) { console.warn('Sensor init failed:', e); }
    sensorsInitialized = true;
  }

  evpAudioEngine.clearAll(); visualAnomalyEngine.clearAll(); emfSensorEngine.clearAll();
  spiritBoxEngine.clearAll(); evpClassifier.clearAll(); evidenceReport.clearAll();
  wordDetector.clearAll();
  if (evpLogEntries) evpLogEntries.innerHTML = '';
  if (wordLog) wordLog.innerHTML = '';
  if (wordDisplay) wordDisplay.textContent = 'Listening...';

  visualAnomalyEngine.setMode(scanMode === 'visual' || scanMode === 'fullspectrum' ? visualMode : 'normal');
  if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') spiritBoxEngine.start();
  if (isRecording && stream) sessionRecorder.startRecording(stream);

  showPanelsForMode();
  updateGPS();

  scanStartTime = Date.now();
  if (timerDisplay) { timerDisplay.textContent = '0:00'; timerDisplay.classList.add('visible'); }

  if (scanLine && videoContainer) {
    videoContainer.style.setProperty('--scan-h', videoContainer.offsetHeight + 'px');
    scanLine.classList.add('active');
  }

  if (dowsingActive && dowsingCanvas) {
    dowsingRods.init(dowsingCanvas);
    dowsingRods.start();
  }

  // Free tier: enforce max duration
  const maxDur = isPro() ? Infinity : 30;

  scanTimerInterval = setInterval(() => {
    const elapsed = Date.now() - scanStartTime;
    if (timerDisplay) timerDisplay.textContent = formatTimer(elapsed);
    if (scanDuration !== 'continuous') {
      if (elapsed >= parseInt(scanDuration) * 1000) completeScan();
    }
    // Free tier time limit
    if (!isPro() && elapsed >= maxDur * 1000) completeScan();
  }, 250);

  if (btnStart) btnStart.disabled = true;
  if (btnStop) btnStop.classList.add('visible');
  if (resultsPanel) resultsPanel.classList.remove('visible');
  setStatus('Scanning... Analyzing environment', 'scanning');
  if (evpAlert) evpAlert.classList.remove('visible');

  lastAudioUITime = lastSensorUITime = lastIndicatorTime = lastVisualTime = lastWaveformTime = lastWordTime = lastGeigerUITime = 0;
  prevIndicatorHTML = '';
  overlayCleared = !(scanMode === 'visual' || scanMode === 'fullspectrum');
  if (overlayCleared && overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  processFrame();
}

function stopScan() { completeScan(); }

async function completeScan() {
  if (!running) return;
  running = false;

  if (scanTimerInterval) { clearInterval(scanTimerInterval); scanTimerInterval = null; }
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (scanLine) scanLine.classList.remove('active');
  dowsingRods.stop();
  spiritBoxEngine.stop();
  sessionRecorder.stopRecording();

  const audioReport = evpAudioEngine.fullAnalysis();
  const spiritBoxReport = spiritBoxEngine.fullAnalysis();
  const visualReport = visualAnomalyEngine.fullAnalysis();
  const sensorReport = emfSensorEngine.fullAnalysis();
  const evpReport = evpClassifier.fullAnalysis();
  const recordingData = sessionRecorder.getRecordingState();
  evidenceReport.analyze(audioReport, spiritBoxReport, visualReport, sensorReport, evpReport, recordingData);
  renderReport();

  const elapsed = Date.now() - scanStartTime;
  try {
    await sessionVault.saveSession({
      duration: elapsed,
      durationDisplay: formatTimer(elapsed),
      mode: scanMode,
      evpCount: evpTotalCount,
      evpDetections: evpReport.detections || [],
      wordDetections: wordDetector.getDetections(),
      sensorSummary: {
        emfAnomalies: (sensorReport.events || []).filter(e => e.type === 'emf').length,
        infrasoundEvents: (sensorReport.events || []).filter(e => e.type === 'infrasound').length
      },
      reportSummary: evidenceReport.getSummary()
    });
  } catch (e) { console.warn('Vault save failed:', e); }

  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.classList.remove('visible');
  if (timerDisplay) timerDisplay.classList.remove('visible');
  if (playbackSection && sessionRecorder.getRecordingState().hasRecording) playbackSection.classList.add('visible');
  if (videoContainer) videoContainer.classList.remove('anomaly-border');
  setStatus('Investigation complete — Evidence saved to vault', 'complete');
}

function renderReport() {
  if (reportContent) reportContent.innerHTML = evidenceReport.renderFriendlyReport();
  if (technicalDetail) technicalDetail.innerHTML = evidenceReport.renderTechnicalDetail();
  if (resultsPanel) resultsPanel.classList.add('visible');
}

// ─── Frame Processing ───────────────────────────────────────────────────────────
function processFrame() {
  if (!running) return;
  animFrameId = requestAnimationFrame(processFrame);
  frameCount++;
  const now = performance.now();

  if (audioInitialized) {
    evpAudioEngine.processAudioFrame();
    cachedAssess = evpAudioEngine.getQuickAssess();

    if (now - lastAudioUITime > 50) { drawSpectrogram(); updateAudioUI(cachedAssess); lastAudioUITime = now; }
    if (now - lastWaveformTime > 66) { drawWaveform(); lastWaveformTime = now; }

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

    if (wordDetectEnabled && now - lastWordTime > 100) {
      const formants = evpAudioEngine.getFormantAnalysis();
      const wordResult = wordDetector.processFrame(formants, cachedAssess);
      if (wordResult) showWordDetection(wordResult);
      if (cachedAssess && !cachedAssess.isAnomaly && cachedAssess.rmsPercent < 5) {
        const forced = wordDetector.forceCheck();
        if (forced) showWordDetection(forced);
      }
      lastWordTime = now;
    }

    if (geigerEnabled) {
      const emfState = emfSensorEngine.getEMFAnomaly();
      const vibState = emfSensorEngine.getVibrationAnalysis();
      geigerCounter.processFrame({
        audioAnomaly: cachedAssess ? cachedAssess.isAnomaly : false,
        voicePattern: evpAudioEngine.getFormantAnalysis()?.hasVoicePattern || false,
        emfAnomaly: emfState.isAnomaly,
        emfDeviation: emfState.deviationMicroTesla,
        motionLevel: visualAnomalyEngine.getMotionLevel(),
        infrasound: vibState.infrasoundDetected,
        fearFreq: vibState.fearFreqAlert,
        wordDetected: wordDetector.getDetections().length > 0 && (performance.now() - (wordDetector.getLastDetection()?.time || 0)) < 3000
      });

      if (now - lastGeigerUITime > 200) {
        const gs = geigerCounter.getState();
        if (geigerRate) {
          geigerRate.textContent = gs.clickRate.toFixed(1) + '/s';
          geigerRate.className = 'geiger-rate' + (gs.activityLevel > 0.6 ? ' hot' : gs.activityLevel > 0.1 ? ' active' : '');
        }
        lastGeigerUITime = now;
      }
    }
  }

  if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') spiritBoxEngine.processFrame();

  const isVisualMode = scanMode === 'visual' || scanMode === 'fullspectrum';
  if (isVisualMode) {
    if (now - lastVisualTime > 50) {
      const processed = visualAnomalyEngine.processFrame(video);
      if (processed && overlayCtx && overlay && visualMode !== 'normal') { overlayCtx.putImageData(processed, 0, 0); overlayCleared = false; }
      else if (visualMode === 'normal' && !overlayCleared) { overlayCtx.clearRect(0, 0, overlay.width, overlay.height); overlayCleared = true; }
      lastVisualTime = now;
    }
  } else {
    if (!overlayCleared && overlayCtx && overlay) { overlayCtx.clearRect(0, 0, overlay.width, overlay.height); overlayCleared = true; }
    if (frameCount % 6 === 0) visualAnomalyEngine.processFrame(video);
  }

  emfSensorEngine.processFrame();

  if (dowsingActive) {
    const sState = emfSensorEngine.getSensorState();
    dowsingRods.update({
      emfAnomaly: sState.magnetometer.anomaly,
      emfDeviation: sState.magnetometer.deviation,
      audioAnomaly: cachedAssess ? cachedAssess.isAnomaly : false,
      voicePattern: evpAudioEngine.getFormantAnalysis()?.hasVoicePattern || false,
      infrasound: sState.accelerometer.infrasoundDetected,
      motionLevel: visualAnomalyEngine.getMotionLevel(),
      gyroGamma: sState.gyroscope ? sState.gyroscope.gamma : 0,
      gyroBeta: sState.gyroscope ? sState.gyroscope.beta : 0,
      wordDetected: wordDetector.getDetections().length > 0 && (performance.now() - (wordDetector.getLastDetection()?.time || 0)) < 3000
    });
  }

  if (now - lastSensorUITime > 100) {
    updateSensorUI();
    if (scanMode === 'spiritbox' || scanMode === 'fullspectrum') updateSpiritBoxUI();
    if (isVisualMode) updateVisualUI();
    lastSensorUITime = now;
  }

  if (now - lastIndicatorTime > 200) {
    updateLiveIndicators();
    if (cachedAssess && cachedAssess.isAnomaly) setAnomalyBorder(true);
    lastIndicatorTime = now;
  }
}

// ─── Audio UI ───────────────────────────────────────────────────────────────────
function updateAudioUI(a) {
  if (!a) return;
  if (audioLevelFill) { audioLevelFill.style.width = a.rmsPercent.toFixed(1) + '%'; audioLevelFill.className = 'meter-fill' + (a.isAnomaly ? ' alert' : ''); }
  if (audioLevelValue) audioLevelValue.textContent = a.rmsPercent.toFixed(0) + '%';
  if (peakFreqValue) peakFreqValue.textContent = a.peakFreq > 0 ? Math.round(a.peakFreq) + ' Hz' : '— Hz';
  if (noiseFloorValue) noiseFloorValue.textContent = a.baselineEstablished ? a.noiseFloorDb.toFixed(1) + ' dB' : 'Calibrating...';
  if (centroidValue) centroidValue.textContent = a.centroid > 0 ? Math.round(a.centroid) + ' Hz' : '— Hz';
  if (hnrValue) hnrValue.textContent = a.hnr !== 0 ? a.hnr.toFixed(1) + ' dB' : '— dB';
  if (anomalyValue) { anomalyValue.textContent = a.isAnomaly ? 'DETECTED (' + a.anomalyStrength + ')' : 'None'; anomalyValue.style.color = a.isAnomaly ? '#ff1744' : '#00e5ff'; }
  if (formantValue) {
    if (a.formantMatch) { formantValue.textContent = 'MATCH (' + a.formantClarity + '/3)'; formantValue.style.color = '#00e676'; }
    else { formantValue.textContent = a.formantClarity > 0 ? 'Partial (' + a.formantClarity + '/3)' : '—'; formantValue.style.color = a.formantClarity > 0 ? '#ffea00' : '#00e5ff'; }
  }
}

// ─── Spectrogram ────────────────────────────────────────────────────────────────
function drawSpectrogram() {
  if (!spectrogramCtx || !spectrogramCanvas) return;
  const slice = evpAudioEngine.getSpectrogramSlice(); if (!slice) return;
  const w = spectrogramCanvas.width, h = spectrogramCanvas.height; if (!w || !h) return;
  spectrogramCtx.drawImage(spectrogramCanvas, 1, 0, w - 1, h, 0, 0, w - 1, h);
  if (!spectroColImg || spectroColImg.height !== h) spectroColImg = spectrogramCtx.createImageData(1, h);
  const d = spectroColImg.data;
  const maxBin = Math.min(slice.length, Math.ceil(8000 / evpAudioEngine.binResolution));
  for (let y = 0; y < h; y++) {
    const bin = Math.floor((1 - y / h) * maxBin), idx = y * 4;
    if (bin >= 0 && bin < slice.length) { const n = Math.max(0, Math.min(1, (slice[bin] + 100) / 90)); const rgb = spectroColor(n); d[idx] = rgb[0]; d[idx+1] = rgb[1]; d[idx+2] = rgb[2]; d[idx+3] = 255; }
    else { d[idx] = d[idx+1] = d[idx+2] = 0; d[idx+3] = 255; }
  }
  spectrogramCtx.putImageData(spectroColImg, w - 1, 0);
}

function spectroColor(t) {
  if (t < 0.15) return [0, 0, Math.round(t / 0.15 * 100)];
  if (t < 0.3) { const s = (t - 0.15) / 0.15; return [0, Math.round(s * 180), Math.round(100 + s * 120)]; }
  if (t < 0.5) { const s = (t - 0.3) / 0.2; return [0, Math.round(180 + s * 75), Math.round(220 - s * 220)]; }
  if (t < 0.7) { const s = (t - 0.5) / 0.2; return [Math.round(s * 255), 255, 0]; }
  if (t < 0.85) { const s = (t - 0.7) / 0.15; return [255, Math.round(255 - s * 200), 0]; }
  const s = (t - 0.85) / 0.15; return [255, Math.round(55 + s * 200), Math.round(s * 255)];
}

// ─── Waveform ───────────────────────────────────────────────────────────────────
function drawWaveform() {
  if (!waveformCtx || !waveformCanvas || !evpAudioEngine.timeDomainData) return;
  const w = waveformCanvas.width, h = waveformCanvas.height; if (!w || !h) return;
  const data = evpAudioEngine.timeDomainData, len = data.length;
  waveformCtx.fillStyle = '#000'; waveformCtx.fillRect(0, 0, w, h);
  waveformCtx.lineWidth = 1.5; waveformCtx.strokeStyle = '#00e5ff'; waveformCtx.beginPath();
  const sw = w / len; let x = 0;
  for (let i = 0; i < len; i++) { const y = (1 - data[i]) * h / 2; if (i === 0) waveformCtx.moveTo(x, y); else waveformCtx.lineTo(x, y); x += sw; }
  waveformCtx.stroke();
  waveformCtx.strokeStyle = 'rgba(124, 77, 255, 0.3)'; waveformCtx.lineWidth = 0.5;
  waveformCtx.beginPath(); waveformCtx.moveTo(0, h/2); waveformCtx.lineTo(w, h/2); waveformCtx.stroke();
}

// ─── Sensor UI ──────────────────────────────────────────────────────────────────
function updateSensorUI() {
  const s = emfSensorEngine.getSensorState();
  if (emfValue) {
    if (s.magnetometer.available) { emfValue.textContent = s.magnetometer.magnitude.toFixed(1) + ' uT'; emfValue.className = 'gauge-value' + (s.magnetometer.anomaly ? ' alert' : ''); if (emfBar) { emfBar.style.width = (s.magnetometer.baselineEstablished ? Math.min(100, s.magnetometer.deviation / 20 * 100) : 0) + '%'; emfBar.className = 'gauge-bar-fill' + (s.magnetometer.anomaly ? ' alert' : ''); } }
    else { emfValue.textContent = 'Unavailable'; emfValue.className = 'gauge-value unavailable'; }
  }
  if (vibrationValue) {
    if (s.accelerometer.available) { let t = s.accelerometer.vibrationLevel.toFixed(2) + ' g'; if (s.accelerometer.dominantFreq > 0) t += ' | ' + s.accelerometer.dominantFreq.toFixed(1) + ' Hz'; vibrationValue.textContent = t; vibrationValue.className = 'gauge-value' + (s.accelerometer.fearFreqAlert ? ' alert' : s.accelerometer.infrasoundDetected ? ' warning' : ''); if (vibrationBar) { vibrationBar.style.width = Math.min(100, s.accelerometer.vibrationLevel * 200) + '%'; vibrationBar.className = 'gauge-bar-fill' + (s.accelerometer.fearFreqAlert ? ' alert' : ''); } }
    else { vibrationValue.textContent = 'Unavailable'; vibrationValue.className = 'gauge-value unavailable'; }
  }
  if (gyroValue) {
    if (s.gyroscope && s.gyroscope.available) { gyroValue.textContent = 'a:' + s.gyroscope.alpha.toFixed(0) + ' b:' + s.gyroscope.beta.toFixed(0) + ' g:' + s.gyroscope.gamma.toFixed(0) + ' °/s'; gyroValue.className = 'gauge-value'; }
    else { gyroValue.textContent = 'Unavailable'; gyroValue.className = 'gauge-value unavailable'; }
  }
  if (pressureValue) {
    if (s.barometer.available) { pressureValue.textContent = s.barometer.pressure.toFixed(1) + ' hPa'; pressureValue.className = 'gauge-value' + (s.barometer.anomaly ? ' alert' : ''); }
    else { pressureValue.textContent = 'Unavailable'; pressureValue.className = 'gauge-value unavailable'; }
  }
}

function updateSpiritBoxUI() {
  const s = spiritBoxEngine.getCurrentState();
  if (sweepFreq) sweepFreq.textContent = s.currentFreqDisplay;
  if (fragmentCount) fragmentCount.textContent = s.fragmentCount;
  if (sweepModeEl) sweepModeEl.textContent = s.mode === 'sweep' ? 'Sweep' : s.mode === 'white-noise' ? 'White' : 'Pink';
}

function updateVisualUI() {
  if (currentFilter) currentFilter.textContent = visualMode.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (motionLevel) motionLevel.textContent = visualAnomalyEngine.getMotionLevel().toFixed(1) + '%';
}

// ─── EVP Alert ──────────────────────────────────────────────────────────────────
let evpAlertTimeout = null;
function showEVPAlert(c) {
  if (!evpAlert) return;
  evpAlert.classList.add('visible');
  if (evpAlertClass) { evpAlertClass.textContent = 'EVP Class ' + c.class + ' Detected'; evpAlertClass.className = 'alert-class class-' + c.class.toLowerCase(); }
  if (evpAlertDetail) evpAlertDetail.textContent = 'Confidence: ' + c.confidence + '% | Duration: ' + c.duration + 's | Centroid: ' + c.spectralCentroid + 'Hz | HNR: ' + c.hnr + 'dB' + (c.hasVoicePattern ? ' | Voice pattern detected' : '');
  if (evpAlertTimeout) clearTimeout(evpAlertTimeout);
  evpAlertTimeout = setTimeout(() => { if (evpAlert) evpAlert.classList.remove('visible'); }, 5000);
}

// ─── Live Indicators ────────────────────────────────────────────────────────────
function updateLiveIndicators() {
  if (!liveIndicators) return;
  const chips = [];
  if (evpAudioEngine.isAnomaly) chips.push('<span class="indicator-chip anomaly">AUDIO ANOMALY</span>');
  const fm = evpAudioEngine.getFormantAnalysis();
  if (fm && fm.hasVoicePattern) chips.push('<span class="indicator-chip voice">VOICE PATTERN</span>');
  const emf = emfSensorEngine.getEMFAnomaly();
  if (emf.isAnomaly) chips.push('<span class="indicator-chip emf">EMF SPIKE +' + emf.deviationMicroTesla.toFixed(1) + 'uT</span>');
  if (visualAnomalyEngine.getMotionLevel() > 10) chips.push('<span class="indicator-chip motion">MOTION ' + visualAnomalyEngine.getMotionLevel().toFixed(0) + '%</span>');
  const vib = emfSensorEngine.getVibrationAnalysis();
  if (vib.fearFreqAlert) chips.push('<span class="indicator-chip infrasound">FEAR FREQ 18.98Hz</span>');
  else if (vib.infrasoundDetected) chips.push('<span class="indicator-chip infrasound">INFRASOUND ' + vib.dominantFreqHz.toFixed(1) + 'Hz</span>');
  const lastWord = wordDetector.getLastDetection();
  if (lastWord && performance.now() - lastWord.time < 5000) chips.push('<span class="indicator-chip voice">WORD: ' + lastWord.word + '</span>');
  const html = chips.join('');
  if (html !== prevIndicatorHTML) { liveIndicators.innerHTML = html; prevIndicatorHTML = html; }
}

// ─── Panel Visibility ───────────────────────────────────────────────────────────
function showPanelsForMode() {
  if (audioPanel) audioPanel.classList.add('visible');
  if (spectrogramSection) spectrogramSection.classList.add('visible');
  if (waveformSection) waveformSection.classList.add('visible');
  if (sensorPanel) sensorPanel.classList.add('visible');
  if (evpLog) evpLog.classList.add('visible');
  if (wordDetectPanel && wordDetectEnabled && isPro()) wordDetectPanel.classList.add('visible');
  if (spiritBoxPanel) spiritBoxPanel.classList.toggle('visible', scanMode === 'spiritbox' || scanMode === 'fullspectrum');
  if (visualInfoPanel) visualInfoPanel.classList.toggle('visible', scanMode === 'visual' || scanMode === 'fullspectrum');
  if (visualModeSelector) visualModeSelector.style.display = (scanMode === 'visual' || scanMode === 'fullspectrum') ? 'flex' : 'none';
}

function hidePanels() {
  [audioPanel, spectrogramSection, waveformSection, sensorPanel, spiritBoxPanel, visualInfoPanel, evpAlert, evpLog, wordDetectPanel].forEach(p => { if (p) p.classList.remove('visible'); });
}

// ─── Event Listeners ────────────────────────────────────────────────────────────
if (btnStart) btnStart.addEventListener('click', startScan);
if (btnStop) btnStop.addEventListener('click', stopScan);
if (btnTorch) btnTorch.addEventListener('click', toggleTorch);
if (btnScreenshot) btnScreenshot.addEventListener('click', takeScreenshot);
if (btnShare) btnShare.addEventListener('click', shareEvidence);

// Overlay close buttons
if (btnCloseHistory) btnCloseHistory.addEventListener('click', () => { closeAllOverlays(); setActiveNav('investigate'); });
if (btnCloseMap) btnCloseMap.addEventListener('click', () => { closeAllOverlays(); setActiveNav('investigate'); });
if (btnCloseGear) btnCloseGear.addEventListener('click', () => { closeAllOverlays(); setActiveNav('investigate'); });

// Upgrade button
if (btnUpgrade) btnUpgrade.addEventListener('click', () => showUpgradePrompt('all features'));

// Install banner
if (btnInstall) btnInstall.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  } else if (isIOS) {
    alert('To add EVP-MINI to your home screen:\n\n1. Tap the Share button (\u2B06) at the bottom of Safari\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"\n\nThe app icon will appear on your home screen!');
  }
  if (installBanner) installBanner.classList.remove('visible');
});
if (btnDismissInstall) btnDismissInstall.addEventListener('click', () => {
  if (installBanner) installBanner.classList.remove('visible');
  sessionStorage.setItem('installDismissed', '1');
});

// Bottom navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
});

if (btnNewScan) btnNewScan.addEventListener('click', () => {
  if (resultsPanel) resultsPanel.classList.remove('visible');
  if (playbackSection) playbackSection.classList.remove('visible');
  hidePanels(); sessionRecorder.clearAll(); evpTotalCount = 0; updateEVPCount();
  setStatus('Ready — Select mode and start investigation', 'ready');
});

if (btnFlipCamera) btnFlipCamera.addEventListener('click', async () => { facingMode = facingMode === 'environment' ? 'user' : 'environment'; await startCamera(); });

if (btnRecord) btnRecord.addEventListener('click', () => { isRecording = !isRecording; btnRecord.classList.toggle('rec-on', isRecording); btnRecord.textContent = isRecording ? 'REC ON' : 'REC'; });

// Tool toggles — check pro for tools
if (btnGeiger) btnGeiger.addEventListener('click', () => {
  if (!isPro()) { showUpgradePrompt('Geiger Counter'); return; }
  geigerEnabled = !geigerEnabled;
  geigerCounter.setEnabled(geigerEnabled);
  btnGeiger.classList.toggle('active', geigerEnabled);
  if (geigerRate) geigerRate.textContent = geigerEnabled ? '0.5/s' : 'OFF';
});

if (btnDowsing) btnDowsing.addEventListener('click', () => {
  if (!isPro()) { showUpgradePrompt('Dowsing Rods'); return; }
  dowsingActive = !dowsingActive;
  btnDowsing.classList.toggle('active', dowsingActive);
  if (dowsingActive && running && dowsingCanvas) { dowsingRods.init(dowsingCanvas); dowsingRods.start(); }
  else { dowsingRods.stop(); }
});

if (btnWords) btnWords.addEventListener('click', () => {
  if (!isPro()) { showUpgradePrompt('Word Detection'); return; }
  wordDetectEnabled = !wordDetectEnabled;
  btnWords.classList.toggle('active', wordDetectEnabled);
  if (wordDetectPanel) wordDetectPanel.classList.toggle('visible', wordDetectEnabled && running);
});

// Mode selector with pro gate
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (!isPro() && mode !== 'evp') { showUpgradePrompt(mode + ' mode'); return; }
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); scanMode = mode;
    if (modeBadge) { const labels = { evp: 'EVP SCAN', spiritbox: 'SPIRIT BOX', visual: 'VISUAL', fullspectrum: 'FULL SPECTRUM' }; modeBadge.textContent = labels[scanMode] || scanMode.toUpperCase(); }
    if (visualModeSelector) visualModeSelector.style.display = (scanMode === 'visual' || scanMode === 'fullspectrum') ? 'flex' : 'none';
  });
});

document.querySelectorAll('.duration-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const dur = btn.dataset.duration;
    if (!isPro() && (dur === 'continuous' || parseInt(dur) > 30)) { showUpgradePrompt('unlimited session duration'); return; }
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); scanDuration = dur;
  });
});

document.querySelectorAll('.visual-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.visual-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); visualMode = btn.dataset.visual; visualAnomalyEngine.setMode(visualMode);
    if (visualMode === 'normal') { if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height); overlayCleared = true; } else { overlayCleared = false; }
  });
});

document.querySelectorAll('.spirit-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => { document.querySelectorAll('.spirit-mode-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); spiritBoxEngine.setMode(btn.dataset.spiritmode); });
});

if (sweepSpeed) sweepSpeed.addEventListener('input', () => { const s = parseInt(sweepSpeed.value); spiritBoxEngine.setSweepSpeed(s); if (sweepSpeedVal) sweepSpeedVal.textContent = s + 'ms'; });

if (detailToggle) detailToggle.addEventListener('click', () => { if (technicalDetail) { technicalDetail.classList.toggle('visible'); detailToggle.textContent = technicalDetail.classList.contains('visible') ? 'Hide Technical Detail' : 'Show Technical Detail'; } });

if (btnPlayForward) btnPlayForward.addEventListener('click', () => sessionRecorder.playForward());
if (btnPlayReverse) btnPlayReverse.addEventListener('click', () => sessionRecorder.playReverse());
if (btnStopPlayback) btnStopPlayback.addEventListener('click', () => sessionRecorder.stopPlayback());
if (btnDownload) btnDownload.addEventListener('click', () => sessionRecorder.downloadRecording());

if (btnExport) btnExport.addEventListener('click', () => {
  if (!isPro()) { showUpgradePrompt('Evidence Export'); return; }
  const summary = evidenceReport.getSummary();
  const timeline = evidenceReport.getTimelineEvents();
  let text = 'EVP-MINI INVESTIGATION REPORT\n================================\n\n';
  text += 'Generated: ' + new Date().toISOString() + '\nSummary: ' + summary + '\n\n';
  const words = wordDetector.getDetections();
  if (words.length > 0) { text += 'WORD DETECTIONS:\n'; words.forEach(w => { text += '  ' + w.word + ' (' + w.confidence + '% confidence)\n'; }); text += '\n'; }
  text += 'TIMELINE:\n';
  for (const e of timeline) text += '[' + formatTimer(e.time * 1000) + '] ' + e.type.toUpperCase() + ': ' + e.detail + '\n';
  text += '\nDISCLAIMER: This app uses real sensor data but cannot verify paranormal phenomena.\n';
  const blob = new Blob([text], { type: 'text/plain' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'evp-mini-report-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  sessionRecorder.downloadRecording();
});

// AudioContext resume
document.addEventListener('click', () => { if (evpAudioEngine.audioContext && evpAudioEngine.audioContext.state === 'suspended') evpAudioEngine.audioContext.resume(); }, { once: true });
document.addEventListener('touchstart', () => { if (evpAudioEngine.audioContext && evpAudioEngine.audioContext.state === 'suspended') evpAudioEngine.audioContext.resume(); }, { once: true });

// ─── Initialize ─────────────────────────────────────────────────────────────────
async function init() {
  setStatus('Initializing EVP-MINI...', '');
  await sessionVault.init();
  applyProRestrictions();
  const success = await startCamera();
  if (!success) setStatus('Failed to access camera/microphone. Check permissions.', 'error');
  updateGPS();

  // Pre-render gear shop
  renderGearShop();
}

if (document.getElementById('appWrapper')?.classList.contains('authenticated')) {
  init();
} else {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.target.classList?.contains('authenticated')) { observer.disconnect(); init(); break; }
    }
  });
  const wrapper = document.getElementById('appWrapper');
  if (wrapper) observer.observe(wrapper, { attributes: true, attributeFilter: ['class'] });
}
