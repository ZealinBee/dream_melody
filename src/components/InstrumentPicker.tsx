"use client";

import { type Instrument, INSTRUMENTS } from "@/lib/instruments";

type Props = {
  value: Instrument[];
  onChange: (instruments: Instrument[]) => void;
  label: string;
};

/** Multi-select chips; tapping a chip toggles it. */
export default function InstrumentPicker({ value, onChange, label }: Props) {
  const toggle = (instrument: Instrument) => {
    const next = value.includes(instrument) ? value.filter((i) => i !== instrument) : [...value, instrument];
    onChange(INSTRUMENTS.filter((i) => next.includes(i)));
  };

  return (
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-2">
      {INSTRUMENTS.map((instrument) => {
        const selected = value.includes(instrument);
        return (
          <button
            key={instrument}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(instrument)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-blue focus-visible:ring-offset-2 ${
              selected
                ? "border-dark-blue bg-dark-blue text-white"
                : "border-grey-3 bg-white text-dark-blue hover:border-dark-blue/40 hover:bg-grey-4"
            }`}
          >
            {selected && <CheckIcon />}
            {instrument}
          </button>
        );
      })}
    </div>
  );
}

export function InstrumentTag({ instrument }: { instrument: Instrument }) {
  return (
    <span className="rounded-full bg-light-blue/60 px-2.5 py-0.5 text-xs font-semibold text-dark-blue">
      {instrument}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
