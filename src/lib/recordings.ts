import type { Instrument } from "@/lib/instruments";
import type { Transcription } from "@/lib/pitch";
import { audioFileName, audioPathname } from "@/lib/recording-ids";
import { store } from "@/lib/storage";

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

const metaPath = (id: string) => `recordings/${id}.json`;

/**
 * Records a take whose audio has already been stored at its audio pathname.
 * Returns null if the audio isn't there (upload failed or never happened).
 */
export async function createRecording(input: { id: string; mimeType: string; seconds: number; peaks: number[] }) {
  const file = audioFileName(input.id, input.mimeType);
  const size = await store.size(audioPathname(file));
  if (size === null) return null;

  const meta: RecordingMeta = {
    id: input.id,
    createdAt: new Date().toISOString(),
    seconds: input.seconds,
    mimeType: input.mimeType,
    file,
    size,
    peaks: input.peaks,
    instruments: [],
  };
  await store.writeJson(metaPath(input.id), meta);
  return meta;
}

export async function listRecordings() {
  const pathnames = await store.listJson("recordings/");
  const metas = await Promise.all(
    pathnames.map(async (p) => {
      try {
        const raw = await store.readJson(p);
        return raw ? normalize(raw as RecordingMeta) : null;
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
  const raw = await store.readJson(metaPath(id)).catch(() => null);
  return raw ? normalize(raw as RecordingMeta) : null;
}

export async function updateRecording(
  meta: RecordingMeta,
  patch: Partial<Pick<RecordingMeta, "instruments" | "transcription">>,
) {
  const updated = { ...meta, ...patch };
  await store.writeJson(metaPath(meta.id), updated);
  return updated;
}

export function recordingAudio(meta: RecordingMeta, range: string | null) {
  return store.audioResponse(audioPathname(meta.file), meta.mimeType, range);
}

export async function deleteRecording(meta: RecordingMeta) {
  await store.remove([audioPathname(meta.file), metaPath(meta.id)]);
}
