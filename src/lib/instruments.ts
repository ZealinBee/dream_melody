/** Instruments a melody can be tagged with. Shared by the client and the API. */
export const INSTRUMENTS = [
  "Piano",
  "Guitar",
  "Violin",
  "Cello",
  "Flute",
  "Clarinet",
  "Saxophone",
  "Trumpet",
  "Harp",
  "Drums",
  "Synth",
  "Music box",
  "Voice",
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

export function isInstrument(value: unknown): value is Instrument {
  return typeof value === "string" && (INSTRUMENTS as readonly string[]).includes(value);
}
