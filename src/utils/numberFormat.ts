export function formatTwoDecimals(value: any, fallback = "--"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(2);
}

export function formatNumericLikeCell(value: any): string {
  if (typeof value === "number") return value.toFixed(2);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n.toFixed(2);
    }
    return value;
  }

  if (value == null) return "";

  return String(value);
}
