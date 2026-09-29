"use client";

import { useEffect, useRef, useState } from "react";

import { PEAK_BARS } from "@/components/HumRecorder";

// Only one take plays at a time across the page.
let nowPlaying: HTMLAudioElement | null = null;

// Takes saved before waveforms existed get a gentle, even bar pattern.
const FALLBACK_PEAKS = Array.from({ length: PEAK_BARS }, (_, i) => 0.35 + 0.15 * Math.sin(i * 0.9));

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Props = {
  src: string;
  /** Known length in seconds. MediaRecorder WebM files often report an Infinity duration. */
  duration: number;
  peaks?: number[];
  label: string;
};

export default function AudioPlayer({ src, duration: knownDuration, peaks, label }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(knownDuration);
  const [hover, setHover] = useState<number | null>(null);

  const bars = peaks && peaks.length > 0 ? peaks : FALLBACK_PEAKS;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // timeupdate only fires ~4×/s; follow the playhead per frame while playing.
    const follow = () => {
      setCurrent(audio.currentTime);
      rafRef.current = requestAnimationFrame(follow);
    };
    const onPlay = () => {
      setPlaying(true);
      rafRef.current = requestAnimationFrame(follow);
    };
    const onPause = () => {
      setPlaying(false);
      setLoading(false);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      setCurrent(audio.currentTime);
    };
    const onEnded = () => {
      onPause();
      audio.currentTime = 0;
      setCurrent(0);
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (nowPlaying === audio) nowPlaying = null;
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (nowPlaying && nowPlaying !== audio) nowPlaying.pause();
    nowPlaying = audio;
    setLoading(true);
    audio.play().catch(() => setLoading(false));
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const t = Math.min(duration, Math.max(0, seconds));
    audio.currentTime = t;
    setCurrent(t);
  };

  const fractionAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
    if (step !== undefined) seekTo(current + step);
    else if (e.key === "Home") seekTo(0);
    else if (e.key === "End") seekTo(duration);
    else if (e.key === " " || e.key === "Enter") toggle();
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex items-center gap-3">
      <audio ref={audioRef} src={src} preload="none" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dark-blue text-white transition-colors hover:bg-dark-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-blue focus-visible:ring-offset-2"
      >
        {loading ? <Spinner /> : playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div
        role="slider"
        tabIndex={0}
        aria-label={`Seek ${label}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(current)}
        aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(fractionAt(e) * duration);
        }}
        onPointerMove={(e) => {
          setHover(fractionAt(e));
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(fractionAt(e) * duration);
        }}
        onPointerLeave={() => setHover(null)}
        className="group flex h-10 min-w-0 flex-1 cursor-pointer touch-none items-center gap-[2px] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-blue focus-visible:ring-offset-2"
      >
        {bars.map((peak, i) => {
          const at = (i + 0.5) / bars.length;
          const tone =
            at <= progress ? "bg-dark-blue" : hover !== null && at <= hover ? "bg-dark-blue/35" : "bg-grey-2/70";
          return (
            <span
              key={i}
              aria-hidden
              className={`flex-1 rounded-full transition-colors duration-150 ${tone}`}
              style={{ height: `${Math.max(12, peak * 100)}%` }}
            />
          );
        })}
      </div>

      <span className="w-[5.5rem] shrink-0 text-right text-xs font-medium tabular-nums text-grey-1">
        {formatTime(current)} / {formatTime(duration)}
      </span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="ml-0.5">
      <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="motion-safe:animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
