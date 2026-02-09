/**
 * SessionRecorder — Audio recording, playback, reverse, and export
 * Uses MediaRecorder API for capture and AudioBuffer for reverse playback
 */
class SessionRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioContext = null;
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.isRecording = false;
    this.startTime = 0;
    this.duration = 0;

    // Playback
    this.playbackSource = null;
    this.isPlaying = false;
    this.playbackMode = 'forward'; // 'forward' or 'reverse'
  }

  async startRecording(stream) {
    if (this.isRecording) return false;

    try {
      // Determine supported MIME type
      const mimeType = this._getSupportedMimeType();
      const options = mimeType ? { mimeType: mimeType } : {};

      this.mediaRecorder = new MediaRecorder(stream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.recordedBlob = new Blob(this.recordedChunks, {
          type: mimeType || 'audio/webm'
        });
        this.duration = (Date.now() - this.startTime) / 1000;
        this.isRecording = false;
      };

      this.mediaRecorder.start(1000); // Record in 1s chunks
      this.startTime = Date.now();
      this.isRecording = true;
      return true;
    } catch (err) {
      console.error('SessionRecorder: Failed to start recording', err);
      return false;
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    try {
      this.mediaRecorder.stop();
    } catch (e) {
      this.isRecording = false;
    }
  }

  _getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return null;
  }

  getRecordedBlob() {
    return this.recordedBlob;
  }

  async playForward() {
    if (!this.recordedBlob) return;
    this.stopPlayback();

    try {
      this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await this.recordedBlob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.playbackSource = this.audioContext.createBufferSource();
      this.playbackSource.buffer = audioBuffer;
      this.playbackSource.connect(this.audioContext.destination);
      this.playbackSource.onended = () => { this.isPlaying = false; };

      this.playbackSource.start();
      this.isPlaying = true;
      this.playbackMode = 'forward';
    } catch (err) {
      console.error('SessionRecorder: Forward playback failed', err);
    }
  }

  async playReverse() {
    if (!this.recordedBlob) return;
    this.stopPlayback();

    try {
      this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await this.recordedBlob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Create reversed buffer
      const reversedBuffer = this.audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const inputData = audioBuffer.getChannelData(channel);
        const outputData = reversedBuffer.getChannelData(channel);
        for (let i = 0; i < inputData.length; i++) {
          outputData[i] = inputData[inputData.length - 1 - i];
        }
      }

      this.playbackSource = this.audioContext.createBufferSource();
      this.playbackSource.buffer = reversedBuffer;
      this.playbackSource.connect(this.audioContext.destination);
      this.playbackSource.onended = () => { this.isPlaying = false; };

      this.playbackSource.start();
      this.isPlaying = true;
      this.playbackMode = 'reverse';
    } catch (err) {
      console.error('SessionRecorder: Reverse playback failed', err);
    }
  }

  stopPlayback() {
    if (this.playbackSource) {
      try { this.playbackSource.stop(); } catch (e) { /* ignore */ }
      this.playbackSource = null;
    }
    this.isPlaying = false;
  }

  downloadRecording() {
    if (!this.recordedBlob) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `evp-mini-recording-${timestamp}.webm`;

    const url = URL.createObjectURL(this.recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getRecordingState() {
    return {
      isRecording: this.isRecording,
      hasRecording: this.recordedBlob !== null,
      duration: this.isRecording ? (Date.now() - this.startTime) / 1000 : this.duration,
      isPlaying: this.isPlaying,
      playbackMode: this.playbackMode
    };
  }

  clearAll() {
    this.stopPlayback();
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.duration = 0;
  }

  destroy() {
    this.stopPlayback();
    this.stopRecording();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
  }
}

window.SessionRecorder = SessionRecorder;
