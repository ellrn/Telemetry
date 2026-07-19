export function formatNumber(val: number): string {
  if (!Number.isFinite(val)) return "-";

  return val.toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatValue(key: string, val: unknown): string {
  if (val == null) return "-";

  const num = Number(val);

  if (Number.isFinite(num)) {
    const label = key.toLowerCase();

    if (label.includes("time")) return formatNumber(num);
    if (label.includes("gear")) return String(Math.round(num));
    const isInputPercent =
      label.includes("throttle") ||
      label === "brake" ||
      label.includes("brake pos") ||
      label.includes("brake input");

    if (isInputPercent) {
      return `${formatNumber(num > 1 ? num : num * 100)}%`;
    }

    return formatNumber(num);
  }

  return String(val);
}
