import type { NextRequest } from "next/server";

import { INSTRUMENTS, isInstrument } from "@/lib/instruments";
import type { Note } from "@/lib/pitch";
import { audioFileName, audioPathname, baseMimeType, isValidId, MAX_AUDIO_BYTES } from "@/lib/recording-ids";
import { deleteRecording, getRecording, recordingAudio, updateRecording } from "@/lib/recordings";
import { storageMode, writeLocalAudio } from "@/lib/storage";

async function find(ctx: RouteContext<"/api/recordings/[id]">) {
  const { id } = await ctx.params;
  return isValidId(id) ? getRecording(id) : null;
}

/** Streams the audio. Supports Range requests, which Safari needs to play audio. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/recordings/[id]">) {
  const meta = await find(ctx);
  if (!meta) return new Response("Not found", { status: 404 });
  return recordingAudio(meta, request.headers.get("range"));
}

/**
 * Local storage only: the raw audio for a new take. (With Vercel Blob the
 * browser uploads straight to Blob instead — see ../upload/route.ts.)
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/recordings/[id]">) {
  if (storageMode !== "local") return new Response("Upload to Blob instead", { status: 405 });
  const { id } = await ctx.params;
  const mimeType = baseMimeType(request.headers.get("content-type"));
  if (!isValidId(id)) return new Response("Bad id", { status: 400 });
  if (!mimeType) return Response.json({ error: "Unsupported audio type" }, { status: 415 });

  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length === 0) return Response.json({ error: "Empty recording" }, { status: 400 });
  if (audio.length > MAX_AUDIO_BYTES) return Response.json({ error: "Recording too large" }, { status: 413 });

  await writeLocalAudio(audioPathname(audioFileName(id, mimeType)), audio);
  return new Response(null, { status: 204 });
}

const MAX_NOTES = 20000;

function parseNotes(value: unknown): Note[] | null {
  if (!Array.isArray(value) || value.length > MAX_NOTES) return null;
  const ok = value.every(
    (n) =>
      n !== null &&
      typeof n === "object" &&
      Number.isInteger(n.midi) &&
      n.midi >= 0 &&
      n.midi <= 127 &&
      Number.isFinite(n.start) &&
      n.start >= 0 &&
      Number.isFinite(n.duration) &&
      n.duration > 0,
  );
  return ok ? value.map(({ midi, start, duration }: Note) => ({ midi, start, duration })) : null;
}

/**
 * Body (either or both fields):
 *   { instruments: ["Piano", "Violin", …] } — replaces the whole set
 *   { notes: [{ midi, start, duration }, …] } — stores a transcription
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/recordings/[id]">) {
  const meta = await find(ctx);
  if (!meta) return new Response("Not found", { status: 404 });

  const body = (await request.json().catch(() => null)) as { instruments?: unknown; notes?: unknown } | null;
  const patch: Parameters<typeof updateRecording>[1] = {};

  if (body?.instruments !== undefined) {
    const requested = body.instruments;
    if (!Array.isArray(requested) || !requested.every(isInstrument)) {
      return Response.json({ error: "instruments must be a list of known instruments" }, { status: 400 });
    }
    // Dedupe and keep the canonical order so tags always read the same way.
    patch.instruments = INSTRUMENTS.filter((i) => requested.includes(i));
  }

  if (body?.notes !== undefined) {
    const notes = parseNotes(body.notes);
    if (!notes) return Response.json({ error: "notes must be a list of { midi, start, duration }" }, { status: 400 });
    patch.transcription = { notes, createdAt: new Date().toISOString() };
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  return Response.json(await updateRecording(meta, patch));
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/recordings/[id]">) {
  const meta = await find(ctx);
  if (!meta) return new Response("Not found", { status: 404 });
  await deleteRecording(meta);
  return new Response(null, { status: 204 });
}
