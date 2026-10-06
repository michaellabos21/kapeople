export function peso(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return (
    "₱" +
    v.toLocaleString("en-PH", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

export function qty(n: number | string, unit?: string): string {
  const v = Number(n);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, "");
  return unit ? `${s} ${unit}` : s;
}

export function timeAgo(iso: string | Date): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function dateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
