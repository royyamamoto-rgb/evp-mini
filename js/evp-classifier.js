/**
 * EVPClassifier — Classifies audio anomalies into EVP Class A/B/C
 * Based on formant structure, harmonic-to-noise ratio, spectral centroid, and SNR
 *
 * Classification system based on standard EVP research methodology:
 * - Class A: Clear voice, no interpretation needed, audible on speakers
 * - Class B: Somewhat clear, may need headphones, can be interpreted multiple ways
 * - Class C: Faint, needs audio processing, may be pareidolia
 *
 * Scientific caveat: Nees & Phillips (2015) demonstrated that auditory pareidolia —
 * the brain finding speech patterns in random noise — is a significant factor in
 * perceived EVP. All classifications should be interpreted with this in mind.
 */
class EVPClassifier {
  constructor() {
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
        formantClarity: 1,
        snrMin: 10
      },
      classC: {
        centroidMin: 200,
        centroidMax: 4000,
        snrMin: 5
      }
    };

    // Anomaly tracking for duration measurement
    this.currentAnomaly = null;
    this.anomalyStartFrame = 0;
    this.anomalyFrames = 0;
    this.cooldownFrames = 0;
    this.cooldownTarget = 30; // ~1 second between classifications
  }

  processFrame(audioAssessment, noiseFloor) {
    this.frameCount++;

    if (this.cooldownFrames > 0) {
      this.cooldownFrames--;
    }

    if (!audioAssessment || !noiseFloor || !noiseFloor.established) return null;

    const { isAnomaly, peakFreq, centroid, hnr, formantMatch, formantClarity, rmsDb, f1, f2, f3 } = audioAssessment;

    if (isAnomaly) {
      if (!this.currentAnomaly) {
        // Start of new anomaly
        this.currentAnomaly = {
          startFrame: this.frameCount,
          peakFreqs: [peakFreq],
          centroids: [centroid],
          hnrs: [hnr],
          formantClarities: [formantClarity],
          rmsValues: [rmsDb],
          f1s: [f1],
          f2s: [f2],
          f3s: [f3],
          hasVoicePattern: formantMatch
        };
        this.anomalyFrames = 1;
      } else {
        // Continue existing anomaly
        this.anomalyFrames++;
        this.currentAnomaly.peakFreqs.push(peakFreq);
        this.currentAnomaly.centroids.push(centroid);
        this.currentAnomaly.hnrs.push(hnr);
        this.currentAnomaly.formantClarities.push(formantClarity);
        this.currentAnomaly.rmsValues.push(rmsDb);
        this.currentAnomaly.f1s.push(f1);
        this.currentAnomaly.f2s.push(f2);
        this.currentAnomaly.f3s.push(f3);
        if (formantMatch) this.currentAnomaly.hasVoicePattern = true;
      }
    } else if (this.currentAnomaly) {
      // End of anomaly — classify it
      const classification = this._classifyAnomaly(this.currentAnomaly, noiseFloor);
      this.currentAnomaly = null;
      this.anomalyFrames = 0;

      if (classification && this.cooldownFrames <= 0) {
        if (this.classifications.length < this.maxClassifications) {
          this.classifications.push(classification);
        }
        this.cooldownFrames = this.cooldownTarget;
        return classification;
      }
    }

    return null;
  }

  _classifyAnomaly(anomaly, noiseFloor) {
    const duration = (this.frameCount - anomaly.startFrame) / 30; // seconds
    if (duration < 0.1) return null; // Too short, likely noise

    // Compute averages
    const avgCentroid = this._mean(anomaly.centroids);
    const avgHNR = this._mean(anomaly.hnrs);
    const maxFormantClarity = Math.max(...anomaly.formantClarities);
    const avgRMS = this._mean(anomaly.rmsValues);
    const snr = avgRMS - noiseFloor.rmsDb;
    const avgF1 = this._mean(anomaly.f1s.filter(f => f > 0));
    const avgF2 = this._mean(anomaly.f2s.filter(f => f > 0));
    const avgF3 = this._mean(anomaly.f3s.filter(f => f > 0));

    let evpClass = null;
    let confidence = 0;

    // Class A: Clear, unmistakable voice-like pattern
    const tA = this.thresholds.classA;
    if (avgCentroid >= tA.centroidMin && avgCentroid <= tA.centroidMax &&
        avgHNR >= tA.hnrMin &&
        maxFormantClarity >= tA.formantClarity &&
        snr >= tA.snrMin &&
        duration >= tA.durationMin && duration <= tA.durationMax) {
      evpClass = 'A';
      confidence = Math.min(95, 50 + avgHNR + maxFormantClarity * 10 + Math.min(snr, 30));
    }
    // Class B: Moderate, some interpretation needed
    else {
      const tB = this.thresholds.classB;
      if (avgCentroid >= tB.centroidMin && avgCentroid <= tB.centroidMax &&
          avgHNR >= tB.hnrMin &&
          maxFormantClarity >= tB.formantClarity &&
          snr >= tB.snrMin) {
        evpClass = 'B';
        confidence = Math.min(70, 30 + avgHNR + maxFormantClarity * 5 + Math.min(snr, 20));
      }
      // Class C: Faint, may be pareidolia
      else {
        const tC = this.thresholds.classC;
        if (avgCentroid >= tC.centroidMin && avgCentroid <= tC.centroidMax &&
            snr >= tC.snrMin) {
          evpClass = 'C';
          confidence = Math.min(50, 15 + Math.min(snr, 15));
        }
      }
    }

    if (!evpClass) return null;

    return {
      class: evpClass,
      confidence: Math.round(confidence),
      timestamp: anomaly.startFrame / 30,
      duration: Math.round(duration * 100) / 100,
      spectralCentroid: Math.round(avgCentroid),
      hnr: Math.round(avgHNR * 10) / 10,
      snr: Math.round(snr * 10) / 10,
      formantClarity: maxFormantClarity,
      hasVoicePattern: anomaly.hasVoicePattern,
      formants: {
        f1: Math.round(avgF1),
        f2: Math.round(avgF2),
        f3: Math.round(avgF3)
      },
      pareidoliaWarning: evpClass === 'C' || confidence < 40,
      frame: anomaly.startFrame
    };
  }

  _mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  getClassification() {
    if (this.classifications.length === 0) return null;
    return this.classifications[this.classifications.length - 1];
  }

  getAllClassifications() {
    return [...this.classifications];
  }

  getFormantAnalysis() {
    if (this.classifications.length === 0) return null;
    const last = this.classifications[this.classifications.length - 1];
    return last.formants;
  }

  getSummary() {
    const classA = this.classifications.filter(c => c.class === 'A').length;
    const classB = this.classifications.filter(c => c.class === 'B').length;
    const classC = this.classifications.filter(c => c.class === 'C').length;

    return {
      total: this.classifications.length,
      classA: classA,
      classB: classB,
      classC: classC,
      highestClass: classA > 0 ? 'A' : classB > 0 ? 'B' : classC > 0 ? 'C' : null,
      avgConfidence: this.classifications.length > 0
        ? Math.round(this._mean(this.classifications.map(c => c.confidence)))
        : 0
    };
  }

  fullAnalysis() {
    return {
      classifications: [...this.classifications],
      summary: this.getSummary(),
      totalFrames: this.frameCount,
      scienceNote: 'Nees & Phillips (2015) demonstrated auditory pareidolia — the brain\'s tendency to perceive speech in random noise — affects EVP interpretation. Class C detections are particularly susceptible.'
    };
  }

  clearAll() {
    this.classifications = [];
    this.currentAnomaly = null;
    this.anomalyFrames = 0;
    this.cooldownFrames = 0;
    this.frameCount = 0;
  }
}

window.EVPClassifier = EVPClassifier;
