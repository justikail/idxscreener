import { formatPercent } from "@/lib/format";

/**
 * Perubahan bertanda. Arah disampaikan dengan simbol ▲/▼ DAN warna, sehingga
 * tetap terbaca oleh pengguna buta warna.
 */
export function Delta({ value, className = "", variant = "text" }: { value: number | null; className?: string; variant?: "text" | "pill" }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={`num text-ink-400 ${className}`}>—</span>;
  }
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
  const tone =
    variant === "pill"
      ? dir === "up"
        ? "bg-up-600 text-paper"
        : dir === "down"
          ? "bg-down-500 text-paper"
          : "bg-ink-200 text-ink-700"
      : dir === "up"
        ? "text-up-600"
        : dir === "down"
          ? "text-down-500"
          : "text-ink-500";
  const shape = variant === "pill" ? "rounded-full px-2.5 py-0.5" : "";

  return (
    <span className={`num inline-flex items-center gap-1 whitespace-nowrap ${tone} ${shape} ${className}`}>
      <span aria-hidden className="text-[0.7em]">
        {glyph}
      </span>
      {formatPercent(value)}
    </span>
  );
}
