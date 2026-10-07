"use client";

import { useState } from "react";
import HorseMark from "./HorseMark";

// Transparent animated WebP (argb) — animates in Chrome, Firefox AND Safari as a plain <img>,
// with true alpha, so the horse floats on the red page: no rectangle, no seam, no bar anywhere.
export default function HeroHorse() {
  const [bad, setBad] = useState(false);
  if (bad) return <HorseMark size={170} src="/logo-white.png" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/loader-round.webp" alt="Private Horse" onError={() => setBad(true)} />;
}
