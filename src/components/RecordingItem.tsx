"use client";

import { useState } from "react";

import AudioPlayer from "@/components/AudioPlayer";
import InstrumentPicker, { InstrumentTag } from "@/components/InstrumentPicker";
import SheetMusic from "@/components/SheetMusic";
import type { Instrument } from "@/lib/instruments";
import { type Note, SAMPLE_RATE, transcribe } from "@/lib/pitch";
import type { RecordingMeta } from "@/lib/recordings";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Decodes the take to mono at the analysis sample rate. */
async function loadSamples(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  // decodeAudioData resamples to the context's rate, so ask for 16kHz directly.
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / buffer.numberOfChannels;
  }
  return mono;
}

type Props = {
  recording: RecordingMeta;
  title: string;
  onInstrumentsChange: (id: string, instruments: Instrument[]) => void;
  onNotes: (id: string, notes: Note[]) => Promise<boolean>;
  onDelete: (id: string) => void;
};

export default function RecordingItem({ recording: r, title, onInstrumentsChange, onNotes, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [transcribeError, setTranscribeError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const src = `/api/recordings/${r.id}`;
  const transcribed = !!r.transcription;

  const runTranscription = async () => {
    setTranscribeError(false);
    setProgress(0);
    try {
      const notes = await transcribe(await loadSamples(src), SAMPLE_RATE, setProgress);
      if (!(await onNotes(r.id, notes))) throw new Error("save failed");
      setShowNotes(true);
    } catch {
      setTranscribeError(true);
    } finally {
      setProgress(null);
    }
  };

  const linkButton = "text-sm font-medium underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-60";

  return (
    <li className="rounded-2xl border border-grey-3 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-sm font-medium text-dark-blue">{title}</span>
        {r.instruments.map((instrument) => (
          <InstrumentTag key={instrument} instrument={instrument} />
        ))}
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
          className="rounded-full border border-dashed border-grey-2 px-2.5 py-0.5 text-xs font-medium text-grey-1 transition-colors hover:border-dark-blue/40 hover:text-dark-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-blue focus-visible:ring-offset-2"
        >
          {r.instruments.length > 0 ? "Edit" : "+ Instruments"}
        </button>
        <span className="ml-auto text-xs text-grey-1">{dateFormat.format(new Date(r.createdAt))}</span>
      </div>

      {editing && (
        <div className="mt-4 rounded-xl bg-grey-4 p-3">
          <p className="mb-3 text-center text-sm font-medium text-dark-blue">
            Which instruments go with this recording?
          </p>
          <InstrumentPicker
            label={`Instruments for ${title}`}
            value={r.instruments}
            onChange={(instruments) => onInstrumentsChange(r.id, instruments)}
          />
          <div className="mt-3 text-center">
            <button type="button" onClick={() => setEditing(false)} className={`${linkButton} text-dark-blue`}>
              Done
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <AudioPlayer src={src} duration={r.seconds} peaks={r.peaks} label={title} />
      </div>

      {showNotes && r.transcription && (
        <div className="mt-4 border-t border-grey-3 pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-green">Sheet music</p>
            <span className="text-xs text-grey-1">{r.transcription.notes.length} detected</span>
          </div>
          <SheetMusic notes={r.transcription.notes} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
        {transcribeError && <span className="mr-auto text-xs text-red-600">Couldn&apos;t transcribe this take.</span>}
        {progress !== null ? (
          <span className="text-sm font-medium tabular-nums text-grey-1" aria-live="polite">
            Transcribing… {Math.round(progress * 100)}%
          </span>
        ) : transcribed ? (
          <>
            <button type="button" onClick={() => setShowNotes((s) => !s)} className={`${linkButton} text-dark-blue`}>
              {showNotes ? "Hide notes" : "Show notes"}
            </button>
            {showNotes && (
              <button type="button" onClick={runTranscription} className={`${linkButton} text-grey-1`}>
                Re-transcribe
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={runTranscription} className={`${linkButton} text-dark-blue`}>
            Transcribe
          </button>
        )}
        <a href={src} download={r.file} className={`${linkButton} text-dark-blue`}>
          Download
        </a>
        <button type="button" onClick={() => onDelete(r.id)} className={`${linkButton} text-grey-1 hover:text-red-600`}>
          Delete
        </button>
      </div>
    </li>
  );
}
