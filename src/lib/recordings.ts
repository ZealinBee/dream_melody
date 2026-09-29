import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Instrument } from "@/lib/instruments";
import type { Transcription } from "@/lib/pitch";

/** Recordings live on the local machine, next to the project (gitignored). */
export const RECORDINGS_DIR = path.join(process.cwd(), "recordings");

export type RecordingMeta = {
  id: string;
  createdAt: string;
  seconds: number;
  mimeType: string;
  file: string;
  size: number;
  /** Loudness envelope (0–1 per bar) for the waveform. Missing on older takes. */
  peaks?: number[];
  instruments: Instrument[];
  transcription?: Transcription | null;
};

/** Older takes stored a single `instrument`; fold it into `instruments`. */
function normalize(raw: RecordingMeta & { instrument?: Instrument | null }): RecordingMeta {
  const { instrument, ...meta } = raw;
  return { ...meta, instruments: meta.instruments ?? (instrument ? [instrument] : []) };
}

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

// Timestamp first so ids sort chronologically; the suffix avoids collisions.
const ID_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{8}$/;

export function isValidId(id: string) {
  return ID_PATTERN.test(id);
}

/** Maps "audio/webm;codecs=opus" to "audio/webm", or null if we don't accept it. */
export function baseMimeType(contentType: string | null) {
  const base = contentType?.split(";")[0].trim().toLowerCase() ?? "";
  return base in EXTENSIONS ? base : null;
}

function metaPath(id: string) {
  return path.join(RECORDINGS_DIR, `${id}.json`);
}

export async function saveRecording(audio: Buffer, mimeType: string, seconds: number, peaks: number[]) {
  await mkdir(RECORDINGS_DIR, { recursive: true });
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const id = `${stamp}-${randomUUID().slice(0, 8)}`;
  const file = `${id}.${EXTENSIONS[mimeType]}`;

  await writeFile(path.join(RECORDINGS_DIR, file), audio);
  const meta: RecordingMeta = {
    id,
    createdAt: now.toISOString(),
    seconds,
    mimeType,
    file,
    size: audio.length,
    peaks,
    instruments: [],
  };
  await writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  return meta;
}

export async function listRecordings() {
  let names: string[];
  try {
    names = await readdir(RECORDINGS_DIR);
  } catch {
    return [];
  }
  const metas = await Promise.all(
    names
      .filter((n) => n.endsWith(".json"))
      .map(async (n) => {
        try {
          return normalize(JSON.parse(await readFile(path.join(RECORDINGS_DIR, n), "utf8")));
        } catch {
          return null;
        }
      }),
  );
  return metas
    .filter((m): m is RecordingMeta => m !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRecording(id: string) {
  try {
    return normalize(JSON.parse(await readFile(metaPath(id), "utf8")));
  } catch {
    return null;
  }
}

export async function updateRecording(meta: RecordingMeta, patch: Partial<Pick<RecordingMeta, "instruments" | "transcription">>) {
  const updated = { ...meta, ...patch };
  await writeFile(metaPath(meta.id), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteRecording(meta: RecordingMeta) {
  await rm(path.join(RECORDINGS_DIR, meta.file), { force: true });
  await rm(metaPath(meta.id), { force: true });
}
