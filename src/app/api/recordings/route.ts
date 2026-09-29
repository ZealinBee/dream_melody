import { baseMimeType, listRecordings, saveRecording } from "@/lib/recordings";

const MAX_BYTES = 500 * 1024 * 1024;
const MAX_PEAKS = 256;

/** "0.12,0.8,…" → numbers clamped to 0–1; anything malformed becomes []. */
function parsePeaks(header: string | null) {
  if (!header) return [];
  const values = header.split(",").slice(0, MAX_PEAKS).map(Number);
  return values.every(Number.isFinite) ? values.map((v) => Math.min(1, Math.max(0, v))) : [];
}

export async function GET() {
  return Response.json(await listRecordings());
}

/**
 * Body is the raw audio. Duration comes in X-Duration-Seconds and the waveform
 * envelope in X-Peaks (comma-separated, 0–1).
 */
export async function POST(request: Request) {
  const mimeType = baseMimeType(request.headers.get("content-type"));
  if (!mimeType) {
    return Response.json({ error: "Unsupported audio type" }, { status: 415 });
  }

  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length === 0) {
    return Response.json({ error: "Empty recording" }, { status: 400 });
  }
  if (audio.length > MAX_BYTES) {
    return Response.json({ error: "Recording too large" }, { status: 413 });
  }

  const seconds = Number(request.headers.get("x-duration-seconds"));
  const meta = await saveRecording(
    audio,
    mimeType,
    Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
    parsePeaks(request.headers.get("x-peaks")),
  );
  return Response.json(meta, { status: 201 });
}
