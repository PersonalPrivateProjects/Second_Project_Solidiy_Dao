
// src/lib/timeHelpers.ts

export type DurationUnit = "seconds" | "minutes" | "hours" | "days";

/** Convierte un valor + unidad a segundos */
export function toSeconds(amount: number, unit: DurationUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (unit) {
    case "seconds": return amount;
    case "minutes": return amount * 60;
    case "hours":   return amount * 3600;
    case "days":    return amount * 86400;
    default:        return amount;
  }
}

/** Formatea segundos en una cadena legible (d h m s) */
export function formatDurationSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}
