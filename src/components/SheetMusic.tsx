"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { notesToAbc } from "@/lib/notation";
import { type Note, noteName } from "@/lib/pitch";

/** Engraved staff notation for a transcribed take. */
export default function SheetMusic({ notes }: { notes: Note[] }) {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const score = useMemo(() => notesToAbc(notes), [notes]);
  const [renderFailed, setRenderFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const paper = paperRef.current;
    if (!score || !paper) return;
    let cancelled = false;
    // abcjs touches the DOM on import, so load it only in the browser.
    import("abcjs")
      .then(({ default: abcjs }) => {
        if (cancelled) return;
        abcjs.renderAbc(paper, score.abc, {
          responsive: "resize",
          // A narrower layout width scales up to the card, so noteheads stay readable.
          staffwidth: 520,
          // Justify the last line too, instead of leaving a short staff hanging left.
          format: { stretchlast: true },
          foregroundColor: "#152749", // --color-dark-blue
          paddingtop: 0,
          paddingbottom: 0,
          paddingleft: 0,
          paddingright: 0,
        });
      })
      .catch(() => setRenderFailed(true));
    return () => {
      cancelled = true;
    };
  }, [score]);

  if (!score) {
    return (
      <p className="text-sm text-grey-1">
        No clear notes found. Try humming a little louder or closer to the mic, one note at a time.
      </p>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(notes.map((n) => noteName(n.midi)).join(" "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); nothing to do.
    }
  };

  return (
    <div>
      <div className="rounded-xl border border-grey-3 bg-white px-3 py-4 sm:px-4">
        {renderFailed ? (
          <p className="text-sm text-grey-1">Couldn&apos;t draw the score.</p>
        ) : (
          <div
            ref={paperRef}
            role="img"
            aria-label={`Sheet music: ${notes.map((n) => noteName(n.midi)).join(", ")}`}
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-grey-1">
        <span>
          {score.key} · ♩ = {score.bpm} · {score.clef === "bass" ? "Bass" : "Treble"} clef
        </span>
        <button type="button" onClick={copy} className="font-medium text-dark-blue underline-offset-4 hover:underline">
          {copied ? "Copied" : "Copy note names"}
        </button>
      </div>
    </div>
  );
}
