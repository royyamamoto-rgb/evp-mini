/**
 * WordDetector — AI phoneme matching for EVP word detection
 * Compares real-time formant analysis against common EVP word signatures
 *
 * Uses F1/F2 formant frequency ranges characteristic of vowel sounds
 * in common "spirit communication" words. Matches are probabilistic
 * and should be interpreted with scientific skepticism.
 *
 * Reference: Peterson & Barney (1952) vowel formant data
 */
class WordDetector {
  constructor() {
    this.enabled = true;
    this.detections = [];
    this.maxDetections = 100;
    this.lastDetectionTime = 0;
    this.cooldownMs = 2000; // Minimum time between detections
    this.confidenceThreshold = 55; // Minimum confidence to report

    // Track formant history for multi-frame matching
    this._formantHistory = [];
    this._historyMaxFrames = 20; // ~0.7s at 30fps
    this._currentSegment = null;
    this._segmentFrames = 0;

    // Phoneme library: F1/F2 ranges in Hz for key vowel sounds
    // Based on Peterson & Barney (1952) average formant values
    this._phonemeLib = {
      'AH': { f1: [600, 850], f2: [1000, 1400] },  // "ah" as in father
      'EE': { f1: [250, 400], f2: [2100, 2800] },   // "ee" as in see
      'EH': { f1: [500, 700], f2: [1700, 2100] },   // "eh" as in bed
      'IH': { f1: [350, 500], f2: [1800, 2300] },   // "ih" as in bit
      'OH': { f1: [400, 600], f2: [700, 1100] },     // "oh" as in go
      'OO': { f1: [280, 400], f2: [800, 1200] },     // "oo" as in boot
      'UH': { f1: [500, 700], f2: [1000, 1400] },    // "uh" as in but
      'AE': { f1: [650, 850], f2: [1600, 2000] },    // "ae" as in cat
      'ER': { f1: [450, 600], f2: [1200, 1600] },    // "er" as in bird
    };

    // Word patterns: sequences of phonemes with F1/F2 expectations
    // Each word has primary vowel sound(s) to match
    this._wordLibrary = [
      { word: 'YES',   phonemes: ['EH'],        weight: 1.0, minDuration: 8 },
      { word: 'NO',    phonemes: ['OH'],         weight: 1.0, minDuration: 6 },
      { word: 'HELP',  phonemes: ['EH'],         weight: 1.2, minDuration: 8 },
      { word: 'HERE',  phonemes: ['IH', 'ER'],   weight: 1.1, minDuration: 10 },
      { word: 'LEAVE', phonemes: ['EE'],         weight: 1.0, minDuration: 8 },
      { word: 'GO',    phonemes: ['OH'],         weight: 0.9, minDuration: 6 },
      { word: 'STOP',  phonemes: ['AH'],         weight: 1.1, minDuration: 8 },
      { word: 'COME',  phonemes: ['UH'],         weight: 1.0, minDuration: 8 },
      { word: 'NAME',  phonemes: ['AE'],         weight: 1.0, minDuration: 8 },
      { word: 'HELLO', phonemes: ['EH', 'OH'],   weight: 1.2, minDuration: 12 },
      { word: 'DEATH', phonemes: ['EH'],         weight: 1.3, minDuration: 8 },
      { word: 'COLD',  phonemes: ['OH'],         weight: 1.0, minDuration: 8 },
      { word: 'LIGHT', phonemes: ['AH', 'IH'],   weight: 1.0, minDuration: 8 },
      { word: 'DARK',  phonemes: ['AH'],         weight: 1.1, minDuration: 8 },
      { word: 'FEAR',  phonemes: ['IH', 'ER'],   weight: 1.2, minDuration: 8 },
      { word: 'RUN',   phonemes: ['UH'],         weight: 1.0, minDuration: 6 },
      { word: 'STAY',  phonemes: ['AE', 'EE'],   weight: 1.0, minDuration: 8 },
      { word: 'WHO',   phonemes: ['OO'],         weight: 1.0, minDuration: 6 },
      { word: 'WHY',   phonemes: ['AH', 'EE'],   weight: 1.0, minDuration: 8 },
      { word: 'BEHIND',phonemes: ['EE', 'AH', 'IH'], weight: 1.3, minDuration: 14 },
    ];
  }

  // Process one frame of audio data
  // formantData: { hasVoicePattern, f1, f2, f3, formantCount }
  // audioAssess: { isAnomaly, centroid, hnr, rmsPercent }
  processFrame(formantData, audioAssess) {
    if (!this.enabled) return null;
    if (!formantData || !audioAssess) return null;

    // Only analyze during voice-like anomalies
    if (!audioAssess.isAnomaly && audioAssess.rmsPercent < 5) {
      this._endSegment();
      return null;
    }

    const f1 = formantData.f1 || 0;
    const f2 = formantData.f2 || 0;

    if (f1 === 0 && f2 === 0) {
      this._endSegment();
      return null;
    }

    // Track this frame's formants
    this._formantHistory.push({ f1, f2, time: performance.now() });
    if (this._formantHistory.length > this._historyMaxFrames) {
      this._formantHistory.shift();
    }

    // Build/extend current segment
    if (!this._currentSegment) {
      this._currentSegment = { phonemeMatches: {}, frames: 0, startTime: performance.now() };
    }
    this._currentSegment.frames++;

    // Match current formants against phonemes
    for (const [name, ranges] of Object.entries(this._phonemeLib)) {
      if (f1 >= ranges.f1[0] && f1 <= ranges.f1[1] &&
          f2 >= ranges.f2[0] && f2 <= ranges.f2[1]) {
        if (!this._currentSegment.phonemeMatches[name]) {
          this._currentSegment.phonemeMatches[name] = 0;
        }
        this._currentSegment.phonemeMatches[name]++;
      }
    }

    return null; // Detection happens in _endSegment
  }

  _endSegment() {
    if (!this._currentSegment || this._currentSegment.frames < 4) {
      this._currentSegment = null;
      return;
    }

    const now = performance.now();
    if (now - this.lastDetectionTime < this.cooldownMs) {
      this._currentSegment = null;
      return;
    }

    const seg = this._currentSegment;
    this._currentSegment = null;

    // Score each word against observed phonemes
    let bestWord = null;
    let bestConfidence = 0;

    for (const entry of this._wordLibrary) {
      if (seg.frames < entry.minDuration) continue;

      let matchScore = 0;
      let totalRequired = entry.phonemes.length;

      for (const phoneme of entry.phonemes) {
        const count = seg.phonemeMatches[phoneme] || 0;
        if (count > 0) {
          // More frames matching = higher score
          matchScore += Math.min(1, count / 4);
        }
      }

      // Base confidence from phoneme matching
      let confidence = (matchScore / totalRequired) * 70;

      // Bonus for longer segments (more data = more reliable)
      confidence += Math.min(15, seg.frames * 0.5);

      // Apply word weight
      confidence *= entry.weight;

      // Bonus for multiple phoneme matches in multi-phoneme words
      if (totalRequired > 1 && matchScore > 1) {
        confidence += 10;
      }

      // Cap at 95%
      confidence = Math.min(95, confidence);

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestWord = entry.word;
      }
    }

    if (bestWord && bestConfidence >= this.confidenceThreshold) {
      const detection = {
        word: bestWord,
        confidence: Math.round(bestConfidence),
        time: now,
        duration: seg.frames,
        phonemes: Object.keys(seg.phonemeMatches)
      };

      this.detections.push(detection);
      if (this.detections.length > this.maxDetections) {
        this.detections.shift();
      }

      this.lastDetectionTime = now;
      return detection;
    }

    return null;
  }

  // Force check at end of segment (call when anomaly ends)
  forceCheck() {
    const result = this._endSegment();
    this._formantHistory = [];
    return result;
  }

  getDetections() {
    return [...this.detections];
  }

  getLastDetection() {
    return this.detections.length > 0 ? this.detections[this.detections.length - 1] : null;
  }

  fullAnalysis() {
    const wordCounts = {};
    for (const d of this.detections) {
      wordCounts[d.word] = (wordCounts[d.word] || 0) + 1;
    }

    return {
      totalDetections: this.detections.length,
      detections: [...this.detections],
      wordFrequency: wordCounts,
      uniqueWords: Object.keys(wordCounts).length
    };
  }

  clearAll() {
    this.detections = [];
    this._formantHistory = [];
    this._currentSegment = null;
    this.lastDetectionTime = 0;
  }
}

window.WordDetector = WordDetector;
