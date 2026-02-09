# EVP-MINI Reddit Posts — Ready to Post

---

## Post 1: r/Ghosts

**Title:** Built a free EVP analysis app that actually classifies captures as A/B/C — looking for investigators to test it

**Body:**

Hey everyone. I've been working on a side project for the past few months and wanted to share it with this community.

I built EVP-MINI — a web app that does real-time audio analysis to detect and classify EVP captures using the same signal processing techniques used in professional audio forensics. It runs in your phone's browser, no app store download needed.

Here's what it actually does under the hood:

- **FFT audio analysis** — Uses an 8192-point FFT at 48kHz sample rate (~5.9Hz per frequency bin) to break down audio in real time
- **Automatic baseline calibration** — The app spends the first 3 seconds learning the ambient noise floor of your environment. It computes per-bin mean and standard deviation, then flags anything that deviates more than 2 standard deviations as anomalous
- **Formant detection** — Scans three frequency ranges (F1: 200-900Hz, F2: 500-3000Hz, F3: 2000-3500Hz) for spectral peaks that match human vocal patterns. Uses parabolic interpolation for sub-bin frequency accuracy
- **A/B/C classification** — Class A requires a spectral centroid between 300-3000Hz, HNR above 15dB, 2+ formants, SNR above 20dB, and duration between 0.5-3 seconds. Class B needs HNR 8-15dB with 1+ formant and SNR above 10dB. Class C catches fainter anomalies in the voice range with SNR above 5dB
- **Live spectrogram** with color-mapped frequency visualization
- **Evidence report** — After your session, you get a full breakdown of every detection with timestamps, confidence scores, formant frequencies, and scientific context

The free version gives you the full EVP Scan mode including the classifier, spectrogram, sensor readings, and evidence report. Pro ($4.99 one-time, not a subscription) adds spirit box FM sweep, 7 camera filters (night vision, edge detection, false color, motion detection, motion trails, full spectrum with CLAHE enhancement), session recording, reverse playback, and audio export.

It also reads your phone's actual magnetometer for EMF detection and accelerometer for infrasound — including flagging Tandy's 18.98Hz fear frequency.

I should be transparent: the app includes pareidolia warnings on low-confidence detections, because auditory pareidolia is real (Nees & Phillips, 2015). The evidence reports include full scientific caveats. I wanted to build something that takes the analysis seriously, not just flash scary numbers on screen.

Would really love feedback from people who actually investigate. What am I missing? What would make this more useful in the field?

https://evp-mini.pages.dev

---

## Post 2: r/Paranormal

**Title:** I made a ghost hunting app with real EMF detection and night vision — free to use, no ads

**Body:**

I want to show you all something I built. EVP-MINI is a paranormal investigation app that runs in your phone's web browser. No download, no ads, no account required.

What makes this different from most ghost hunting apps: it uses your phone's actual hardware sensors. Not fake readings. Not random number generators. Real data.

**Sensors it accesses:**

- **Magnetometer (EMF)** — Your phone has an actual magnetometer used for the compass. EVP-MINI reads it directly and displays the field strength in microtesla. It calibrates a baseline over 5 seconds, then alerts you when there's a deviation greater than 5 uT from that baseline. On Android it uses the Generic Sensor API for raw magnetometer values. On iPhone it works through DeviceOrientation events
- **Accelerometer (Infrasound)** — The app performs a discrete Fourier transform on your accelerometer data to detect low-frequency vibrations. It specifically watches for 18.98Hz — the frequency Vic Tandy identified in his 1998 paper as causing feelings of unease, anxiety, and visual disturbances. If your phone picks up vibrations near that frequency, you get an alert
- **Barometric pressure** — Monitors for sudden pressure changes, which some investigators track as environmental indicators

**Camera filters (Pro):**

Seven real-time visual processing modes. Night vision amplifies the green channel. Edge detection uses Sobel operators to highlight outlines. False color maps brightness to a thermal-style palette. Motion detection highlights frame-to-frame differences. Motion trails accumulate movement over time. Full spectrum mode applies CLAHE (Contrast Limited Adaptive Histogram Equalization) to reveal detail hidden in shadows and highlights.

**Audio analysis:**

Real-time FFT with A/B/C EVP classification. The classifier looks at harmonic-to-noise ratio, spectral centroid, formant structure, and signal-to-noise ratio against the calibrated noise floor.

**Evidence reports:**

Every session generates a detailed report with timestamps, classification data, sensor events, and references to published research (Tandy 1998, Nees & Phillips 2015, Baruss 2001, Persinger 1987).

Free version includes EVP Scan mode with full classification and sensors. Pro is $4.99 one-time for everything else.

Works on both iPhone and Android. Just open the link in your browser:

https://evp-mini.pages.dev

I'm one person building this, so I'd love to know what you think. What features would help during an actual investigation?

---

## Post 3: r/GhostHunting

**Title:** New free spirit box + EVP recorder app — includes reverse playback and evidence reports

**Body:**

Hey investigators. Built an app I think you'll find useful and wanted to get it in front of people who actually do fieldwork.

**EVP-MINI** is a browser-based paranormal investigation toolkit. Here's the investigation workflow:

**Step 1: Set up**
Open the app, grant microphone and camera access. The app spends about 3 seconds calibrating — it learns the ambient noise floor and establishes baseline readings for all sensors.

**Step 2: Choose your mode**
- **EVP Scan** (free) — Real-time audio analysis with live spectrogram, RMS level meters, harmonic-to-noise ratio, signal-to-noise ratio, and automatic A/B/C EVP classification
- **Spirit Box** (Pro) — FM sweep simulation cycling through frequencies 87.5-108MHz. Adjustable sweep speed (30-350ms). Choice of white or pink noise background. Adjustable noise and tone levels. Captures audio fragments during the sweep
- **Visual Scan** (Pro) — 7 camera filter modes: normal, night vision, edge detection, false color, motion detection, motion trails, and full spectrum with CLAHE
- **Full Spectrum** (Pro) — Everything running simultaneously. All sensors, audio analysis, spirit box, and camera filters active at once

**Step 3: Investigate**
During the scan you see real-time data: live spectrogram, audio meters (RMS, HNR, SNR), environmental sensors (EMF in microtesla, vibration in m/s2, barometric pressure in hPa), and live indicator chips showing motion percentage, EMF level, and audio level.

When the EVP classifier detects something, it shows the class, confidence, timestamp, and spectral data in real time.

**Step 4: Record and review**
Pro users can record sessions, play audio back in reverse (a standard EVP review technique), and export audio files.

**Step 5: Evidence report**
After stopping, you get a comprehensive evidence report that includes:
- Investigation summary with overall score (0-100) and verdict
- Narrative summary of all findings
- Every EVP classification with formant frequencies, HNR, SNR, confidence, and duration
- Sensor event log (EMF spikes, infrasound detections, fear frequency alerts)
- Visual anomaly data
- Spirit box fragment captures
- Scientific references (Tandy 1998, Nees & Phillips 2015, Baruss 2001, Raudive 1971, Persinger 1987)
- Full disclaimer about limitations

You can export the report as text or JSON.

**Pricing:** EVP Scan mode with classification, sensors, spectrogram, and evidence reports is completely free. Pro is $4.99 one-time (lifetime, no subscription) and adds spirit box, visual filters, recording, reverse playback, and export.

**Works on iPhone and Android** — It's a PWA (Progressive Web App), so no app store needed. Just open the link:

https://evp-mini.pages.dev

I've been using it on investigations myself and iterating. What would make it better for your workflow?

---

## Post 4: r/ParanormalScience

**Title:** Signal processing approach to EVP analysis — built an open tool using Web Audio API

**Body:**

I've been working on an audio analysis tool built specifically for EVP investigation, and I wanted to share it with this community since I think the technical approach might be of interest here.

**EVP-MINI** applies standard digital signal processing techniques to the EVP classification problem. Here's the methodology:

**Audio pipeline:**

The app uses the Web Audio API's AnalyserNode with an 8192-point FFT at the device's native sample rate (typically 48kHz), giving approximately 5.9Hz frequency resolution per bin. Frequency data is read as both byte (0-255 normalized) and float (dB scale) arrays at approximately 30fps via requestAnimationFrame.

**Noise floor calibration:**

During the first 90 frames (~3 seconds), the engine accumulates per-bin linear magnitude sums and squared sums to compute mean and standard deviation for each frequency bin. This establishes a per-bin noise floor profile specific to the current acoustic environment. Post-calibration, any bin exceeding mean + 2 standard deviations is flagged as anomalous.

**Anomaly detection:**

When 5 or more frequency bins in the voice range (200-4000Hz) simultaneously exceed the 2-sigma threshold, the frame is classified as an anomaly. Signal-to-noise ratio is computed as 10*log10(signal_power/noise_power) where signal power comes from anomalous bins and noise power from non-anomalous bins within the voice range.

**Harmonic-to-noise ratio:**

Computed via autocorrelation of the time-domain waveform. The signal is downsampled 4x for performance, then the autocorrelation peak is found in the lag range corresponding to 80-400Hz fundamental frequency (human voice pitch range). Parabolic interpolation refines the peak estimate. HNR = 10*log10(r/(1-r)) where r is the normalized autocorrelation peak.

**Formant detection:**

Three formant ranges are scanned independently: F1 (200-900Hz), F2 (500-3000Hz), F3 (2000-3500Hz). For each range, local maxima are identified using a prominence criterion — peaks must exceed the mean of a +/-8 bin neighborhood by at least 6 units (roughly 2dB). Parabolic interpolation gives sub-bin frequency accuracy. A minimum separation of 80Hz prevents duplicate detections across ranges.

**EVP classification criteria:**

- **Class A**: Spectral centroid 300-3000Hz, HNR > 15dB, 2+ formants, SNR > 20dB, duration 0.5-3s
- **Class B**: Spectral centroid 300-3000Hz, HNR 8-15dB, 1+ formant, SNR > 10dB
- **Class C**: Centroid 200-4000Hz, SNR > 5dB

The classifier accumulates consecutive anomaly frames into segments (merging across gaps up to 0.2s), then applies the criteria to the segment averages. A 1-second cooldown between classifications prevents rapid-fire detections.

**Environmental sensors:**

The app also reads the device magnetometer (via Generic Sensor API or DeviceOrientation fallback) for EMF monitoring, and performs DFT on accelerometer data in the 0-30Hz range to detect infrasound. It specifically monitors for the 18.98Hz frequency identified by Tandy (1998) as causing anxiety, visual disturbances, and feelings of presence.

**Scientific context:**

The evidence reports reference Nees & Phillips (2015) on auditory pareidolia — the finding that listeners tend to perceive speech patterns in random noise, especially when primed to expect them. Low-confidence (Class C) detections carry explicit pareidolia warnings. The reports also cite Baruss (2001), whose controlled studies failed to replicate EVP under blinded conditions, and Persinger (1987) on electromagnetic sensitivity.

My goal was to build a tool that applies rigorous signal processing while being transparent about the limitations. Every classification comes with the raw metrics (centroid, HNR, SNR, formant frequencies, duration) so anyone can evaluate the data independently. The tool doesn't tell you ghosts are real — it tells you whether the audio signal has characteristics consistent with voice-like patterns, and how confident the algorithm is.

I think this is useful for skeptics and believers alike. Skeptics can examine the raw data behind any claimed EVP. Believers get a more rigorous analysis than "the app says there's a ghost."

The app is free to use (EVP Scan mode with full classification): https://evp-mini.pages.dev

Pro ($4.99 one-time) adds spirit box simulation, visual camera filters, recording, and export.

I'd be interested in hearing methodological critiques. What would you change about the classification thresholds? Are there additional signal features I should be computing?
