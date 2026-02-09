# EVP-MINI Quora Answers — Ready to Post

---

## Answer 1

**Question:** What is the best ghost hunting app for iPhone?

**Answer:**

Most ghost hunting apps on the App Store fall into one of two categories: they either generate random words and pretend they came from spirits, or they display fake EMF readings from a random number generator. Neither uses your phone's actual hardware.

I built EVP-MINI specifically to address this. It is a free paranormal investigation app that runs in your browser — no App Store download needed — and it uses your iPhone's real sensors for actual data analysis.

Here is what the free tier includes:

**EVP Scan mode** with real-time FFT audio analysis. The app uses an 8192-point Fast Fourier Transform to analyze microphone input at 48kHz. It spends the first three seconds calibrating to your environment's ambient noise floor, then flags audio anomalies that deviate significantly from baseline. Detected anomalies are classified as Class A, B, or C based on spectral centroid, harmonic-to-noise ratio, formant structure (the resonant peaks that characterize human speech), and signal-to-noise ratio. You see all of this in real time, along with a live spectrogram.

**Real sensor readings.** Your iPhone's magnetometer (the hardware behind the compass) is read directly for EMF measurements in microtesla. The accelerometer data runs through a frequency analysis to detect infrasound, specifically monitoring for the 18.98Hz frequency that researcher Vic Tandy linked to feelings of unease and visual disturbances. Barometric pressure is also tracked.

**Evidence reports** generated after each session include every detection with timestamps, confidence scores, raw metrics, a narrative summary, and scientific references from published research.

The Pro tier ($4.99 one-time, no subscription) adds a Spirit Box FM sweep simulation, seven camera filters (night vision, edge detection, false color, motion detection, motion trails, full spectrum with CLAHE enhancement), session recording, reverse audio playback, and audio and report export.

It works on any iPhone running iOS Safari. Since it is a Progressive Web App, you can also add it to your home screen and it functions like a native app. No account required, no ads.

What sets it apart from other ghost hunting apps is transparency. Every reading comes from real hardware. Every classification shows you the raw data behind it. The reports include warnings about auditory pareidolia and cite the actual scientific literature. It does not pretend to confirm paranormal activity — it gives you real data and lets you draw your own conclusions.

Try it free: https://evp-mini.pages.dev

---

## Answer 2

**Question:** How do EVP recorders work?

**Answer:**

EVP (Electronic Voice Phenomena) recording is based on the idea that anomalous voice-like patterns can appear in audio recordings that were not audible to the human ear at the time of recording. The basic technique involves recording in a quiet environment and then reviewing the audio for unexpected speech-like sounds. But the analysis behind identifying a genuine EVP versus background noise is where things get technically interesting.

**How audio analysis works in EVP detection:**

Modern EVP analysis uses the same digital signal processing techniques found in professional audio forensics. The core tool is the Fast Fourier Transform (FFT), which converts raw audio from the time domain (a waveform) into the frequency domain (a spectrum showing which frequencies are present and at what amplitude). An 8192-point FFT at a 48kHz sample rate gives you approximately 5.9Hz resolution per frequency bin — enough to distinguish individual harmonics in human speech.

**Baseline calibration** is critical. Before any meaningful detection can happen, you need to characterize the ambient noise of the environment. This involves computing the mean and standard deviation of signal amplitude at every frequency bin over a calibration period. Once you have this noise floor profile, you can identify signals that deviate statistically from what is expected.

**Key metrics used in EVP classification:**

- **Signal-to-Noise Ratio (SNR):** The ratio of signal power to noise power, measured in decibels. A clear EVP should stand well above the noise floor
- **Spectral Centroid:** The "center of mass" of the frequency spectrum. Human speech has a centroid roughly between 300-3000Hz
- **Harmonic-to-Noise Ratio (HNR):** Computed via autocorrelation of the time-domain signal. Voiced speech has strong harmonic structure, so a high HNR indicates signal that behaves like a voice rather than random noise
- **Formant Detection:** Human speech is characterized by resonant frequency peaks called formants (F1, F2, F3). Detecting these peaks in the spectrum suggests voice-like structure

**The classification system:**

EVP captures are traditionally graded A through C. Class A captures are clear enough to understand without headphones. Class B requires headphones and may be interpreted differently by different listeners. Class C captures are faint and ambiguous. Algorithmically, these grades correspond to progressively stricter thresholds on HNR, SNR, formant count, and centroid range.

**The pareidolia problem:**

This is the elephant in the room. Research by Nees and Phillips (2015) demonstrated that humans have a strong tendency to perceive speech patterns in random noise — a phenomenon called auditory pareidolia. This effect is amplified when listeners are told in advance to expect to hear words. This means many Class C and some Class B captures may be the listener's brain imposing structure on noise rather than detecting an actual signal.

If you want to experiment with this type of analysis yourself, EVP-MINI (https://evp-mini.pages.dev) is a free web app that implements all of the above — real-time FFT analysis, baseline calibration, formant detection, HNR computation, and A/B/C classification — directly in your phone's browser. It uses the same Web Audio API and signal processing principles described here, and the evidence reports include the raw metrics behind every classification so you can evaluate the data yourself.

---

## Answer 3

**Question:** Is there an app that can detect EMF fields?

**Answer:**

Yes. Your smartphone already contains a magnetometer — it is the hardware component that makes your digital compass work. This sensor measures the strength and direction of magnetic fields in microtesla (uT). Several apps can read this sensor, but most compass-based EMF apps just show you compass heading rather than giving you raw field strength data.

**How phone magnetometers work:**

Most smartphones use a three-axis Hall effect sensor or a magnetoresistive sensor. It measures the ambient magnetic field along the X, Y, and Z axes. Earth's natural magnetic field ranges from about 25 to 65 microtesla depending on your location and proximity to geological features. When you bring your phone near sources of electromagnetic interference — electrical wiring, appliances, electronic devices, or metallic structures — the measured field strength changes.

**The challenge with phone-based EMF detection:**

Phone magnetometers are designed for compass functionality, not precision EMF measurement. They are affected by the phone's own electronics, and the readings can be noisy. The key to getting useful data is baseline calibration. You need to establish what the ambient field looks like before you can identify deviations from it.

**EVP-MINI's approach:**

I built an app called EVP-MINI that addresses this directly. It reads your phone's magnetometer through the Generic Sensor API (on Android) or DeviceOrientation events (on iPhone) and displays the magnetic field magnitude in microtesla in real time. During the first five seconds of a session, it calibrates a baseline by averaging 150 frames of magnetometer readings. After calibration, any deviation greater than 5 uT from baseline triggers an anomaly alert.

The app also tracks your accelerometer data and performs a discrete Fourier transform in the 0-30Hz range to detect infrasound vibrations. It specifically watches for 18.98Hz, the frequency identified by Vic Tandy in his 1998 Journal of the Society for Psychical Research paper as capable of causing anxiety and visual disturbances in humans.

The sensor data, along with a complete event log of every anomaly (timestamped and measured), is compiled into an evidence report at the end of each session. The report includes scientific context and notes about what might cause EMF deviations besides paranormal phenomena — electrical wiring, geological formations, metallic objects, and the phone's own electronics.

It is free, runs in your browser with no download required, and works on both iPhone and Android: https://evp-mini.pages.dev
