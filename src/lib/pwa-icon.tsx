import { ImageResponse } from "next/og";

/** Full-bleed square icon (iOS rounds the corners itself and ignores transparency). */
export function renderIcon(px: number, glyphScale = 0.62) {
  const g = Math.round(px * glyphScale);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#9a4f15" }}>
        <svg width={g} height={g} viewBox="0 0 64 64">
          <path d="M12 24h32v14a12 12 0 0 1-12 12h-8a12 12 0 0 1-12-12V24z" fill="#fbf7f1" />
          <path d="M44 28h3a5 5 0 0 1 0 10h-3" fill="none" stroke="#fbf7f1" strokeWidth="4" strokeLinecap="round" />
          <path d="M22 10c-2 3 2 5 0 8M30 10c-2 3 2 5 0 8M38 10c-2 3 2 5 0 8" fill="none" stroke="#fbf7f1" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: px, height: px },
  );
}
