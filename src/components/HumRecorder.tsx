"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Preferred first; Safari only supports audio/mp4.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

type Status = "idle" | "requesting" | "recording" | "recorded" | "error";

type Props = {
  /**
   * Called with each finished take, its length in seconds, and a loudness
   * envelope (PEAK_BARS values, 0–1) for drawing its waveform.
   */
  onRecorded?: (blob: Blob, seconds: number, peaks: number[]) => void;
  /** Called when a new take begins recording. */
  onStart?: () => void;
};

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export const PEAK_BARS = 64;

/** Buckets the level history into PEAK_BARS bars, scaled so the loudest is 1. */
function toPeaks(levels: number[]) {
  if (levels.length === 0) return [];
  const bars = Array.from({ length: PEAK_BARS }, (_, i) => {
    const from = Math.floor((i * levels.length) / PEAK_BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / PEAK_BARS));
    return Math.max(...levels.slice(from, to));
  });
  const loudest = Math.max(...bars) || 1;
  return bars.map((b) => Math.round((b / loudest) * 100) / 100);
}

function formatTime(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function errorMessage(err: unknown) {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Microphone access is blocked. Allow it in your browser's site settings, then try again.";
    }
    if (err.name === "NotFoundError") return "No microphone found. Connect one and try again.";
    if (err.name === "NotReadableError") return "Your microphone is being used by another app.";
  }
  return "Couldn't start recording. Please try again.";
}

export default function HumRecorder({ onRecorded, onStart }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const levelRingRef = useRef<HTMLSpanElement | null>(null);
  const levelsRef = useRef<number[]>([]);
  const onRecordedRef = useRef(onRecorded);
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
    onStartRef.current = onStart;
  }, [onRecorded, onStart]);

  const releaseInput = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) clearInterval(timerRef.current);
    rafRef.current = timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    if (levelRingRef.current) levelRingRef.current.style.transform = "scale(1)";
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser. Try a recent Chrome, Safari, Firefox or Edge.");
      setStatus("error");
      return;
    }

    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Voice-call processing (noise suppression especially) treats a sustained
        // hum as noise and flattens it, so capture the raw signal.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      setError(errorMessage(err));
      setStatus("error");
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      releaseInput();
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      setStatus("recorded");
      onRecordedRef.current?.(blob, seconds, toPeaks(levelsRef.current));
    };
    recorderRef.current = recorder;

    // Live input level drives the ring around the button, so the user can see
    // the mic is actually picking them up.
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const readLevel = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      return Math.min(1, Math.sqrt(sum / samples.length) * 5);
    };
    const tick = () => {
      const level = readLevel();
      if (levelRingRef.current) levelRingRef.current.style.transform = `scale(${1 + level * 0.6})`;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    startedAtRef.current = performance.now();
    levelsRef.current = [];
    setElapsed(0);
    // Sampled on a timer, not rAF, so the waveform history keeps going even
    // when the tab is in the background.
    timerRef.current = window.setInterval(() => {
      levelsRef.current.push(readLevel());
      setElapsed((performance.now() - startedAtRef.current) / 1000);
    }, 100);

    // Timeslice flushes audio in 1s chunks, so a long take never piles up as
    // one huge in-progress buffer.
    recorder.start(1000);
    setStatus("recording");
    onStartRef.current?.();
  }, [releaseInput]);

  // Release the mic and any object URL when the component goes away.
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      releaseInput();
    };
  }, [releaseInput]);

  const isRecording = status === "recording";
  const busy = status === "requesting";

  const statusText = {
    idle: "Tap to start humming",
    requesting: "Waiting for microphone access…",
    recording: `Recording · ${formatTime(elapsed)}`,
    recorded: "Tap to record another",
    error: "Something went wrong",
  }[status];

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <span
          ref={levelRingRef}
          aria-hidden
          className={`absolute h-24 w-24 rounded-full bg-light-blue motion-safe:transition-transform motion-safe:duration-75 ${
            isRecording ? "opacity-100" : "opacity-0"
          }`}
        />
        <button
          type="button"
          onClick={isRecording ? stop : start}
          disabled={busy}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className="relative flex h-24 w-24 items-center justify-center rounded-full bg-dark-blue text-white transition-colors hover:bg-dark-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-blue focus-visible:ring-offset-4 disabled:cursor-wait disabled:opacity-60"
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </button>
      </div>

      <p
        role="status"
        className="mt-4 flex items-center gap-2 text-sm font-medium tabular-nums text-dark-blue"
      >
        {isRecording && <span aria-hidden className="h-2 w-2 rounded-full bg-red-600" />}
        {statusText}
      </p>

      {error && <p className="mt-2 max-w-sm text-sm text-grey-1">{error}</p>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  );
}
