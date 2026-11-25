/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extracts real waveform peaks from an audio/video Blob using the Web Audio API (AudioContext).
 * Downsamples the channel data into `barCount` normalized values (10..98) and avoids blocking the main thread.
 */
export async function computeWaveformPeaksFromBlob(
  blob: Blob,
  barCount = 220
): Promise<{ peaks: number[]; duration: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  const audioCtx = new AudioCtx();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const rawData = audioBuffer.getChannelData(0);
    const totalSamples = rawData.length;
    const samplesPerBar = Math.max(1, Math.floor(totalSamples / barCount));
    const rawPeaks: number[] = [];

    let maxPeak = 0.001;

    for (let i = 0; i < barCount; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(totalSamples, start + samplesPerBar);
      // Sample every Nth frame for large files to stay fast and non-blocking
      const stride = Math.max(1, Math.floor((end - start) / 64));
      let sumSquares = 0;
      let count = 0;

      for (let j = start; j < end; j += stride) {
        const val = Math.abs(rawData[j]);
        sumSquares += val * val;
        count++;
      }

      const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
      if (rms > maxPeak) maxPeak = rms;
      rawPeaks.push(rms);
    }

    const normalizedPeaks = rawPeaks.map((p) => {
      const ratio = p / maxPeak;
      return Math.max(10, Math.min(96, Math.round(ratio * 88 + 8)));
    });

    return {
      peaks: normalizedPeaks,
      duration: Number(audioBuffer.duration.toFixed(3))
    };
  } finally {
    audioCtx.close().catch(() => {});
  }
}

/**
 * Probes duration of an audio or video Blob via HTMLMediaElement if decodeAudioData is not applicable
 */
export function probeMediaDuration(
  objectUrl: string,
  mediaType: 'audio' | 'video'
): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(mediaType);
    el.preload = 'metadata';
    const cleanup = () => {
      el.removeAttribute('src');
      el.load();
    };
    el.onloadedmetadata = () => {
      const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 210;
      cleanup();
      resolve(Number(d.toFixed(3)));
    };
    el.onerror = () => {
      cleanup();
      resolve(210);
    };
    el.src = objectUrl;
  });
}

/**
 * Creates a real, playable WAV audio Blob with gentle musical chord envelopes
 * so initial demo projects have genuine audio files for Web Audio waveform decoding,
 * playback, offset testing, and .mdsong packaging.
 */
export function createSynthesizedAudioBlob(
  durationSeconds = 45,
  baseFreq = 220
): Blob {
  const sampleRate = 8000; // Lightweight 8kHz mono PCM WAV (~720KB for 45s)
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const chordRatios = [1, 1.25, 1.5, 2];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Dynamic phrase envelope that rises and falls like musical measures
    const measureEnv =
      0.35 +
      0.45 * Math.abs(Math.sin(t * 0.85)) * (0.6 + 0.4 * Math.cos(t * 0.23));
    const beatPulse = 0.75 + 0.25 * Math.sin(t * Math.PI * 2);

    const chordIdx = Math.floor(t / 6) % chordRatios.length;
    const f1 = baseFreq * chordRatios[chordIdx];
    const f2 = f1 * 1.498;

    const wave =
      (Math.sin(2 * Math.PI * f1 * t) * 0.6 +
        Math.sin(2 * Math.PI * f2 * t) * 0.3 +
        Math.sin(2 * Math.PI * (f1 * 0.5) * t) * 0.2) *
      measureEnv *
      beatPulse *
      0.35;

    const clamped = Math.max(-1, Math.min(1, wave));
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
