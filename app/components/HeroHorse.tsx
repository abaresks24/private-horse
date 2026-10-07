"use client";

import { useState } from "react";
import HorseMark from "./HorseMark";

// The running horse — transparent WebM (black horse, shows on the parchment landing via alpha),
// with an MP4 composited on the same parchment for Safari. Falls back to the static logo.
export default function HeroHorse() {
  const [noVideo, setNoVideo] = useState(false);
  if (noVideo) return <HorseMark size={150} />;
  return (
    <video autoPlay loop muted playsInline onError={() => setNoVideo(true)}>
      <source src="/loader-transparent.webm" type="video/webm" />
      <source src="/loader-bone.mp4" type="video/mp4" />
    </video>
  );
}
