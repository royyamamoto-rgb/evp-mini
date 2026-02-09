/**
 * EvidenceReport — Post-scan analysis aggregation and report generation
 * Collects data from all engines and produces a coherent investigation report
 */
class EvidenceReport {
  constructor() {
    this.report = null;
  }

  analyze(audioReport, spiritBoxReport, visualReport, sensorReport, evpClassifications, recordingData) {
    const evpSummary = evpClassifications ? evpClassifications.summary : { total: 0, classA: 0, classB: 0, classC: 0 };
    const totalAnomalies = (audioReport ? audioReport.totalAnomalies : 0) +
                           (visualReport ? visualReport.totalAnomalies : 0) +
                           (sensorReport ? sensorReport.totalEvents : 0);

    // Determine activity level
    let activityLevel = 'Quiet';
    if (totalAnomalies > 20 || evpSummary.classA > 0) activityLevel = 'High Activity';
    else if (totalAnomalies > 10 || evpSummary.classB > 0) activityLevel = 'Moderate Activity';
    else if (totalAnomalies > 3 || evpSummary.classC > 0) activityLevel = 'Low Activity';

    // Duration
    const totalFrames = audioReport ? audioReport.totalFrames : 0;
    const durationSeconds = totalFrames / 30;
    const durationMinutes = Math.floor(durationSeconds / 60);
    const durationRemainder = Math.floor(durationSeconds % 60);
    const durationStr = `${durationMinutes}m ${durationRemainder}s`;

    this.report = {
      timestamp: new Date().toISOString(),
      duration: durationStr,
      durationSeconds: durationSeconds,
      activityLevel: activityLevel,
      totalAnomalies: totalAnomalies,
      evpSummary: evpSummary,
      audio: audioReport,
      spiritBox: spiritBoxReport,
      visual: visualReport,
      sensors: sensorReport,
      evpClassifications: evpClassifications,
      recording: recordingData
    };

    return this.report;
  }

  renderFriendlyReport() {
    if (!this.report) return '<p>No data available.</p>';

    const r = this.report;
    let html = '';

    // Investigation Summary
    html += '<div class="report-section">';
    html += '<div class="report-section-title"><span class="rs-icon">&#x1F50D;</span> Investigation Summary</div>';
    html += `<div class="report-item info">
      <div class="report-item-title">Duration: ${r.duration} | Activity: ${r.activityLevel}</div>
      <div class="report-item-text">Total anomalies detected: ${r.totalAnomalies} | EVP candidates: ${r.evpSummary.total}</div>
    </div>`;
    html += '</div>';

    // EVP Detections
    if (r.evpClassifications && r.evpClassifications.classifications && r.evpClassifications.classifications.length > 0) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F3A4;</span> EVP Detections</div>';

      for (const evp of r.evpClassifications.classifications) {
        const timeStr = this._formatTime(evp.timestamp);
        const classType = evp.pareidoliaWarning ? 'warning' : (evp.class === 'A' ? 'success' : 'info');
        html += `<div class="evp-detection-item">
          <span class="evp-time">${timeStr}</span>
          <span class="evp-class-badge class-${evp.class.toLowerCase()}">Class ${evp.class}</span>
          <div class="evp-details">
            Duration: ${evp.duration}s | Confidence: ${evp.confidence}% |
            Centroid: ${evp.spectralCentroid}Hz | HNR: ${evp.hnr}dB | SNR: ${evp.snr}dB
          </div>
          <div class="evp-formants">
            Formants: F1=${evp.formants.f1}Hz F2=${evp.formants.f2}Hz F3=${evp.formants.f3}Hz
            ${evp.hasVoicePattern ? '| Voice pattern detected' : ''}
          </div>
          ${evp.pareidoliaWarning ? '<div class="report-item-text" style="color:#ff9100;margin-top:4px;">Note: Low confidence — may be auditory pareidolia (Nees & Phillips, 2015)</div>' : ''}
        </div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F3A4;</span> EVP Detections</div>';
      html += '<div class="report-item info"><div class="report-item-text">No EVP candidates detected during this session.</div></div>';
      html += '</div>';
    }

    // Audio Analysis
    if (r.audio) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F3B5;</span> Audio Analysis</div>';
      html += `<div class="report-item info">
        <div class="report-item-text">
          Baseline noise floor: ${r.audio.baselineRMSDb > -100 ? r.audio.baselineRMSDb.toFixed(1) + ' dB' : 'Not established'}<br>
          Audio anomaly events: ${r.audio.totalAnomalies}<br>
          Sample rate: ${r.audio.sampleRate}Hz | FFT size: ${r.audio.fftSize} (${r.audio.binResolution.toFixed(1)}Hz/bin)
        </div>
      </div>`;
      html += '</div>';
    }

    // Visual Analysis
    if (r.visual) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F441;</span> Visual Analysis</div>';
      html += `<div class="report-item info">
        <div class="report-item-text">
          Average motion level: ${r.visual.averageMotionLevel.toFixed(1)}%<br>
          Peak motion level: ${r.visual.peakMotionLevel.toFixed(1)}%<br>
          Visual anomalies (high motion events): ${r.visual.totalAnomalies}<br>
          Last filter used: ${r.visual.lastMode}
        </div>
      </div>`;

      if (r.visual.anomalies && r.visual.anomalies.length > 0) {
        html += '<div class="report-item warning">';
        html += '<div class="report-item-title">Motion Events Detected</div>';
        html += '<div class="report-item-text">';
        for (const a of r.visual.anomalies.slice(0, 10)) {
          html += `At ${this._formatTime(a.timeSeconds)}: Motion ${a.level.toFixed(1)}% (${a.mode} mode)<br>`;
        }
        if (r.visual.anomalies.length > 10) {
          html += `... and ${r.visual.anomalies.length - 10} more events`;
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
        html += `<div class="report-item info">
          <div class="report-item-title">EMF (Magnetometer via ${r.sensors.magnetometer.source})</div>
          <div class="report-item-text">Baseline: ${r.sensors.magnetometer.baselineMagnitude.toFixed(1)} uT</div>
        </div>`;
      } else {
        html += '<div class="report-item info"><div class="report-item-text">EMF sensor: Unavailable on this device</div></div>';
      }

      // Accelerometer
      if (r.sensors.accelerometer && r.sensors.accelerometer.available) {
        html += `<div class="report-item info">
          <div class="report-item-title">Vibration (Accelerometer via ${r.sensors.accelerometer.source})</div>
          <div class="report-item-text">Monitoring active</div>
        </div>`;
      } else {
        html += '<div class="report-item info"><div class="report-item-text">Vibration sensor: Unavailable on this device</div></div>';
      }

      // Sensor events
      if (r.sensors.events && r.sensors.events.length > 0) {
        html += '<div class="report-item danger">';
        html += '<div class="report-item-title">Sensor Anomaly Events</div>';
        html += '<div class="report-item-text">';
        for (const e of r.sensors.events.slice(0, 15)) {
          const timeStr = this._formatTime(e.timeSeconds);
          if (e.type === 'emf') {
            html += `${timeStr}: EMF spike +${e.deviation.toFixed(1)} uT (baseline: ${e.baseline.toFixed(1)} uT)<br>`;
          } else if (e.type === 'infrasound') {
            html += `${timeStr}: ${e.note} (${e.frequency.toFixed(1)}Hz)<br>`;
          }
        }
        if (r.sensors.events.length > 15) {
          html += `... and ${r.sensors.events.length - 15} more events`;
        }
        html += '</div></div>';
      }
      html += '</div>';
    }

    // Spirit Box
    if (r.spiritBox && r.spiritBox.totalSweeps > 0) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title"><span class="rs-icon">&#x1F4FB;</span> Spirit Box Session</div>';
      html += `<div class="report-item info">
        <div class="report-item-text">
          Mode: ${r.spiritBox.mode} | Speed: ${r.spiritBox.sweepSpeed}ms<br>
          Total sweeps: ${r.spiritBox.totalSweeps} | Fragments: ${r.spiritBox.fragments.length}
        </div>
      </div>`;
      html += '</div>';
    }

    // Scientific Context
    html += this._renderScienceSection();

    return html;
  }

  renderTechnicalDetail() {
    if (!this.report) return '';
    const r = this.report;
    let html = '';

    // Raw audio data
    if (r.audio) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title">Audio Raw Data</div>';
      html += `<div class="report-item info"><div class="report-item-text"><pre style="font-size:0.7rem;overflow-x:auto;color:#9e9ec0;">
Total frames: ${r.audio.totalFrames}
Baseline RMS: ${r.audio.baselineRMS.toFixed(6)}
Baseline dB: ${r.audio.baselineRMSDb.toFixed(1)}
Sample rate: ${r.audio.sampleRate}
FFT size: ${r.audio.fftSize}
Bin resolution: ${r.audio.binResolution.toFixed(2)} Hz
Anomaly events: ${r.audio.totalAnomalies}</pre></div></div>`;
      html += '</div>';
    }

    // EVP classifications detail
    if (r.evpClassifications && r.evpClassifications.classifications.length > 0) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title">EVP Classification Detail</div>';
      for (const evp of r.evpClassifications.classifications) {
        html += `<div class="report-item info"><div class="report-item-text"><pre style="font-size:0.7rem;overflow-x:auto;color:#9e9ec0;">
Class: ${evp.class} | Confidence: ${evp.confidence}%
Time: ${evp.timestamp.toFixed(2)}s | Duration: ${evp.duration}s
Centroid: ${evp.spectralCentroid}Hz | HNR: ${evp.hnr}dB | SNR: ${evp.snr}dB
Formants: F1=${evp.formants.f1}Hz F2=${evp.formants.f2}Hz F3=${evp.formants.f3}Hz
Voice pattern: ${evp.hasVoicePattern} | Clarity: ${evp.formantClarity}
Pareidolia warning: ${evp.pareidoliaWarning}</pre></div></div>`;
      }
      html += '</div>';
    }

    // Sensor events detail
    if (r.sensors && r.sensors.events && r.sensors.events.length > 0) {
      html += '<div class="report-section">';
      html += '<div class="report-section-title">Sensor Event Log</div>';
      html += '<div class="report-item info"><div class="report-item-text"><pre style="font-size:0.7rem;overflow-x:auto;color:#9e9ec0;">';
      for (const e of r.sensors.events) {
        html += `[${this._formatTime(e.timeSeconds)}] ${e.type.toUpperCase()}: ${JSON.stringify(e)}\n`;
      }
      html += '</pre></div></div></div>';
    }

    return html;
  }

  _renderScienceSection() {
    return `
    <div class="science-section">
      <div class="report-section-title"><span class="rs-icon">&#x1F52C;</span> Scientific Context</div>
      <div class="science-ref">
        <span class="author">Nees, M.A. & Phillips, C. (2015).</span>
        "Auditory pareidolia: Effects of contextual priming on perceptions of purportedly paranormal and ambiguous auditory stimuli."
        Applied Cognitive Psychology, 29(1), 129-134.
        <em>— The brain readily perceives speech patterns in random noise, especially when primed to expect them.</em>
      </div>
      <div class="science-ref">
        <span class="author">Tandy, V. & Lawrence, T.R. (1998).</span>
        "The ghost in the machine."
        Journal of the Society for Psychical Research, 62(851), 360-364.
        <em>— 18.98Hz infrasound causes anxiety, visual disturbances, and feelings of presence via eyeball resonance.</em>
      </div>
      <div class="science-ref">
        <span class="author">Baruss, I. (2001).</span>
        "Failure to replicate electronic voice phenomenon."
        Journal of Scientific Exploration, 15(3), 355-367.
        <em>— Attempts to replicate EVP under controlled conditions yielded mixed results.</em>
      </div>
      <div class="science-ref">
        <span class="author">Persinger, M.A. (1987).</span>
        "Neuropsychological Bases of God Beliefs."
        Praeger Publishers.
        <em>— Weak magnetic fields (10nT-1uT) applied to temporal lobes can induce feelings of presence and anomalous experiences.</em>
      </div>
      <div class="science-ref">
        <span class="author">Raudive, K. (1971).</span>
        "Breakthrough: An Amazing Experiment in Electronic Communication with the Dead."
        Colin Smythe Ltd.
        <em>— Pioneering EVP research methodology. Historical reference only.</em>
      </div>
    </div>`;
  }

  _formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  getTimelineEvents() {
    if (!this.report) return [];
    const events = [];

    // Add EVP events
    if (this.report.evpClassifications && this.report.evpClassifications.classifications) {
      for (const evp of this.report.evpClassifications.classifications) {
        events.push({ time: evp.timestamp, type: 'evp', class: evp.class, detail: `Class ${evp.class} EVP (${evp.confidence}%)` });
      }
    }

    // Add sensor events
    if (this.report.sensors && this.report.sensors.events) {
      for (const e of this.report.sensors.events) {
        events.push({ time: e.timeSeconds, type: e.type, detail: e.note || `${e.type} event` });
      }
    }

    // Add visual anomalies
    if (this.report.visual && this.report.visual.anomalies) {
      for (const a of this.report.visual.anomalies) {
        events.push({ time: a.timeSeconds, type: 'visual', detail: `Motion ${a.level.toFixed(1)}%` });
      }
    }

    events.sort((a, b) => a.time - b.time);
    return events;
  }

  getSummary() {
    if (!this.report) return 'No investigation data available.';
    const r = this.report;
    return `Investigation: ${r.duration} | Activity: ${r.activityLevel} | EVP: ${r.evpSummary.total} (A:${r.evpSummary.classA} B:${r.evpSummary.classB} C:${r.evpSummary.classC}) | Anomalies: ${r.totalAnomalies}`;
  }

  clearAll() {
    this.report = null;
  }
}

window.EvidenceReport = EvidenceReport;
