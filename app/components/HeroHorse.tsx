"use client";

import { useState } from "react";
import HorseMark from "./HorseMark";

// Running horse for the red landing: the red-background MP4 (black horse on the same red) blends
// seamlessly into the red page — no frame, no artifact. Static white logo if it can't play.
export default function HeroHorse() {
  const [noVideo, setNoVideo] = useState(false);
  if (noVideo) return <HorseMark size={150} src="/logo-white.png" />;
  return <video src="/loader.mp4" autoPlay loop muted playsInline onError={() => setNoVideo(true)} />;
}
