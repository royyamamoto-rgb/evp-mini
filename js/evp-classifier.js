/**
 * EVPClassifier — Classifies audio anomalies into EVP Class A/B/C
 * Based on formant structure, harmonic-to-noise ratio, spectral centroid, and SNR
 *
 * Classification system based on standard EVP research methodology:
 * - Class A: Clear voice, no interpretation needed, audible on speakers
 *   Centroid 300-3000Hz AND HNR >15dB AND 2+ formants AND SNR >20dB AND duration 0.5-3s
 * - Class B: Somewhat clear, may need headphones, can be interpreted multiple ways
 *   Centroid 300-3000Hz AND HNR 8-15dB AND 1+ formant AND SNR >10dB
 * - Class C: Faint, needs audio processing, may be pareidolia
 *   Any anomaly in voice range AND SNR >5dB
 *
 * Scientific caveat: Nees & Phillips (2015) demonstrated that auditory pareidolia —
 * the brain finding speech patterns in random noise — is a significant factor in
 * perceived EVP. All classifications should be interpreted with this in mind.
 */
class EVPClassifier {
  constructor() {
    // Classification history
    this.classifications = [];
    this.maxClassifications = 100;
    this.frameCount = 0;

    // Classification thresholds
    this.thresholds = {
      classA: {
        centroidMin: 300,
        centroidMax: 3000,
        hnrMin: 15,
        formantClarity: 2,
        snrMin: 20,
        durationMin: 0.5,
        durationMax: 3.0
      },
      classB: {
        centroidMin: 300,
        centroidMax: 3000,
        hnrMin: 8,
        hnrMax: 15,
        formantClarity: 1,
        snrMin: 10
      },
      classC: {
        centroidMin: 200,
        centroidMax: 4000,
        snrMin: 5
      }
    };

    // Anomaly accumulation buffer — builds segments from consecutive anomaly frames
    this.currentSegment = null;
    this.minSegmentDuration = 0.1;  // seconds
    this.maxSegmentGap = 0.2;       // seconds — merge nearby anomalies
    this.gapFrames = 0;             // frames since last anomaly in current segment
    this.maxGapFrames = 6;          // 0.2s at ~30fps

    // Cooldown to prevent rapid-fire classifications
    this.cooldownFrames = 0;
    this.cooldownTarget = 30;       // ~1 second between classifications

    // Session start time for timestamp computation
    this._sessionStartTime = performance.now();
  }

  /**
   * Called every frame with the audio engine's quick assessment and noise floor.
   * Accumulates consecutive anomaly frames into segments.
   * When a segment ends (gap > maxSegmentGap), classifies it.
   *
   * @param {Object} audioAnalysis - from EVPAudioEngine.getQuickAssess()
   * @param {Object} noiseFloor - from EVPAudioEngine.getNoiseFloor()
   * @returns {Object|null} classification result or null
   */
  processFrame(audioAnalysis, noiseFloor) {
    this.frameCount++;

    if (this.cooldownFrames > 0) {
      this.cooldownFrames--;
    }

    if (!audioAnalysis || !noiseFloor || !noiseFloor.established) return null;

    var isAnomaly = audioAnalysis.isAnomaly;
    var centroid = audioAnalysis.centroid || 0;
    var hnr = audioAnalysis.hnr || 0;
    var snr = audioAnalysis.snr || 0;
    var formantClarity = audioAnalysis.formantClarity || 0;
    var formantMatch = audioAnalysis.formantMatch || false;
    var rmsDb = audioAnalysis.rmsDb || -100;
    var f1 = audioAnalysis.f1 || 0;
    var f2 = audioAnalysis.f2 || 0;
    var f3 = audioAnalysis.f3 || 0;
    var peakFreq = audioAnalysis.peakFreq || 0;

    if (isAnomaly) {
      this.gapFrames = 0;

      if (!this.currentSegment) {
        // Start a new segment
        this.currentSegment = {
          startFrame: this.frameCount,
          startTime: (performance.now() - this._sessionStartTime) / 1000,
          centroids: [centroid],
          hnrs: [hnr],
          snrs: [snr],
          formantClarities: [formantClarity],
          rmsValues: [rmsDb],
          f1s: [f1],
          f2s: [f2],
          f3s: [f3],
          peakFreqs: [peakFreq],
          hasVoicePattern: formantMatch,
          frameCount: 1
        };
      } else {
        // Continue the current segment
        this.currentSegment.centroids.push(centroid);
        this.currentSegment.hnrs.push(hnr);
        this.currentSegment.snrs.push(snr);
        this.currentSegment.formantClarities.push(formantClarity);
        this.currentSegment.rmsValues.push(rmsDb);
        this.currentSegment.f1s.push(f1);
        this.currentSegment.f2s.push(f2);
        this.currentSegment.f3s.push(f3);
        this.currentSegment.peakFreqs.push(peakFreq);
        if (formantMatch) this.currentSegment.hasVoicePattern = true;
        this.currentSegment.frameCount++;
      }
    } else if (this.currentSegment) {
      // Non-anomaly frame while we have an active segment
      this.gapFrames++;

      if (this.gapFrames > this.maxGapFrames) {
        // Gap exceeded threshold — finalize the segment
        var classification = this._finalizeSegment(this.currentSegment, noiseFloor);
        this.currentSegment = null;
        this.gapFrames = 0;

        if (classification && this.cooldownFrames <= 0) {
          if (this.classifications.length < this.maxClassifications) {
            this.classifications.push(classification);
          }
          this.cooldownFrames = this.cooldownTarget;
          return classification;
        }
      }
    }

    return null;
  }

  /**
   * Backward-compatible alias for processFrame.
   */
  feedFrame(audioAnalysis, noiseFloor) {
    return this.processFrame(audioAnalysis, noiseFloor);
  }

  /**
   * Finalize a segment: compute averages and classify.
   * @param {Object} segment - accumulated segment data
   * @param {Object} noiseFloor - noise floor reference
   * @returns {Object|null} classification or null if too short
   */
  _finalizeSegment(segment, noiseFloor) {
    var duration = segment.frameCount / 30; // seconds at ~30fps
    if (duration < this.minSegmentDuration) return null;

    var avgCentroid = this._mean(segment.centroids);
    var avgHNR = this._mean(segment.hnrs);
    var avgSNR = this._mean(segment.snrs);
    var maxFormantClarity = Math.max.apply(null, segment.formantClarities);
    var avgRMS = this._mean(segment.rmsValues);
    var avgF1 = this._mean(segment.f1s.filter(function(f) { return f > 0; }));
    var avgF2 = this._mean(segment.f2s.filter(function(f) { return f > 0; }));
    var avgF3 = this._mean(segment.f3s.filter(function(f) { return f > 0; }));

    // Compute SNR relative to noise floor if available
    var computedSNR = avgSNR;
    if (noiseFloor && noiseFloor.rmsDb > -100) {
      var floorSNR = avgRMS - noiseFloor.rmsDb;
      computedSNR = Math.max(avgSNR, floorSNR);
    }

    return this.classifySegment({
      avgCentroid: avgCentroid,
      avgHNR: avgHNR,
      avgSNR: computedSNR,
      maxFormantClarity: maxFormantClarity,
      avgRMS: avgRMS,
      avgF1: avgF1,
      avgF2: avgF2,
      avgF3: avgF3,
      duration: duration,
      hasVoicePattern: segment.hasVoicePattern,
      startFrame: segment.startFrame,
      startTime: segment.startTime,
      frameCount: segment.frameCount
    });
  }

  /**
   * Apply A/B/C criteria to a segment's computed averages.
   * @param {Object} segment - {avgCentroid, avgHNR, avgSNR, maxFormantClarity, duration, ...}
   * @returns {Object} classification result
   */
  classifySegment(segment) {
    var evpClass = null;
    var confidence = 0;
    var note = '';

    var centroid = segment.avgCentroid;
    var hnr = segment.avgHNR;
    var snr = segment.avgSNR;
    var formantCount = segment.maxFormantClarity;
    var duration = segment.duration;

    // Class A: Clear, unmistakable voice-like pattern
    var tA = this.thresholds.classA;
    if (centroid >= tA.centroidMin && centroid <= tA.centroidMax &&
        hnr >= tA.hnrMin &&
        formantCount >= tA.formantClarity &&
        snr >= tA.snrMin &&
        duration >= tA.durationMin && duration <= tA.durationMax) {
      evpClass = 'A';
      confidence = Math.min(95, 50 + hnr + formantCount * 10 + Math.min(snr, 30));
      note = 'Clear voice-like pattern with strong formant structure and high SNR. ' +
             'Duration ' + duration.toFixed(2) + 's within expected speech range.';
    }
    // Class B: Moderate, some interpretation needed
    else {
      var tB = this.thresholds.classB;
      if (centroid >= tB.centroidMin && centroid <= tB.centroidMax &&
          hnr >= tB.hnrMin &&
          formantCount >= tB.formantClarity &&
          snr >= tB.snrMin) {
        evpClass = 'B';
        confidence = Math.min(70, 30 + hnr + formantCount * 5 + Math.min(snr, 20));
        note = 'Moderate voice-range anomaly with partial formant structure. ' +
               'May require headphones for clear perception.';
      }
      // Class C: Faint, may be pareidolia
      else {
        var tC = this.thresholds.classC;
        if (centroid >= tC.centroidMin && centroid <= tC.centroidMax &&
            snr >= tC.snrMin) {
          evpClass = 'C';
          confidence = Math.min(50, 15 + Math.min(snr, 15));
          note = 'Faint anomaly in voice frequency range. Low confidence — ' +
                 'likely candidate for auditory pareidolia (Nees & Phillips, 2015).';
        }
      }
    }

    if (!evpClass) return null;

    var timestamp = segment.startTime || (segment.startFrame / 30);

    return {
      class: evpClass,
      confidence: Math.round(confidence),
      timestamp: timestamp,
      duration: Math.round(duration * 100) / 100,
      spectralCentroid: Math.round(centroid),
      hnr: Math.round(hnr * 10) / 10,
      snr: Math.round(snr * 10) / 10,
      formantClarity: formantCount,
      hasVoicePattern: segment.hasVoicePattern,
      formants: {
        f1: Math.round(segment.avgF1 || 0),
        f2: Math.round(segment.avgF2 || 0),
        f3: Math.round(segment.avgF3 || 0)
      },
      metrics: {
        centroid: Math.round(centroid),
        hnr: Math.round(hnr * 10) / 10,
        snr: Math.round(snr * 10) / 10,
        formantCount: formantCount
      },
      note: note,
      pareidoliaWarning: evpClass === 'C' || confidence < 40,
      frame: segment.startFrame
    };
  }

  /**
   * Return all classifications sorted by timestamp.
   * @returns {Array} classifications
   */
  getClassifications() {
    return this.classifications.slice().sort(function(a, b) {
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Return the most recent classification or null.
   * @returns {Object|null}
   */
  getClassification() {
    if (this.classifications.length === 0) return null;
    return this.classifications[this.classifications.length - 1];
  }

  /**
   * Backward-compatible alias for getClassifications.
   * @returns {Array}
   */
  getAllClassifications() {
    return this.getClassifications();
  }

  /**
   * Return classification counts.
   * @returns {Object} {classA, classB, classC, total}
   */
  getStats() {
    var classA = 0;
    var classB = 0;
    var classC = 0;
    for (var i = 0; i < this.classifications.length; i++) {
      var c = this.classifications[i].class;
      if (c === 'A') classA++;
      else if (c === 'B') classB++;
      else if (c === 'C') classC++;
    }
    return {
      classA: classA,
      classB: classB,
      classC: classC,
      total: this.classifications.length
    };
  }

  /**
   * Backward-compatible summary method.
   * @returns {Object}
   */
  getSummary() {
    var stats = this.getStats();
    return {
      total: stats.total,
      classA: stats.classA,
      classB: stats.classB,
      classC: stats.classC,
      highestClass: stats.classA > 0 ? 'A' : stats.classB > 0 ? 'B' : stats.classC > 0 ? 'C' : null,
      avgConfidence: this.classifications.length > 0
        ? Math.round(this._mean(this.classifications.map(function(c) { return c.confidence; })))
        : 0
    };
  }

  /**
   * Return the formant analysis of the most recent classification.
   * @returns {Object|null}
   */
  getFormantAnalysis() {
    if (this.classifications.length === 0) return null;
    var last = this.classifications[this.classifications.length - 1];
    return last.formants;
  }

  /**
   * Return comprehensive analysis for evidence report.
   * Includes scientific caveats and pareidolia warning.
   * @returns {Object} full analysis
   */
  fullAnalysis() {
    var stats = this.getStats();
    var sorted = this.getClassifications();

    // Find strongest evidence: highest class, then highest confidence
    var strongestEvidence = null;
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      if (!strongestEvidence) {
        strongestEvidence = c;
      } else {
        var rank = { 'A': 3, 'B': 2, 'C': 1 };
        var currentRank = rank[c.class] || 0;
        var bestRank = rank[strongestEvidence.class] || 0;
        if (currentRank > bestRank || (currentRank === bestRank && c.confidence > strongestEvidence.confidence)) {
          strongestEvidence = c;
        }
      }
    }

    return {
      classifications: sorted,
      stats: stats,
      // Backward-compatible summary field
      summary: this.getSummary(),
      strongestEvidence: strongestEvidence,
      totalFrames: this.frameCount,
      scientificContext: 'EVP research remains controversial in the scientific community. ' +
        'While proponents argue that electronic voice phenomena represent anomalous signals, ' +
        'controlled studies (Baruss, 2001) have failed to replicate EVP under blinded conditions. ' +
        'Signal processing artifacts, radio frequency interference, and cognitive bias are ' +
        'well-documented alternative explanations.',
      caveats: [
        'Auditory pareidolia (Nees & Phillips, 2015) is the tendency to perceive meaningful ' +
        'patterns in random noise. This effect is amplified when listeners are primed to expect ' +
        'speech, making EVP interpretation inherently subjective.',
        'Environmental interference from electromagnetic sources, mechanical vibrations, and ' +
        'acoustic reflections can produce anomalous audio signatures that mimic voice-like patterns.',
        'Smartphone microphones have automatic gain control (AGC) that can amplify noise during ' +
        'quiet periods, creating artificial signal fluctuations.',
        'Web Audio API frequency resolution is limited by FFT size and sample rate. Sub-bin ' +
        'accuracy relies on parabolic interpolation, which has inherent approximation error.'
      ],
      scienceNote: 'Nees & Phillips (2015) demonstrated auditory pareidolia \u2014 the brain\'s ' +
        'tendency to perceive speech in random noise \u2014 affects EVP interpretation. Class C ' +
        'detections are particularly susceptible.'
    };
  }

  /**
   * Clear all history and reset state.
   */
  reset() {
    this.classifications = [];
    this.currentSegment = null;
    this.gapFrames = 0;
    this.cooldownFrames = 0;
    this.frameCount = 0;
    this._sessionStartTime = performance.now();
  }

  /**
   * Backward-compatible alias for reset.
   */
  clearAll() {
    this.reset();
  }

  /**
   * Compute arithmetic mean of an array.
   * @param {Array<number>} arr
   * @returns {number}
   */
  _mean(arr) {
    if (!arr || arr.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum / arr.length;
  }
}

window.EVPClassifier = EVPClassifier;
