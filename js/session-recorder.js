/**
 * SessionRecorder — Audio recording, reverse playback, and export
 * Uses MediaRecorder API for capture and AudioBuffer manipulation for reverse playback.
 * Supports audio/webm;codecs=opus with fallbacks to audio/webm, audio/ogg, audio/mp4.
 */
class SessionRecorder {
  constructor() {
    // MediaRecorder reference
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordedBlob = null;

    // AudioContext for reverse playback
    this.audioContext = null;

    // State tracking
    this._isRecording = false;
    this._isPlaying = false;
    this.startTime = 0;
    this.duration = 0;
    this.playbackMode = 'forward'; // 'forward' or 'reverse'

    // Current playback source node (for stopping)
    this.playbackSource = null;

    // MIME type determined during init
    this._mimeType = null;

    // Promise resolve for stopRecording
    this._stopResolve = null;
  }

  /**
   * Initialize the recorder with a MediaStream.
   * Determines the best supported MIME type and sets up MediaRecorder handlers.
   * @param {MediaStream} stream - microphone stream from getUserMedia
   * @returns {boolean} true if initialization succeeded
   */
  init(stream) {
    if (!stream) {
      console.error('SessionRecorder: No stream provided to init()');
      return false;
    }

    try {
      this._mimeType = this._getSupportedMimeType();
      var options = this._mimeType ? { mimeType: this._mimeType } : {};

      this.mediaRecorder = new MediaRecorder(stream, options);

      this.mediaRecorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      }.bind(this);

      this.mediaRecorder.onstop = function() {
        this.recordedBlob = new Blob(this.recordedChunks, {
          type: this._mimeType || 'audio/webm'
        });
        this.duration = (Date.now() - this.startTime) / 1000;
        this._isRecording = false;

        // Resolve any pending stop promise
        if (this._stopResolve) {
          this._stopResolve(this.recordedBlob);
          this._stopResolve = null;
        }
      }.bind(this);

      this.mediaRecorder.onerror = function(e) {
        console.error('SessionRecorder: MediaRecorder error', e);
        this._isRecording = false;
        if (this._stopResolve) {
          this._stopResolve(null);
          this._stopResolve = null;
        }
      }.bind(this);

      return true;
    } catch (err) {
      console.error('SessionRecorder: Failed to initialize MediaRecorder', err);
      return false;
    }
  }

  /**
   * Start recording audio with 1000ms timeslice.
   * Clears previous chunks.
   * @param {MediaStream} [stream] - optional stream; if provided, calls init() first
   * @returns {boolean} true if recording started
   */
  startRecording(stream) {
    // If stream provided, initialize first (backward-compatible with old API)
    if (stream && (!this.mediaRecorder || this.mediaRecorder.stream !== stream)) {
      var initResult = this.init(stream);
      if (!initResult) return false;
    }

    if (this._isRecording) return false;
    if (!this.mediaRecorder) {
      console.error('SessionRecorder: Not initialized. Call init(stream) first.');
      return false;
    }

    try {
      this.recordedChunks = [];
      this.recordedBlob = null;
      this.mediaRecorder.start(1000); // Record in 1-second chunks
      this.startTime = Date.now();
      this._isRecording = true;
      return true;
    } catch (err) {
      console.error('SessionRecorder: Failed to start recording', err);
      this._isRecording = false;
      return false;
    }
  }

  /**
   * Stop recording and return a Promise that resolves with the recorded Blob.
   * @returns {Promise<Blob|null>}
   */
  stopRecording() {
    var self = this;

    if (!this._isRecording || !this.mediaRecorder) {
      return Promise.resolve(this.recordedBlob);
    }

    return new Promise(function(resolve) {
      self._stopResolve = resolve;
      try {
        self.mediaRecorder.stop();
      } catch (e) {
        self._isRecording = false;
        self._stopResolve = null;
        resolve(self.recordedBlob);
      }
    });
  }

  /**
   * Play the recorded audio in reverse.
   * Decodes the blob, reverses sample data per channel, and plays via AudioBufferSourceNode.
   * @returns {Promise<void>} resolves when reverse playback completes
   */
  async playReverse() {
    if (!this.recordedBlob) {
      console.warn('SessionRecorder: No recording available for reverse playback');
      return;
    }

    this.stopPlayback();

    try {
      this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Read blob as ArrayBuffer
      var arrayBuffer = await this.recordedBlob.arrayBuffer();

      // Decode to AudioBuffer
      var audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Create a new AudioBuffer with the same properties
      var reversedBuffer = this.audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      // For each channel, copy samples in reverse order
      for (var channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        var inputData = audioBuffer.getChannelData(channel);
        var outputData = reversedBuffer.getChannelData(channel);
        var len = inputData.length;
        for (var i = 0; i < len; i++) {
          outputData[i] = inputData[len - 1 - i];
        }
      }

      // Create source node and play
      var self = this;
      return new Promise(function(resolve) {
        self.playbackSource = self.audioContext.createBufferSource();
        self.playbackSource.buffer = reversedBuffer;
        self.playbackSource.connect(self.audioContext.destination);

        self.playbackSource.onended = function() {
          self._isPlaying = false;
          self.playbackSource = null;
          resolve();
        };

        self.playbackSource.start();
        self._isPlaying = true;
        self.playbackMode = 'reverse';
      });
    } catch (err) {
      console.error('SessionRecorder: Reverse playback failed', err);
      this._isPlaying = false;
    }
  }

  /**
   * Play the recorded audio forward.
   * @returns {Promise<void>} resolves when playback completes
   */
  async playForward() {
    if (!this.recordedBlob) {
      console.warn('SessionRecorder: No recording available for forward playback');
      return;
    }

    this.stopPlayback();

    try {
      this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      var arrayBuffer = await this.recordedBlob.arrayBuffer();
      var audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      var self = this;
      return new Promise(function(resolve) {
        self.playbackSource = self.audioContext.createBufferSource();
        self.playbackSource.buffer = audioBuffer;
        self.playbackSource.connect(self.audioContext.destination);

        self.playbackSource.onended = function() {
          self._isPlaying = false;
          self.playbackSource = null;
          resolve();
        };

        self.playbackSource.start();
        self._isPlaying = true;
        self.playbackMode = 'forward';
      });
    } catch (err) {
      console.error('SessionRecorder: Forward playback failed', err);
      this._isPlaying = false;
    }
  }

  /**
   * Stop any current playback (forward or reverse).
   */
  stopPlayback() {
    if (this.playbackSource) {
      try {
        this.playbackSource.stop();
      } catch (e) {
        // Already stopped or never started
      }
      this.playbackSource = null;
    }
    this._isPlaying = false;
  }

  /**
   * Return the recorded Blob, or null if no recording exists.
   * @returns {Blob|null}
   */
  getBlob() {
    return this.recordedBlob;
  }

  /**
   * Backward-compatible alias for getBlob.
   * @returns {Blob|null}
   */
  getRecordedBlob() {
    return this.recordedBlob;
  }

  /**
   * Export the recording as a downloadable file.
   * @param {string} [filename] - optional filename; defaults to "evp-session-{timestamp}.webm"
   */
  exportDownload(filename) {
    if (!this.recordedBlob) {
      console.warn('SessionRecorder: No recording to export');
      return;
    }

    if (!filename) {
      var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      filename = 'evp-session-' + timestamp + '.webm';
    }

    var url = URL.createObjectURL(this.recordedBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke the object URL after a brief delay to ensure download initiates
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * Backward-compatible alias for exportDownload.
   */
  downloadRecording() {
    var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.exportDownload('evp-mini-recording-' + timestamp + '.webm');
  }

  /**
   * Return approximate recording duration in seconds.
   * If currently recording, returns elapsed time since start.
   * @returns {number}
   */
  getDuration() {
    if (this._isRecording) {
      return (Date.now() - this.startTime) / 1000;
    }
    return this.duration;
  }

  /**
   * Return whether the recorder is currently recording.
   * @returns {boolean}
   */
  isRecording() {
    return this._isRecording;
  }

  /**
   * Return whether audio is currently playing back.
   * @returns {boolean}
   */
  isPlaying() {
    return this._isPlaying;
  }

  /**
   * Return a state snapshot for the UI layer.
   * Backward-compatible with the old getRecordingState() API.
   * @returns {Object}
   */
  getRecordingState() {
    return {
      isRecording: this._isRecording,
      hasRecording: this.recordedBlob !== null,
      duration: this._isRecording ? (Date.now() - this.startTime) / 1000 : this.duration,
      isPlaying: this._isPlaying,
      playbackMode: this.playbackMode
    };
  }

  /**
   * Clear all recorded data without destroying the recorder.
   */
  clearAll() {
    this.stopPlayback();
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.duration = 0;
  }

  /**
   * Stop recording if active, stop playback if active, and release resources.
   */
  destroy() {
    // Stop recording if active
    if (this._isRecording && this.mediaRecorder) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        // Ignore
      }
      this._isRecording = false;
    }

    // Stop playback if active
    this.stopPlayback();

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(function() {});
    }
    this.audioContext = null;

    // Clear chunks and blob
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.mediaRecorder = null;
    this.duration = 0;
    this._stopResolve = null;
  }

  /**
   * Determine the best supported MIME type for MediaRecorder.
   * Priority: audio/webm;codecs=opus > audio/webm > audio/ogg;codecs=opus > audio/mp4
   * @returns {string|null}
   */
  _getSupportedMimeType() {
    var types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    for (var i = 0; i < types.length; i++) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(types[i])) {
        return types[i];
      }
    }
    return null;
  }
}

window.SessionRecorder = SessionRecorder;
