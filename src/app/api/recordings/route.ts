import { baseMimeType, isValidId } from "@/lib/recording-ids";
import { createRecording, listRecordings } from "@/lib/recordings";
import { storageMissing } from "@/lib/storage";

const MAX_PEAKS = 256;

const NOT_CONFIGURED = {
  error: "Storage isn't set up. Connect a Vercel Blob store to this project, then redeploy.",
};

export async function GET() {
  if (storageMissing) return Response.json(NOT_CONFIGURED, { status: 503 });
  return Response.json(await listRecordings());
}

/**
 * Registers a take after its audio has been uploaded.
 * Body: { id, mimeType, seconds, peaks: number[] (0–1) }
 */
export async function POST(request: Request) {
  if (storageMissing) return Response.json(NOT_CONFIGURED, { status: 503 });

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    mimeType?: unknown;
    seconds?: unknown;
    peaks?: unknown;
  } | null;

  const id = typeof body?.id === "string" && isValidId(body.id) ? body.id : null;
  const mimeType = typeof body?.mimeType === "string" ? baseMimeType(body.mimeType) : null;
  if (!id || !mimeType) return Response.json({ error: "Bad id or audio type" }, { status: 400 });

  const seconds = Number(body?.seconds);
  const peaks = Array.isArray(body?.peaks)
    ? body.peaks.slice(0, MAX_PEAKS).map(Number).filter(Number.isFinite).map((v) => Math.min(1, Math.max(0, v)))
    : [];

  const meta = await createRecording({
    id,
    mimeType,
    seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
    peaks,
  });
  if (!meta) return Response.json({ error: "Audio for this recording wasn't uploaded" }, { status: 409 });
  return Response.json(meta, { status: 201 });
}
