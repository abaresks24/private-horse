// Placeholder brand mark — a geometric horse-head (knight) silhouette.
// Swap for the logo extracted from the running-horse video by dropping public/logo.png and
// flipping USE_LOGO_PNG to true (the header will render the image instead).

export const USE_LOGO_PNG = false; // set true once public/logo.png is dropped in

const KNIGHT =
  "M58,96 L50,62 L43,55 L39,45 L28,47 L23,40 L31,35 L40,33 L44,22 " +
  "L50,15 L47,4 L57,13 L60,3 L67,15 L68,33 L74,60 L79,96 Z";

export default function HorseMark({ size = 30, color = "currentColor" }: { size?: number; color?: string }) {
  if (USE_LOGO_PNG) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/logo.png" alt="Private Horse" width={size} height={size} style={{ objectFit: "contain" }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Private Horse" role="img">
      <path d={KNIGHT} fill={color} />
    </svg>
  );
}
