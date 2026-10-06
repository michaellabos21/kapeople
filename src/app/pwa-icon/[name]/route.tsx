import { renderIcon } from "@/lib/pwa-icon";

export const dynamic = "force-static";

const ICONS: Record<string, [number, number]> = {
  "192": [192, 0.62],
  "512": [512, 0.62],
  maskable: [512, 0.5], // extra padding: Android crops maskable icons to a circle/squircle
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const [px, scale] = ICONS[(await ctx.params).name] ?? ICONS["512"];
  return renderIcon(px, scale);
}
