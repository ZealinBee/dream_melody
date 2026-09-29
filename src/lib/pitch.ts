/**
 * Monophonic pitch transcription for hummed melodies.
 *
 * YIN pitch detection per frame → MIDI pitch track → notes. Pure functions with
 * no browser APIs, so it runs anywhere (and is easy to test in Node).
 */

export type Note = {
  /** MIDI note number (60 = middle C). */
  midi: number;
  /** Seconds from the start of the recording. */
  start: number;
  duration: number;
};

export type Transcription = { notes: Note[]; createdAt: string };

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function noteName(midi: number) {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export const SAMPLE_RATE = 16000;
const FRAME = 1024; // 64ms at 16kHz: enough for pitches down to ~70Hz
const HOP = 256; // 16ms between frames
const MIN_HZ = 70;
const MAX_HZ = 1100;
const YIN_THRESHOLD = 0.15;
/** Frames quieter than this fraction of the loudest frame count as silence. */
const SILENCE = 0.1;
const MIN_NOTE_SECONDS = 0.09;
const MERGE_GAP_SECONDS = 0.05;

/** YIN (de Cheveigné & Kawahara, 2002). Returns Hz, or null if unpitched. */
function yin(samples: Float32Array, offset: number, sampleRate: number, cmnd: Float32Array) {
  const window = FRAME / 2;
  const minTau = Math.floor(sampleRate / MAX_HZ);
  const maxTau = Math.min(window - 1, Math.ceil(sampleRate / MIN_HZ));

  // Cumulative mean normalized difference function.
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let d = 0;
    for (let j = 0; j < window; j++) {
      const delta = samples[offset + j] - samples[offset + j + tau];
      d += delta * delta;
    }
    running += d;
    cmnd[tau] = running === 0 ? 1 : (d * tau) / running;
  }

  let tau = minTau;
  while (tau <= maxTau && cmnd[tau] >= YIN_THRESHOLD) tau++;
  if (tau > maxTau) return null;
  while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;

  // Parabolic interpolation around the dip for sub-sample precision.
  let refined = tau;
  if (tau > 1 && tau < maxTau) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) refined = tau + (a - c) / (2 * denom);
  }
  return sampleRate / refined;
}

/** Fractional MIDI pitch per frame (null = silence/unpitched). */
export async function pitchTrack(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
) {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const rms = new Float32Array(frames);
  let loudest = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let j = 0; j < FRAME; j++) sum += samples[f * HOP + j] ** 2;
    rms[f] = Math.sqrt(sum / FRAME);
    loudest = Math.max(loudest, rms[f]);
  }

  const cmnd = new Float32Array(FRAME / 2);
  const track: (number | null)[] = new Array(frames).fill(null);
  for (let f = 0; f < frames; f++) {
    if (rms[f] > loudest * SILENCE && rms[f] > 1e-3) {
      const hz = yin(samples, f * HOP, sampleRate, cmnd);
      if (hz !== null) track[f] = 69 + 12 * Math.log2(hz / 440);
    }
    // Yield now and then so a long take doesn't freeze the page.
    if (f % 300 === 299) {
      onProgress?.(f / frames);
      await new Promise((resolve) => setTimeout(resolve));
    }
  }
  onProgress?.(1);
  return { track, secondsPerFrame: HOP / sampleRate };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Turns a pitch track into discrete notes. */
export function segmentNotes(track: (number | null)[], secondsPerFrame: number): Note[] {
  const voiced = track.filter((p): p is number => p !== null);
  if (voiced.length === 0) return [];

  // Most people hum consistently a bit sharp or flat; measure that offset and
  // remove it before snapping to semitones.
  const tuning = median(voiced.map((p) => p - Math.round(p)));

  // Median-smooth over neighbouring voiced frames to kill octave blips.
  const smoothed = track.map((p, i) => {
    if (p === null) return null;
    const around = track.slice(Math.max(0, i - 2), i + 3).filter((q): q is number => q !== null);
    return median(around);
  });
  const snapped = smoothed.map((p) => (p === null ? null : Math.round(p - tuning)));

  // Group runs of the same semitone.
  const runs: { midi: number; from: number; to: number }[] = [];
  for (let i = 0; i < snapped.length; i++) {
    const midi = snapped[i];
    if (midi === null) continue;
    const last = runs[runs.length - 1];
    if (last && last.midi === midi && last.to === i - 1) last.to = i;
    else runs.push({ midi, from: i, to: i });
  }

  const minFrames = Math.ceil(MIN_NOTE_SECONDS / secondsPerFrame);
  const mergeFrames = Math.ceil(MERGE_GAP_SECONDS / secondsPerFrame);
  const kept: typeof runs = [];
  for (const run of runs) {
    if (run.to - run.from + 1 < minFrames) continue;
    const last = kept[kept.length - 1];
    // Same pitch after a tiny gap (a breath or a dropped frame) is one note.
    if (last && last.midi === run.midi && run.from - last.to <= mergeFrames) last.to = run.to;
    else kept.push({ ...run });
  }

  const round = (s: number) => Math.round(s * 1000) / 1000;
  return kept.map((r) => ({
    midi: r.midi,
    start: round(r.from * secondsPerFrame),
    duration: round((r.to - r.from + 1) * secondsPerFrame),
  }));
}

export async function transcribe(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
) {
  const { track, secondsPerFrame } = await pitchTrack(samples, sampleRate, onProgress);
  return segmentNotes(track, secondsPerFrame);
}
