"use client";

import { useEffect, useState } from "react";
import HorseMark from "./HorseMark";

// Full-bleed loading overlay. Plays the running-horse animation on a loop while something loads
// — à la abyssal.fi's spinning logo, but it's the galloping horse (round-masked). Transparent WebM
// (Chrome/FF) with an MP4 fallback (Safari); falls back to the static white logo if neither plays.
//
// <Loader> shows on mount then fades after `minMs`. <LoaderOverlay hidden={...}> can gate any async
// work (e.g. proof generation) — pass hidden={!busy}.

export function Loader({ children, minMs = 2000 }: { children: React.ReactNode; minMs?: number }) {
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
  const [noVideo, setNoVideo] = useState(false);
  return (
    <div className={`loader${hidden ? " hide" : ""}`} aria-hidden={hidden}>
      <div className="stage">
        <div className="horsewrap">
          {noVideo ? (
            <HorseMark size={180} src="/logo-white.png" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/loader-round.webp" alt="Private Horse" onError={() => setNoVideo(true)} />
          )}
        </div>
        <div className="wordmark">{label}</div>
      </div>
    </div>
  );
}
