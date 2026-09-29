"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import HumRecorder from "@/components/HumRecorder";
import InstrumentPicker from "@/components/InstrumentPicker";
import RecordingItem from "@/components/RecordingItem";
import type { Instrument } from "@/lib/instruments";
import type { Note } from "@/lib/pitch";
import { audioFileName, audioPathname, baseMimeType, newRecordingId } from "@/lib/recording-ids";
import type { RecordingMeta } from "@/lib/recordings";
import type { UploadMode } from "@/lib/storage";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving"; progress: number | null }
  | { kind: "saved"; id: string }
  | { kind: "error"; message: string };

async function errorText(res: Response) {
  const body = await res.json().catch(() => null);
  return (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
}

/** Stores the audio: straight to Vercel Blob when deployed, or via our API locally. */
async function uploadAudio(storage: UploadMode, id: string, blob: Blob, mimeType: string, onProgress: (p: number) => void) {
  if (storage === "blob-direct") {
    const { upload } = await import("@vercel/blob/client");
    await upload(audioPathname(audioFileName(id, mimeType)), blob, {
      access: "private",
      handleUploadUrl: "/api/recordings/upload",
      contentType: mimeType,
      multipart: blob.size > 20 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress(percentage / 100),
    });
    return;
  }
  const res = await fetch(`/api/recordings/${id}`, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
  if (!res.ok) throw new Error(await errorText(res));
}

function formatTime(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecordingStudio({ storage }: { storage: UploadMode }) {
  const [recordings, setRecordings] = useState<RecordingMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const listId = useId();
  // PATCHes per recording run one after another, so rapid chip taps land in order.
  const patchQueue = useRef(new Map<string, Promise<unknown>>());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings", { cache: "no-store" });
      if (!res.ok) throw new Error(await errorText(res));
      setRecordings(await res.json());
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from our own API
    refresh();
  }, [refresh]);

  const updateLocal = useCallback((id: string, patch: Partial<RecordingMeta>) => {
    setRecordings((prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);
  }, []);

  const patch = useCallback((id: string, body: object) => {
    const run = async () => {
      const res = await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok ? ((await res.json()) as RecordingMeta) : null;
    };
    const next = (patchQueue.current.get(id) ?? Promise.resolve()).then(run, run);
    patchQueue.current.set(id, next);
    return next;
  }, []);

  const handleRecorded = useCallback(
    async (blob: Blob, seconds: number, peaks: number[]) => {
      const mimeType = baseMimeType(blob.type);
      if (!mimeType) {
        setSave({ kind: "error", message: `This browser recorded ${blob.type || "an unknown format"}, which isn't supported.` });
        return;
      }
      setSave({ kind: "saving", progress: null });
      try {
        const id = newRecordingId();
        await uploadAudio(storage, id, blob, mimeType, (progress) => setSave({ kind: "saving", progress }));
        const res = await fetch("/api/recordings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, mimeType, seconds, peaks }),
        });
        if (!res.ok) throw new Error(await errorText(res));
        const take: RecordingMeta = await res.json();
        setRecordings((prev) => [take, ...(prev ?? [])]);
        setSave({ kind: "saved", id: take.id });
      } catch (err) {
        setSave({ kind: "error", message: (err as Error).message });
      }
    },
    [storage],
  );

  const setInstruments = useCallback(
    async (id: string, instruments: Instrument[]) => {
      const before = recordings?.find((r) => r.id === id)?.instruments ?? [];
      updateLocal(id, { instruments }); // optimistic
      if (!(await patch(id, { instruments }))) updateLocal(id, { instruments: before });
    },
    [patch, recordings, updateLocal],
  );

  const saveNotes = useCallback(
    async (id: string, notes: Note[]) => {
      const updated = await patch(id, { notes });
      if (updated) updateLocal(id, { transcription: updated.transcription });
      return !!updated;
    },
    [patch, updateLocal],
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/recordings/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 404) {
      setRecordings((prev) => prev?.filter((r) => r.id !== id) ?? null);
      setSave((s) => (s.kind === "saved" && s.id === id ? { kind: "idle" } : s));
    }
  }, []);

  const count = recordings?.length ?? 0;
  const latest = save.kind === "saved" ? recordings?.find((r) => r.id === save.id) : undefined;

  return (
    <>
      <div className="rounded-2xl border border-grey-3 bg-white p-6 sm:p-8">
        <HumRecorder onRecorded={handleRecorded} onStart={() => setSave({ kind: "idle" })} />

        <p className="mt-2 min-h-5 text-sm text-grey-1" aria-live="polite">
          {save.kind === "saving" &&
            (save.progress === null ? "Saving…" : `Uploading… ${Math.round(save.progress * 100)}%`)}
          {latest && `Saved a ${formatTime(latest.seconds)} take.`}
          {save.kind === "error" && `Couldn't save that recording. ${save.message}`}
        </p>

        {latest && (
          <div className="mt-6 border-t border-grey-3 pt-6">
            <p className="text-base font-medium text-dark-blue">Which instruments go with this recording?</p>
            <p className="mt-1 text-sm text-grey-1">
              {latest.instruments.length > 0 ? (
                <>
                  Tagged with <span className="font-medium text-dark-blue">{latest.instruments.join(", ")}</span>.
                </>
              ) : (
                "Pick as many as you like. You can change them later."
              )}
            </p>
            <div className="mt-4">
              <InstrumentPicker
                label="Instruments for this recording"
                value={latest.instruments}
                onChange={(instruments) => setInstruments(latest.id, instruments)}
              />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-dark-blue px-5 py-3 text-sm font-medium text-dark-blue transition-colors hover:bg-dark-blue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-blue focus-visible:ring-offset-2"
      >
        {open ? "Hide recordings" : "My recordings"}
        {count > 0 && (
          <span className="rounded-full bg-grey-3 px-2 py-0.5 text-xs font-semibold tabular-nums">{count}</span>
        )}
      </button>

      <section id={listId} hidden={!open} className="mt-6 text-left">
        {loadError && <p className="text-center text-sm text-grey-1">Couldn&apos;t load recordings. {loadError}</p>}
        {!loadError && recordings?.length === 0 && (
          <p className="text-center text-sm text-grey-1">No recordings yet. Hum something above.</p>
        )}
        {recordings && recordings.length > 0 && (
          <ul className="flex flex-col gap-3">
            {recordings.map((r, i) => (
              <RecordingItem
                key={r.id}
                recording={r}
                title={`Take ${recordings.length - i}`}
                onInstrumentsChange={setInstruments}
                onNotes={saveNotes}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
