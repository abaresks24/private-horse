"use client";

import { useState } from "react";
import HorseMark from "./HorseMark";

// The running horse (black horse on the red figure). Falls back to the static logo if the clip
// can't play. Feet stay visible — the figure pads + contains the natural frame.
export default function HeroHorse() {
  const [noVideo, setNoVideo] = useState(false);
  if (noVideo) return <HorseMark size={150} />;
  return (
    <video autoPlay loop muted playsInline onError={() => setNoVideo(true)}>
      <source src="/loader-transparent.webm" type="video/webm" />
      <source src="/loader.mp4" type="video/mp4" />
    </video>
  );
}
