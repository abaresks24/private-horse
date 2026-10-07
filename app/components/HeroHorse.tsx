"use client";

import { useState } from "react";
import HorseMark from "./HorseMark";

// Running horse, transparent WebM (VP9 alpha) — the horse floats on whatever is behind it, so the
// red landing shows through with NO rectangle and NO seam. Static white logo fallback (Safari).
export default function HeroHorse() {
  const [noVideo, setNoVideo] = useState(false);
  if (noVideo) return <HorseMark size={170} src="/logo-white.png" />;
  return <video src="/loader-transparent.webm" autoPlay loop muted playsInline onError={() => setNoVideo(true)} />;
}
