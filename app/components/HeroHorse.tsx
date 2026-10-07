"use client";

import { useState } from "react";
import HorseMark from "./HorseMark";

// The running horse on the red landing — transparent WebM (black horse) over red, with the
// red-background MP4 as the Safari fallback so it blends seamlessly. Static logo if neither plays.
export default function HeroHorse() {
  const [noVideo, setNoVideo] = useState(false);
  if (noVideo) return <HorseMark size={150} src="/logo-white.png" />;
  return (
    <video autoPlay loop muted playsInline onError={() => setNoVideo(true)}>
      <source src="/loader-transparent.webm" type="video/webm" />
      <source src="/loader.mp4" type="video/mp4" />
    </video>
  );
}
