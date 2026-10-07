"use client";

import { useState } from "react";
import HorseMark from "./HorseMark";

// Full-frame transparent animated WebP (true alpha, red bg keyed out) — animates in Chrome, Firefox
// AND Safari as a plain <img>, so the smoke horse floats on the beige page: no rectangle, no circle,
// no seam, no bar. Falls back to the static black logo if the webp can't load.
export default function HeroHorse() {
  const [bad, setBad] = useState(false);
  if (bad) return <HorseMark size={170} src="/logo.png" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/horse.webp" alt="Private Horse" onError={() => setBad(true)} />;
}
