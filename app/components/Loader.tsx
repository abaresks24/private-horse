"use client";

import { useEffect, useRef, useState } from "react";
import HorseMark from "./HorseMark";

// Full-bleed loading overlay. Plays the running-horse video (public/horse-run.mp4) on a loop while
// something loads — à la abyssal.fi's spinning logo, but it's the galloping horse. Falls back to the
// breathing SVG mark if the video asset isn't present yet.
//
// Usage: wrap content in <Loader>. It shows on mount, then fades after `minMs`. Call the exported
// `runWithLoader` around async work to show it during long operations (e.g. proof generation).

export function Loader({ children, minMs = 1700 }: { children: React.ReactNode; minMs?: number }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), minMs);
    return () => clearTimeout(t);
  }, [minMs]);
  return (
    <>
      <LoaderOverlay hidden={done} label="Private Horse" />
      {children}
    </>
  );
}

export function LoaderOverlay({ hidden, label = "Working" }: { hidden: boolean; label?: string }) {
  const vid = useRef<HTMLVideoElement>(null);
  const [noVideo, setNoVideo] = useState(false);
  return (
    <div className={`loader${hidden ? " hide" : ""}`} aria-hidden={hidden}>
      <div className="stage">
        {noVideo ? (
          <HorseMark size={150} color="#ede7d8" />
        ) : (
          <video
            ref={vid}
            src="/horse-run.mp4"
            poster="/horse-poster.jpg"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setNoVideo(true)}
          />
        )}
        <div className="wordmark">{label}</div>
        <div className="barline" />
      </div>
    </div>
  );
}
