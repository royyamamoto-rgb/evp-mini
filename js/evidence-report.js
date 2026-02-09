/**
 * EvidenceReport — Aggregates all engine results into a structured investigation report.
 * Collects data from EVPAudioEngine, VisualAnomalyEngine, EMFSensorEngine,
 * SpiritBoxEngine, EVPClassifier, and SessionRecorder to produce a coherent,
 * scientifically-contextualized evidence report.
 */
class EvidenceReport {
  constructor() {
    this.report = null;

    // Engine references (set via setEngines or passed to analyze)
    this.audioEngine = null;
    this.visualEngine = null;
    this.emfEngine = null;
    this.spiritBoxEngine = null;
    this.classifier = null;
    this.recorder = null;

    // Scientific references (immutable)
    this._references = [
      {
        author: 'Tandy, V.',
        year: 1998,
        title: 'The Ghost in the Machine',
        journal: 'Journal of the Society for Psychical Research',
        finding: '18.98Hz infrasound linked to feelings of unease and visual disturbances'
      },
      {
        author: 'Nees, M.A. & Phillips, C.',
        year: 2015,
        title: 'Auditory pareidolia',
        journal: 'Perception',
        finding: 'Humans tend to perceive speech in random noise, especially when primed to expect it'
      },
      {
        author: 'Baruss, I.',
        year: 2001,
        title: 'Failure to replicate EVP',
        journal: 'Journal of Scientific Exploration',
        finding: 'Controlled studies failed to replicate EVP under blinded conditions'
      },
      {
        author: 'Raudive, K.',
        year: 1971,
        title: 'Breakthrough: An Amazing Experiment in Electronic Communication with the Dead',
        journal: null,
        finding: 'Pioneering EVP research, though methodology has been widely criticized'
      },
      {
        author: 'Persinger, M.A.',
        year: 1987,
        title: 'Neuropsychological Bases of God Beliefs',
        journal: 'Praeger Publishers',
        finding: 'Weak magnetic fields applied to temporal lobes can induce feelings of presence'
      }
    ];

    this._disclaimer = 'This application uses real sensor data and signal processing algorithms. ' +
      'However, it cannot verify or confirm paranormal activity. All findings should be interpreted ' +
      'with scientific skepticism. Anomalies may have mundane explanations including environmental ' +
      'noise, electromagnetic interference, device movement, or sensor limitations.';
  }

  /**
   * Store references to the various engines for later analysis.
   * @param {Object} engines - {audioEngine, visualEngine, emfEngine, spiritBoxEngine, classifier, recorder}
   */
  setEngines(engines) {
    if (engines.audioEngine) this.audioEngine = engines.audioEngine;
    if (engines.visualEngine) this.visualEngine = engines.visualEngine;
    if (engines.emfEngine) this.emfEngine = engines.emfEngine;
    if (engines.spiritBoxEngine) this.spiritBoxEngine = engines.spiritBoxEngine;
    if (engines.classifier) this.classifier = engines.classifier;
    if (engines.recorder) this.recorder = engines.recorder;
  }

  /**
   * Analyze all engine data and produce a unified report.
   * Accepts either pre-computed reports (backward-compatible) or pulls from stored engines.
   *
   * Backward-compatible signature:
   *   analyze(audioReport, spiritBoxReport, visualReport, sensorReport, evpClassifications, recordingData)
   *
   * @returns {Object} full report
   */
  analyze(audioReport, spiritBoxReport, visualReport, sensorReport, evpClassifications, recordingData) {
    // If called with no arguments, pull from engines
    var audioAnalysis = audioReport || (this.audioEngine ? this.audioEngine.fullAnalysis() : null);
    var visualAnalysis = visualReport || (this.visualEngine ? this.visualEngine.fullAnalysis() : null);
    var sensorAnalysis = sensorReport || (this.emfEngine ? this.emfEngine.fullAnalysis() : null);
    var spiritBoxAnalysis = spiritBoxReport || (this.spiritBoxEngine ? this.spiritBoxEngine.fullAnalysis() : null);
    var classifierAnalysis = evpClassifications || (this.classifier ? this.classifier.fullAnalysis() : null);
    var recorderData = recordingData || (this.recorder ? this.recorder.getRecordingState() : null);

    var evpSummary = classifierAnalysis && classifierAnalysis.summary
      ? classifierAnalysis.summary
      : (classifierAnalysis && classifierAnalysis.stats
        ? classifierAnalysis.stats
        : { total: 0, classA: 0, classB: 0, classC: 0 });

    // Compute duration
    var totalFrames = audioAnalysis ? (audioAnalysis.totalFrames || 0) : 0;
    var durationSeconds = audioAnalysis ? (audioAnalysis.duration || totalFrames / 30) : 0;
    var durationMinutes = Math.floor(durationSeconds / 60);
    var durationRemainder = Math.floor(durationSeconds % 60);
    var durationStr = durationMinutes + 'm ' + durationRemainder + 's';

    // Compute overall score
    var overallScore = this._computeOverallScore(
      audioAnalysis, visualAnalysis, sensorAnalysis, spiritBoxAnalysis, classifierAnalysis
    );

    // Get verdict
    var verdict = this._getVerdict(overallScore);

    // Count total anomalies
    var totalAnomalies = (audioAnalysis ? (audioAnalysis.totalAnomalies || audioAnalysis.anomalyCount || 0) : 0) +
      (visualAnalysis ? (visualAnalysis.totalAnomalies || 0) : 0) +
      (sensorAnalysis ? (sensorAnalysis.totalEvents || 0) : 0);

    // Determine activity level (backward-compatible)
    var activityLevel = 'Quiet';
    if (totalAnomalies > 20 || evpSummary.classA > 0) activityLevel = 'High Activity';
    else if (totalAnomalies > 10 || evpSummary.classB > 0) activityLevel = 'Moderate Activity';
    else if (totalAnomalies > 3 || evpSummary.classC > 0) activityLevel = 'Low Activity';

    // Count sensor-specific events
    var infrasoundEvents = 0;
    var fearFreqDetections = 0;
    var emfAnomalyCount = 0;
    if (sensorAnalysis && sensorAnalysis.events) {
      for (var i = 0; i < sensorAnalysis.events.length; i++) {
        var evt = sensorAnalysis.events[i];
        if (evt.type === 'infrasound') {
          infrasoundEvents++;
          if (evt.note && evt.note.indexOf('Tandy') !== -1) {
            fearFreqDetections++;
          }
        } else if (evt.type === 'emf') {
          emfAnomalyCount++;
        }
      }
    }

    // Build structured report
    this.report = {
      timestamp: new Date().toISOString(),
      duration: durationStr,
      durationSeconds: durationSeconds,
      activityLevel: activityLevel,
      totalAnomalies: totalAnomalies,
      evpSummary: evpSummary,

      summary: {
        date: new Date().toISOString(),
        duration: durationSeconds,
        overallScore: overallScore,
        verdict: verdict,
        narrative: '' // populated below
      },

      audioEvidence: {
        anomalyCount: audioAnalysis ? (audioAnalysis.totalAnomalies || audioAnalysis.anomalyCount || 0) : 0,
        evpClassifications: classifierAnalysis ? (classifierAnalysis.classifications || []) : [],
        bestEvidence: classifierAnalysis ? (classifierAnalysis.strongestEvidence || null) : null,
        averageNoiseFloor: audioAnalysis ? (audioAnalysis.baselineNoiseFloor || audioAnalysis.baselineRMSDb || -100) : -100,
        voiceRangeActivity: audioAnalysis ? (audioAnalysis.voiceRangeActivity || 0) : 0
      },

      visualFindings: {
        anomalyCount: visualAnalysis ? (visualAnalysis.totalAnomalies || 0) : 0,
        averageMotionLevel: visualAnalysis ? (visualAnalysis.averageMotionLevel || 0) : 0,
        peakMotionLevel: visualAnalysis ? (visualAnalysis.peakMotionLevel || 0) : 0,
        anomalyTimestamps: visualAnalysis && visualAnalysis.anomalies
          ? visualAnalysis.anomalies.map(function(a) { return a.timeSeconds; })
          : []
      },

      sensorData: {
        emf: sensorAnalysis && sensorAnalysis.magnetometer
          ? sensorAnalysis.magnetometer
          : { available: false },
        vibration: sensorAnalysis && sensorAnalysis.accelerometer
          ? sensorAnalysis.accelerometer
          : { available: false },
        pressure: sensorAnalysis && sensorAnalysis.barometer
          ? sensorAnalysis.barometer
          : { available: false },
        infrasoundEvents: infrasoundEvents,
        fearFreqDetections: fearFreqDetections,
        emfAnomalyCount: emfAnomalyCount
      },

      spiritBox: {
        active: spiritBoxAnalysis ? (spiritBoxAnalysis.totalSweeps > 0) : false,
        fragmentsCaptured: spiritBoxAnalysis ? (spiritBoxAnalysis.fragments || []).length : 0,
        fragments: spiritBoxAnalysis ? (spiritBoxAnalysis.fragments || []) : [],
        sweepTime: spiritBoxAnalysis ? (spiritBoxAnalysis.totalFrames || 0) / 30 : 0,
        mode: spiritBoxAnalysis ? (spiritBoxAnalysis.mode || 'sweep') : 'sweep',
        sweepSpeed: spiritBoxAnalysis ? (spiritBoxAnalysis.sweepSpeed || 150) : 150,
        totalSweeps: spiritBoxAnalysis ? (spiritBoxAnalysis.totalSweeps || 0) : 0
      },

      scientificContext: {
        references: this._references.slice(),
        methodology: this._buildMethodology(audioAnalysis, sensorAnalysis),
        limitations: [
          'Smartphone sensors have limited precision compared to dedicated scientific instruments. ' +
          'Magnetometer readings may be affected by the phone\'s own electronics.',
          'Audio analysis via Web Audio API has frequency resolution limited by FFT size (' +
          (audioAnalysis ? (audioAnalysis.fftSize || 8192) : 8192) + ' bins, ' +
          (audioAnalysis ? (audioAnalysis.binResolution || 5.9).toFixed(1) : '5.9') + 'Hz/bin). ' +
          'Sub-bin accuracy relies on parabolic interpolation.',
          'Visual anomaly detection uses simple frame differencing which cannot distinguish ' +
          'between paranormal phenomena and mundane causes such as insects, dust, or lighting changes.',
          'Infrasound detection via accelerometer is approximate; dedicated infrasound microphones ' +
          'provide far greater sensitivity and frequency resolution.',
          'All EVP classifications are algorithmic and do not represent human perceptual judgments. ' +
          'Auditory pareidolia may cause listeners to perceive meaning in classified segments.'
        ]
      },

      disclaimer: this._disclaimer,

      // Backward-compatible fields
      audio: audioAnalysis,
      spiritBoxRaw: spiritBoxAnalysis,
      visual: visualAnalysis,
      sensors: sensorAnalysis,
      evpClassifications: classifierAnalysis,
      recording: recorderData
    };

    // Generate narrative
    this.report.summary.narrative = this._generateNarrative(this.report);

    return this.report;
  }

  /**
   * Generate the full structured report object.
   * If analyze() has already been called, returns cached report.
   * Otherwise, calls analyze() with engine data.
   * @returns {Object} full report
   */
  generateReport() {
    if (!this.report) {
      this.analyze();
    }
    return this.report;
  }

  /**
   * Compute overall investigation score (0-100) based on weighted findings.
   * @returns {number}
   */
  _computeOverallScore(audioAnalysis, visualAnalysis, sensorAnalysis, spiritBoxAnalysis, classifierAnalysis) {
    var score = 0;

    // EVP scores
    if (classifierAnalysis) {
      var stats = classifierAnalysis.stats || classifierAnalysis.summary || { classA: 0, classB: 0, classC: 0 };

      // Class A: 30 points each, max 60
      score += Math.min(60, (stats.classA || 0) * 30);

      // Class B: 15 points each, max 30
      score += Math.min(30, (stats.classB || 0) * 15);

      // Class C: 5 points each, max 15
      score += Math.min(15, (stats.classC || 0) * 5);
    }

    // EMF anomalies: 10 points each, max 20
    if (sensorAnalysis && sensorAnalysis.events) {
      var emfCount = 0;
      var infraCount = 0;
      for (var i = 0; i < sensorAnalysis.events.length; i++) {
        if (sensorAnalysis.events[i].type === 'emf') emfCount++;
        if (sensorAnalysis.events[i].type === 'infrasound') infraCount++;
      }
      score += Math.min(20, emfCount * 10);

      // Infrasound/fear frequency: 15 points each, max 30
      score += Math.min(30, infraCount * 15);
    }

    // Visual anomalies: 5 points each, max 15
    if (visualAnalysis) {
      score += Math.min(15, (visualAnalysis.totalAnomalies || 0) * 5);
    }

    // Spirit box fragments: 3 points each, max 15
    if (spiritBoxAnalysis && spiritBoxAnalysis.fragments) {
      score += Math.min(15, spiritBoxAnalysis.fragments.length * 3);
    }

    // Simultaneous multi-sensor anomaly bonus
    // Check if we have anomalies from 3+ different sensor types
    var sensorTypes = 0;
    if (classifierAnalysis && (classifierAnalysis.stats || classifierAnalysis.summary)) {
      var s = classifierAnalysis.stats || classifierAnalysis.summary;
      if ((s.classA || 0) + (s.classB || 0) + (s.classC || 0) > 0) sensorTypes++;
    }
    if (visualAnalysis && (visualAnalysis.totalAnomalies || 0) > 0) sensorTypes++;
    if (sensorAnalysis && sensorAnalysis.events && sensorAnalysis.events.length > 0) sensorTypes++;
    if (spiritBoxAnalysis && spiritBoxAnalysis.fragments && spiritBoxAnalysis.fragments.length > 0) sensorTypes++;

    if (sensorTypes >= 3) {
      score += 20;
    }

    // Cap at 100
    return Math.min(100, Math.round(score));
  }

  /**
   * Generate a human-readable narrative summarizing the investigation.
   * @param {Object} report - the full report object
   * @returns {string}
   */
  _generateNarrative(report) {
    var duration = report.durationSeconds || 0;
    var minutes = Math.floor(duration / 60);
    var seconds = Math.floor(duration % 60);
    var timeStr = minutes > 0 ? minutes + '-minute' : seconds + '-second';

    var parts = [];
    parts.push('During this ' + timeStr + ' investigation');

    // Audio findings
    var audioCount = report.audioEvidence ? report.audioEvidence.anomalyCount : 0;
    var evpClassifications = report.audioEvidence ? report.audioEvidence.evpClassifications : [];
    var evpStats = report.evpSummary || { classA: 0, classB: 0, classC: 0, total: 0 };

    if (evpStats.total > 0) {
      var evpParts = [];
      if (evpStats.classA > 0) evpParts.push(evpStats.classA + ' Class A');
      if (evpStats.classB > 0) evpParts.push(evpStats.classB + ' Class B');
      if (evpStats.classC > 0) evpParts.push(evpStats.classC + ' Class C');
      parts.push(', ' + evpStats.total + ' EVP candidate' + (evpStats.total !== 1 ? 's were' : ' was') +
        ' classified (' + evpParts.join(', ') + ')');

      // Mention strongest evidence timestamp
      var best = report.audioEvidence ? report.audioEvidence.bestEvidence : null;
      if (best) {
        parts.push('. The strongest evidence was a Class ' + best.class + ' detection at ' +
          this._formatTime(best.timestamp) + ' with ' + best.confidence + '% confidence');
      }
    } else {
      parts.push(', no EVP candidates met classification thresholds');
    }

    // Visual findings
    var visualCount = report.visualFindings ? report.visualFindings.anomalyCount : 0;
    if (visualCount > 0) {
      parts.push('. ' + visualCount + ' visual anomal' + (visualCount !== 1 ? 'ies were' : 'y was') +
        ' detected via motion analysis');
      if (report.visualFindings.peakMotionLevel > 0) {
        parts.push(' (peak motion: ' + report.visualFindings.peakMotionLevel.toFixed(1) + '%)');
      }
    }

    // Sensor findings
    var sensorData = report.sensorData || {};
    if (sensorData.emfAnomalyCount > 0) {
      parts.push('. ' + sensorData.emfAnomalyCount + ' EMF spike' +
        (sensorData.emfAnomalyCount !== 1 ? 's were' : ' was') + ' recorded');
    }
    if (sensorData.infrasoundEvents > 0) {
      parts.push('. ' + sensorData.infrasoundEvents + ' infrasound event' +
        (sensorData.infrasoundEvents !== 1 ? 's were' : ' was') + ' detected');
      if (sensorData.fearFreqDetections > 0) {
        parts.push(', including ' + sensorData.fearFreqDetections +
          ' near the Tandy fear frequency (18.98Hz)');
      }
    }

    // Spirit box
    if (report.spiritBox && report.spiritBox.active) {
      if (report.spiritBox.fragmentsCaptured > 0) {
        parts.push('. The spirit box captured ' + report.spiritBox.fragmentsCaptured + ' audio fragment' +
          (report.spiritBox.fragmentsCaptured !== 1 ? 's' : ''));
      } else {
        parts.push('. Spirit box was active but captured no fragments');
      }
    }

    // Scientific caveat
    parts.push('. All findings should be evaluated with scientific skepticism, as ' +
      'auditory pareidolia, environmental interference, and sensor limitations are ' +
      'well-documented confounds in this type of investigation.');

    return parts.join('');
  }

  /**
   * Return the verdict string based on score thresholds.
   * @param {number} score - 0-100
   * @returns {string}
   */
  _getVerdict(score) {
    if (score <= 15) return 'No significant findings';
    if (score <= 35) return 'Inconclusive \u2014 minor anomalies detected';
    if (score <= 65) return 'Notable anomalies detected \u2014 further investigation recommended';
    return 'Significant paranormal indicators recorded';
  }

  /**
   * Build a methodology description string.
   * @param {Object} audioAnalysis
   * @param {Object} sensorAnalysis
   * @returns {string}
   */
  _buildMethodology(audioAnalysis, sensorAnalysis) {
    var methods = ['This investigation used:'];

    if (audioAnalysis) {
      methods.push('Real-time FFT audio analysis (FFT size ' +
        (audioAnalysis.fftSize || 8192) + ', ' +
        (audioAnalysis.sampleRate || 48000) + 'Hz sample rate, ' +
        (audioAnalysis.binResolution || 5.9).toFixed(1) + 'Hz/bin resolution) ' +
        'with adaptive noise floor calibration for anomaly detection.');
    }

    methods.push('Spectral centroid, harmonic-to-noise ratio (HNR via autocorrelation), ' +
      'and formant detection (parabolic interpolation) for EVP classification.');

    if (sensorAnalysis) {
      if (sensorAnalysis.magnetometer && sensorAnalysis.magnetometer.available) {
        methods.push('Magnetometer-based EMF monitoring via ' +
          (sensorAnalysis.magnetometer.source || 'device sensors') + '.');
      }
      if (sensorAnalysis.accelerometer && sensorAnalysis.accelerometer.available) {
        methods.push('Accelerometer-based vibration and infrasound detection ' +
          'with DFT analysis in the 1-30Hz range.');
      }
    }

    methods.push('Frame-differencing visual anomaly detection with multiple filter modes.');

    return methods.join(' ');
  }

  /**
   * Render a user-friendly HTML report.
   * @returns {string} HTML string
   */
  renderFriendlyReport() {
    if (!this.report) return '<p>No data available.</p>';

    var r = this.report;
    var html = '';

    // Investigation Summary
    html += '<div class="report-section">';
    html += '<div class="report-section-title"><span class="rs-icon">&#x1F50D;</span> Investigation Summary</div>';
    html += '<div class="report-item info">';
    html += '<div class="report-item-title">Duration: ' + r.duration + ' | Activity: ' + r.activityLevel + '</div>';
    html += '<div class="report-item-text">Total anomalies detected: ' + r.totalAnomalies +
      ' | EVP candidates: ' + r.evpSummary.total + '</div>';
    if (r.summary) {
      html += '<div class="report-item-text" style="margin-top:6px;">Score: ' +
        r.summary.overallScore + '/100 | Verdict: ' + r.summary.verdict + '</div>';
    }
    html += '</div>';
    html += '</div>';

    // Narrative
    if (r.summary && r.summary.narrative) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F4DD;</span> Summary Narrative</div>';
      html += '<div class="report-item info"><div class="report-item-text" style="font-style:italic;">' +
        this._escapeHtml(r.summary.narrative) + '</div></div>';
      html += '</div>';
    }

    // EVP Detections
    var classificationsList = r.evpClassifications && r.evpClassifications.classifications
      ? r.evpClassifications.classifications
      : (r.audioEvidence ? r.audioEvidence.evpClassifications : []);

    if (classificationsList && classificationsList.length > 0) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F3A4;</span> EVP Detections</div>';

      for (var ei = 0; ei < classificationsList.length; ei++) {
        var evp = classificationsList[ei];
        var timeStr = this._formatTime(evp.timestamp);
        html += '<div class="evp-detection-item">';
        html += '<span class="evp-time">' + timeStr + '</span>';
        html += '<span class="evp-class-badge class-' + evp.class.toLowerCase() + '">Class ' + evp.class + '</span>';
        html += '<div class="evp-details">';
        html += 'Duration: ' + evp.duration + 's | Confidence: ' + evp.confidence + '% | ';
        html += 'Centroid: ' + evp.spectralCentroid + 'Hz | HNR: ' + evp.hnr + 'dB | SNR: ' + evp.snr + 'dB';
        html += '</div>';
        html += '<div class="evp-formants">';
        html += 'Formants: F1=' + evp.formants.f1 + 'Hz F2=' + evp.formants.f2 + 'Hz F3=' + evp.formants.f3 + 'Hz';
        if (evp.hasVoicePattern) html += ' | Voice pattern detected';
        html += '</div>';
        if (evp.note) {
          html += '<div class="report-item-text" style="color:#9e9ec0;margin-top:4px;font-size:0.75rem;">' +
            this._escapeHtml(evp.note) + '</div>';
        }
        if (evp.pareidoliaWarning) {
          html += '<div class="report-item-text" style="color:#ff9100;margin-top:4px;">' +
            'Note: Low confidence \u2014 may be auditory pareidolia (Nees & Phillips, 2015)</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F3A4;</span> EVP Detections</div>';
      html += '<div class="report-item info"><div class="report-item-text">' +
        'No EVP candidates detected during this session.</div></div>';
      html += '</div>';
    }

    // Audio Analysis
    if (r.audio) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F3B5;</span> Audio Analysis</div>';
      html += '<div class="report-item info"><div class="report-item-text">';
      html += 'Baseline noise floor: ' +
        (r.audio.baselineRMSDb > -100 ? r.audio.baselineRMSDb.toFixed(1) + ' dB' : 'Not established') + '<br>';
      html += 'Audio anomaly events: ' + (r.audio.totalAnomalies || r.audio.anomalyCount || 0) + '<br>';
      html += 'Voice range activity: ' + (r.audio.voiceRangeActivity || 0).toFixed(1) + '%<br>';
      html += 'Sample rate: ' + (r.audio.sampleRate || 48000) + 'Hz | FFT size: ' +
        (r.audio.fftSize || 8192) + ' (' + (r.audio.binResolution || 5.9).toFixed(1) + 'Hz/bin)';
      html += '</div></div>';
      html += '</div>';
    }

    // Visual Analysis
    if (r.visual) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F441;</span> Visual Analysis</div>';
      html += '<div class="report-item info"><div class="report-item-text">';
      html += 'Average motion level: ' + (r.visual.averageMotionLevel || 0).toFixed(1) + '%<br>';
      html += 'Peak motion level: ' + (r.visual.peakMotionLevel || 0).toFixed(1) + '%<br>';
      html += 'Visual anomalies (high motion events): ' + (r.visual.totalAnomalies || 0) + '<br>';
      html += 'Last filter used: ' + (r.visual.lastMode || 'normal');
      html += '</div></div>';

      if (r.visual.anomalies && r.visual.anomalies.length > 0) {
        html += '<div class="report-item warning">';
        html += '<div class="report-item-title">Motion Events Detected</div>';
        html += '<div class="report-item-text">';
        var maxVisualEvents = Math.min(10, r.visual.anomalies.length);
        for (var vi = 0; vi < maxVisualEvents; vi++) {
          var va = r.visual.anomalies[vi];
          html += 'At ' + this._formatTime(va.timeSeconds) + ': Motion ' +
            va.level.toFixed(1) + '% (' + va.mode + ' mode)<br>';
        }
        if (r.visual.anomalies.length > 10) {
          html += '... and ' + (r.visual.anomalies.length - 10) + ' more events';
        }
        html += '</div></div>';
      }
      html += '</div>';
    }

    // Sensor Data
    if (r.sensors) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x26A1;</span> Environmental Sensors</div>';

      // Magnetometer
      if (r.sensors.magnetometer && r.sensors.magnetometer.available) {
        html += '<div class="report-item info">';
        html += '<div class="report-item-title">EMF (Magnetometer via ' +
          (r.sensors.magnetometer.source || 'device') + ')</div>';
        html += '<div class="report-item-text">Baseline: ' +
          (r.sensors.magnetometer.baselineMagnitude || 0).toFixed(1) + ' uT</div>';
        html += '</div>';
      } else {
        html += '<div class="report-item info"><div class="report-item-text">' +
          'EMF sensor: Unavailable on this device</div></div>';
      }

      // Accelerometer
      if (r.sensors.accelerometer && r.sensors.accelerometer.available) {
        html += '<div class="report-item info">';
        html += '<div class="report-item-title">Vibration (Accelerometer via ' +
          (r.sensors.accelerometer.source || 'device') + ')</div>';
        html += '<div class="report-item-text">Monitoring active</div>';
        html += '</div>';
      } else {
        html += '<div class="report-item info"><div class="report-item-text">' +
          'Vibration sensor: Unavailable on this device</div></div>';
      }

      // Sensor events
      if (r.sensors.events && r.sensors.events.length > 0) {
        html += '<div class="report-item danger">';
        html += '<div class="report-item-title">Sensor Anomaly Events</div>';
        html += '<div class="report-item-text">';
        var maxSensorEvents = Math.min(15, r.sensors.events.length);
        for (var si = 0; si < maxSensorEvents; si++) {
          var se = r.sensors.events[si];
          var seTime = this._formatTime(se.timeSeconds);
          if (se.type === 'emf') {
            html += seTime + ': EMF spike +' + se.deviation.toFixed(1) +
              ' uT (baseline: ' + se.baseline.toFixed(1) + ' uT)<br>';
          } else if (se.type === 'infrasound') {
            html += seTime + ': ' + (se.note || 'Infrasound event') +
              ' (' + se.frequency.toFixed(1) + 'Hz)<br>';
          }
        }
        if (r.sensors.events.length > 15) {
          html += '... and ' + (r.sensors.events.length - 15) + ' more events';
        }
        html += '</div></div>';
      }
      html += '</div>';
    }

    // Spirit Box
    if (r.spiritBox && r.spiritBox.active) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F4FB;</span> Spirit Box Session</div>';
      html += '<div class="report-item info"><div class="report-item-text">';
      html += 'Mode: ' + r.spiritBox.mode + ' | Speed: ' + r.spiritBox.sweepSpeed + 'ms<br>';
      html += 'Total sweeps: ' + r.spiritBox.totalSweeps + ' | Fragments: ' + r.spiritBox.fragmentsCaptured;
      html += '</div></div>';
      html += '</div>';
    }

    // Scientific Context
    html += this._renderScienceSection();

    // Disclaimer
    html += '<div class="report-section">';
    html += '<div class="report-section-title"><span class="rs-icon">&#x26A0;</span> Disclaimer</div>';
    html += '<div class="report-item info"><div class="report-item-text" style="color:#9e9ec0;font-size:0.75rem;">' +
      this._escapeHtml(this._disclaimer) + '</div></div>';
    html += '</div>';

    return html;
  }

  /**
   * Render technical detail HTML for the detailed report view.
   * @returns {string} HTML string
   */
  renderTechnicalDetail() {
    if (!this.report) return '';
    var r = this.report;
    var html = '';

    // Raw audio data
    if (r.audio) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title">Audio Raw Data</div>';
      html += '<div class="report-item info"><div class="report-item-text">' +
        '<pre style="font-size:0.7rem;overflow-x:auto;color:#9e9ec0;">';
      html += 'Total frames: ' + (r.audio.totalFrames || 0) + '\n';
      html += 'Baseline RMS: ' + (r.audio.baselineRMS || 0).toFixed(6) + '\n';
      html += 'Baseline dB: ' + (r.audio.baselineRMSDb || -100).toFixed(1) + '\n';
      html += 'Sample rate: ' + (r.audio.sampleRate || 48000) + '\n';
      html += 'FFT size: ' + (r.audio.fftSize || 8192) + '\n';
      html += 'Bin resolution: ' + (r.audio.binResolution || 5.9).toFixed(2) + ' Hz\n';
      html += 'Anomaly events: ' + (r.audio.totalAnomalies || r.audio.anomalyCount || 0) + '\n';
      html += 'Average HNR: ' + (r.audio.averageHnr || 0).toFixed(2) + ' dB\n';
      html += 'Peak HNR: ' + (r.audio.peakHnr || 0).toFixed(2) + ' dB\n';
      html += 'Voice range activity: ' + (r.audio.voiceRangeActivity || 0).toFixed(1) + '%';
      html += '</pre></div></div>';
      html += '</div>';
    }

    // EVP classifications detail
    var classifications = r.evpClassifications && r.evpClassifications.classifications
      ? r.evpClassifications.classifications
      : (r.audioEvidence ? r.audioEvidence.evpClassifications : []);

    if (classifications && classifications.length > 0) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title">EVP Classification Detail</div>';
      for (var ci = 0; ci < classifications.length; ci++) {
        var evp = classifications[ci];
        html += '<div class="report-item info"><div class="report-item-text">' +
          '<pre style="font-size:0.7rem;overflow-x:auto;color:#9e9ec0;">';
        html += 'Class: ' + evp.class + ' | Confidence: ' + evp.confidence + '%\n';
        html += 'Time: ' + evp.timestamp.toFixed(2) + 's | Duration: ' + evp.duration + 's\n';
        html += 'Centroid: ' + evp.spectralCentroid + 'Hz | HNR: ' + evp.hnr + 'dB | SNR: ' + evp.snr + 'dB\n';
        html += 'Formants: F1=' + evp.formants.f1 + 'Hz F2=' + evp.formants.f2 + 'Hz F3=' + evp.formants.f3 + 'Hz\n';
        html += 'Voice pattern: ' + evp.hasVoicePattern + ' | Clarity: ' + evp.formantClarity + '\n';
        html += 'Pareidolia warning: ' + evp.pareidoliaWarning;
        if (evp.note) html += '\nNote: ' + evp.note;
        html += '</pre></div></div>';
      }
      html += '</div>';
    }

    // Overall scoring breakdown
    if (r.summary) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title">Investigation Scoring</div>';
      html += '<div class="report-item info"><div class="report-item-text">' +
        '<pre style="font-size:0.7rem;overflow-x:auto;color:#9e9ec0;">';
      html += 'Overall Score: ' + r.summary.overallScore + '/100\n';
      html += 'Verdict: ' + r.summary.verdict + '\n';
      html += '\nScoring weights:\n';
      html += '  EVP Class A: 30 pts each (max 60)\n';
      html += '  EVP Class B: 15 pts each (max 30)\n';
      html += '  EVP Class C: 5 pts each (max 15)\n';
      html += '  EMF anomalies: 10 pts each (max 20)\n';
      html += '  Visual anomalies: 5 pts each (max 15)\n';
      html += '  Infrasound/fear freq: 15 pts each (max 30)\n';
      html += '  Spirit box fragments: 3 pts each (max 15)\n';
      html += '  Multi-sensor bonus: +20 (if 3+ sensor types)';
      html += '</pre></div></div>';
      html += '</div>';
    }

    // Sensor events detail
    if (r.sensors && r.sensors.events && r.sensors.events.length > 0) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title">Sensor Event Log</div>';
      html += '<div class="report-item info"><div class="report-item-text">' +
        '<pre style="font-size:0.7rem;overflow-x:auto;color:#9e9ec0;">';
      for (var sli = 0; sli < r.sensors.events.length; sli++) {
        var sle = r.sensors.events[sli];
        html += '[' + this._formatTime(sle.timeSeconds) + '] ' +
          sle.type.toUpperCase() + ': ' + JSON.stringify(sle) + '\n';
      }
      html += '</pre></div></div></div>';
    }

    return html;
  }

  /**
   * Render the scientific references section.
   * @returns {string} HTML
   */
  _renderScienceSection() {
    var html = '<div class="science-section">';
    html += '<div class="report-section-title"><span class="rs-icon">&#x1F52C;</span> Scientific Context</div>';

    for (var ri = 0; ri < this._references.length; ri++) {
      var ref = this._references[ri];
      html += '<div class="science-ref">';
      html += '<span class="author">' + this._escapeHtml(ref.author) + ' (' + ref.year + ').</span> ';
      html += '"' + this._escapeHtml(ref.title) + '." ';
      if (ref.journal) html += this._escapeHtml(ref.journal) + '. ';
      html += '<em>\u2014 ' + this._escapeHtml(ref.finding) + '</em>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Get timeline events from all sources, sorted by time.
   * @returns {Array}
   */
  getTimelineEvents() {
    if (!this.report) return [];
    var events = [];

    // EVP events
    var classifications = this.report.evpClassifications && this.report.evpClassifications.classifications
      ? this.report.evpClassifications.classifications
      : (this.report.audioEvidence ? this.report.audioEvidence.evpClassifications : []);

    if (classifications) {
      for (var i = 0; i < classifications.length; i++) {
        var evp = classifications[i];
        events.push({
          time: evp.timestamp,
          type: 'evp',
          class: evp.class,
          detail: 'Class ' + evp.class + ' EVP (' + evp.confidence + '%)'
        });
      }
    }

    // Sensor events
    if (this.report.sensors && this.report.sensors.events) {
      for (var j = 0; j < this.report.sensors.events.length; j++) {
        var se = this.report.sensors.events[j];
        events.push({
          time: se.timeSeconds,
          type: se.type,
          detail: se.note || (se.type + ' event')
        });
      }
    }

    // Visual anomalies
    if (this.report.visual && this.report.visual.anomalies) {
      for (var k = 0; k < this.report.visual.anomalies.length; k++) {
        var va = this.report.visual.anomalies[k];
        events.push({
          time: va.timeSeconds,
          type: 'visual',
          detail: 'Motion ' + va.level.toFixed(1) + '%'
        });
      }
    }

    events.sort(function(a, b) { return a.time - b.time; });
    return events;
  }

  /**
   * Return a one-line summary string.
   * @returns {string}
   */
  getSummary() {
    if (!this.report) return 'No investigation data available.';
    var r = this.report;
    return 'Investigation: ' + r.duration +
      ' | Activity: ' + r.activityLevel +
      ' | Score: ' + (r.summary ? r.summary.overallScore : '?') + '/100' +
      ' | EVP: ' + r.evpSummary.total +
      ' (A:' + r.evpSummary.classA + ' B:' + r.evpSummary.classB + ' C:' + r.evpSummary.classC + ')' +
      ' | Anomalies: ' + r.totalAnomalies;
  }

  /**
   * Export the report as a plain text string for copying/sharing.
   * @returns {string}
   */
  exportText() {
    if (!this.report) return 'No investigation data available.';

    var r = this.report;
    var lines = [];

    lines.push('=== EVP-MINI INVESTIGATION REPORT ===');
    lines.push('Date: ' + (r.summary ? r.summary.date : r.timestamp));
    lines.push('Duration: ' + r.duration);
    lines.push('Overall Score: ' + (r.summary ? r.summary.overallScore + '/100' : 'N/A'));
    lines.push('Verdict: ' + (r.summary ? r.summary.verdict : r.activityLevel));
    lines.push('');

    // Narrative
    if (r.summary && r.summary.narrative) {
      lines.push('--- NARRATIVE ---');
      lines.push(r.summary.narrative);
      lines.push('');
    }

    // EVP Evidence
    lines.push('--- EVP EVIDENCE ---');
    lines.push('Total EVP candidates: ' + r.evpSummary.total);
    lines.push('  Class A: ' + r.evpSummary.classA);
    lines.push('  Class B: ' + r.evpSummary.classB);
    lines.push('  Class C: ' + r.evpSummary.classC);
    lines.push('Average noise floor: ' + (r.audioEvidence ? r.audioEvidence.averageNoiseFloor.toFixed(1) : '?') + ' dB');

    var classifications = r.audioEvidence ? r.audioEvidence.evpClassifications : [];
    if (classifications && classifications.length > 0) {
      lines.push('');
      for (var i = 0; i < classifications.length; i++) {
        var c = classifications[i];
        lines.push('  [' + this._formatTime(c.timestamp) + '] Class ' + c.class +
          ' (' + c.confidence + '%) - ' + c.duration + 's - ' +
          'Centroid: ' + c.spectralCentroid + 'Hz, HNR: ' + c.hnr + 'dB, SNR: ' + c.snr + 'dB');
        if (c.note) lines.push('    ' + c.note);
      }
    }
    lines.push('');

    // Visual
    lines.push('--- VISUAL FINDINGS ---');
    lines.push('Anomalies: ' + (r.visualFindings ? r.visualFindings.anomalyCount : 0));
    lines.push('Avg motion: ' + (r.visualFindings ? r.visualFindings.averageMotionLevel.toFixed(1) : '0') + '%');
    lines.push('Peak motion: ' + (r.visualFindings ? r.visualFindings.peakMotionLevel.toFixed(1) : '0') + '%');
    lines.push('');

    // Sensors
    lines.push('--- ENVIRONMENTAL SENSORS ---');
    lines.push('EMF anomalies: ' + (r.sensorData ? r.sensorData.emfAnomalyCount : 0));
    lines.push('Infrasound events: ' + (r.sensorData ? r.sensorData.infrasoundEvents : 0));
    lines.push('Fear frequency detections: ' + (r.sensorData ? r.sensorData.fearFreqDetections : 0));
    lines.push('');

    // Spirit Box
    if (r.spiritBox && r.spiritBox.active) {
      lines.push('--- SPIRIT BOX ---');
      lines.push('Mode: ' + r.spiritBox.mode);
      lines.push('Sweeps: ' + r.spiritBox.totalSweeps);
      lines.push('Fragments: ' + r.spiritBox.fragmentsCaptured);
      lines.push('');
    }

    // Disclaimer
    lines.push('--- DISCLAIMER ---');
    lines.push(this._disclaimer);
    lines.push('');

    // References
    lines.push('--- REFERENCES ---');
    for (var ri = 0; ri < this._references.length; ri++) {
      var ref = this._references[ri];
      lines.push(ref.author + ' (' + ref.year + '). "' + ref.title + '."' +
        (ref.journal ? ' ' + ref.journal + '.' : '') +
        ' - ' + ref.finding);
    }

    return lines.join('\n');
  }

  /**
   * Export the full report as a JSON string.
   * @returns {string}
   */
  exportJSON() {
    if (!this.report) return '{}';

    // Build a clean export object (omit raw engine data references)
    var exportObj = {
      summary: this.report.summary,
      audioEvidence: this.report.audioEvidence,
      visualFindings: this.report.visualFindings,
      sensorData: this.report.sensorData,
      spiritBox: this.report.spiritBox,
      scientificContext: this.report.scientificContext,
      disclaimer: this.report.disclaimer,
      timestamp: this.report.timestamp,
      duration: this.report.duration,
      durationSeconds: this.report.durationSeconds,
      activityLevel: this.report.activityLevel,
      totalAnomalies: this.report.totalAnomalies,
      evpSummary: this.report.evpSummary
    };

    return JSON.stringify(exportObj, null, 2);
  }

  /**
   * Clear all stored report data.
   */
  clearAll() {
    this.report = null;
  }

  /**
   * Format seconds as M:SS string.
   * @param {number} seconds
   * @returns {string}
   */
  _formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.EvidenceReport = EvidenceReport;
