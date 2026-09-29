import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

import { INSTRUMENTS, isInstrument } from "@/lib/instruments";
import type { Note } from "@/lib/pitch";
import { deleteRecording, getRecording, isValidId, RECORDINGS_DIR, updateRecording } from "@/lib/recordings";

async function find(ctx: RouteContext<"/api/recordings/[id]">) {
  const { id } = await ctx.params;
  return isValidId(id) ? getRecording(id) : null;
}

/** Streams the audio file. Supports Range requests, which Safari needs to play audio. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/recordings/[id]">) {
  const meta = await find(ctx);
  if (!meta) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(path.join(RECORDINGS_DIR, meta.file));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = {
    "Content-Type": meta.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const size = data.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(new Uint8Array(data), {
    headers: { ...headers, "Content-Length": String(data.length) },
  });
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
