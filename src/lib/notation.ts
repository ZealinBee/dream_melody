/**
 * Turns transcribed notes (seconds + MIDI) into ABC notation for engraving.
 *
 * Steps: estimate a tempo, snap onsets/ends to a 16th-note grid, pick a major
 * key and clef, then spell pitches and split durations into standard note
 * values (with ties across barlines). Pure, no browser APIs.
 */

import type { Note } from "@/lib/pitch";

const SLOTS_PER_BAR = 16; // 4/4 in 16th notes
const MIN_BPM = 70;
const MAX_BPM = 140;
/** Note lengths (in 16ths) that can be written as one symbol, dotted ones included. */
const WRITABLE = [16, 12, 8, 6, 4, 3, 2, 1];

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
type Letter = (typeof LETTERS)[number];
const NATURAL_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Major keys up to five accidentals: name, and the alteration each letter gets. */
const KEYS: { name: string; minor: string; flats: boolean; alter: Partial<Record<Letter, number>> }[] = [
  { name: "C", minor: "A", flats: false, alter: {} },
  { name: "G", minor: "E", flats: false, alter: { F: 1 } },
  { name: "D", minor: "B", flats: false, alter: { F: 1, C: 1 } },
  { name: "A", minor: "F♯", flats: false, alter: { F: 1, C: 1, G: 1 } },
  { name: "E", minor: "C♯", flats: false, alter: { F: 1, C: 1, G: 1, D: 1 } },
  { name: "B", minor: "G♯", flats: false, alter: { F: 1, C: 1, G: 1, D: 1, A: 1 } },
  { name: "F", minor: "D", flats: true, alter: { B: -1 } },
  { name: "Bb", minor: "G", flats: true, alter: { B: -1, E: -1 } },
  { name: "Eb", minor: "C", flats: true, alter: { B: -1, E: -1, A: -1 } },
  { name: "Ab", minor: "F", flats: true, alter: { B: -1, E: -1, A: -1, D: -1 } },
  { name: "Db", minor: "B♭", flats: true, alter: { B: -1, E: -1, A: -1, D: -1, G: -1 } },
];
type Key = (typeof KEYS)[number];

function scalePcs(key: Key) {
  return new Set(LETTERS.map((l) => (NATURAL_PC[l] + (key.alter[l] ?? 0) + 12) % 12));
}

/**
 * Picks the key signature. Among keys whose scale covers (nearly) all the
 * note-time, the one with the fewest accidentals wins: a tune that only uses
 * white notes gets no key signature. Minor keys share their relative major's
 * signature, so this covers them too.
 */
function detectKey(notes: Note[]) {
  const total = notes.reduce((sum, n) => sum + n.duration, 0);
  const coverage = KEYS.map((key) => {
    const pcs = scalePcs(key);
    return notes.reduce((sum, n) => sum + (pcs.has(n.midi % 12) ? n.duration : 0), 0) / total;
  });
  const best = Math.max(...coverage);
  // A few percent of slack so one off-pitch note doesn't force a new key.
  const candidates = KEYS.filter((_, i) => coverage[i] >= best - 0.04);
  return candidates.reduce((a, b) => (Object.keys(b.alter).length < Object.keys(a.alter).length ? b : a));
}

/** Chooses letter + alteration for a pitch in a key. */
function spell(midi: number, key: Key): { letter: Letter; alter: number } {
  const pc = midi % 12;
  for (const letter of LETTERS) {
    const alter = key.alter[letter] ?? 0;
    if ((NATURAL_PC[letter] + alter + 12) % 12 === pc) return { letter, alter };
  }
  // Out of key: prefer a natural, then a sharp (sharp keys) or flat (flat keys).
  const order = key.flats ? [0, -1, 1] : [0, 1, -1];
  for (const alter of order) {
    const letter = LETTERS.find((l) => (NATURAL_PC[l] + alter + 12) % 12 === pc);
    if (letter) return { letter, alter };
  }
  throw new Error(`unspellable pitch ${midi}`);
}

function abcPitch(letter: Letter, octave: number) {
  if (octave >= 5) return letter.toLowerCase() + "'".repeat(octave - 5);
  return letter + ",".repeat(4 - octave);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Seconds per beat: the typical gap between notes, folded into a sensible range. */
function estimateBeat(notes: Note[]) {
  const gaps = notes.slice(1).map((n, i) => n.start - notes[i].start).filter((g) => g > 0.05);
  let beat = gaps.length > 0 ? median(gaps) : notes[0].duration;
  while (60 / beat < MIN_BPM) beat /= 2;
  while (60 / beat >= MAX_BPM) beat *= 2;
  return beat;
}

type Event = { midi: number | null; slots: number };

/** Places notes on the 16th grid; rests fill any gaps. */
function quantize(notes: Note[], beat: number): Event[] {
  const slot = beat / 4;
  const origin = notes[0].start;
  const starts: number[] = [];
  for (const n of notes) {
    const q = Math.round((n.start - origin) / slot);
    starts.push(Math.max(q, (starts[starts.length - 1] ?? -1) + 1));
  }

  const events: Event[] = [];
  notes.forEach((n, i) => {
    const start = starts[i];
    const next = starts[i + 1];
    let end = Math.round((n.start + n.duration - origin) / slot);
    // Humming is legato: a gap of a 16th or less before the next note is just a breath.
    if (next !== undefined && next - end <= 1) end = next;
    end = Math.max(start + 1, next !== undefined ? Math.min(end, next) : end);
    events.push({ midi: n.midi, slots: end - start });
    if (next !== undefined && next > end) events.push({ midi: null, slots: next - end });
  });
  return events;
}

/** Splits a length into writable values. */
function pieces(slots: number) {
  const out: number[] = [];
  while (slots > 0) {
    const v = WRITABLE.find((w) => w <= slots)!;
    out.push(v);
    slots -= v;
  }
  return out;
}

export type Score = { abc: string; bpm: number; key: string; clef: "treble" | "bass" };

export function notesToAbc(notes: Note[], title = ""): Score | null {
  if (notes.length === 0) return null;
  const beat = estimateBeat(notes);
  const bpm = Math.round(60 / beat);
  const key = detectKey(notes);
  const clef = median(notes.map((n) => n.midi)) < 57 ? "bass" : "treble";

  const events = quantize(notes, beat);
  const bars: string[] = [];
  let bar: string[] = [];
  let pos = 0;
  // Accidentals last until the barline; track what each staff position currently reads as.
  let barAlter = new Map<string, number>();

  const closeBar = () => {
    bars.push(bar.join(" "));
    bar = [];
    pos = 0;
    barAlter = new Map();
  };

  for (const event of events) {
    let remaining = event.slots;
    while (remaining > 0) {
      const fit = Math.min(remaining, SLOTS_PER_BAR - pos);
      const parts = pieces(fit);
      parts.forEach((len, i) => {
        const lenText = len === 1 ? "" : String(len);
        if (event.midi === null) {
          bar.push(`z${lenText}`);
        } else {
          const { letter, alter } = spell(event.midi, key);
          const octave = Math.floor((event.midi - alter) / 12) - 1;
          const place = `${letter}${octave}`;
          const current = barAlter.get(place) ?? key.alter[letter] ?? 0;
          const sign = alter === current ? "" : alter === 1 ? "^" : alter === -1 ? "_" : "=";
          barAlter.set(place, alter);
          const tied = i < parts.length - 1 || remaining > fit;
          bar.push(`${sign}${abcPitch(letter, octave)}${lenText}${tied ? "-" : ""}`);
        }
      });
      pos += fit;
      remaining -= fit;
      if (pos === SLOTS_PER_BAR) closeBar();
    }
  }
  if (pos > 0) {
    bar.push(...pieces(SLOTS_PER_BAR - pos).map((len) => `z${len === 1 ? "" : len}`));
    closeBar();
  }

  // Four bars per line reads well at card width.
  const lines: string[] = [];
  for (let i = 0; i < bars.length; i += 4) lines.push(bars.slice(i, i + 4).join(" | ") + " |");
  lines[lines.length - 1] = lines[lines.length - 1].replace(/\|$/, "|]");

  const abc = [
    "X:1",
    title ? `T:${title}` : null,
    "M:4/4",
    "L:1/16",
    `Q:1/4=${bpm}`,
    `K:${key.name} clef=${clef}`,
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");

  const major = key.name.replace("b", "♭");
  return { abc, bpm, key: `${major} major / ${key.minor} minor`, clef };
}
