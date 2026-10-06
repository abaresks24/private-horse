// Brand mark — the Private Horse logo extracted from the running-horse video.
// `src` picks the light-bg (/logo.png) or dark-bg (/logo-white.png) variant.

export default function HorseMark({
  size = 30,
  src = "/logo.png",
  alt = "Private Horse",
}: {
  size?: number;
  src?: string;
  alt?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} style={{ objectFit: "contain", display: "block" }} />;
}
