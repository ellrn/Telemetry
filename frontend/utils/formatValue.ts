export function formatValue(key: string, val: unknown): string {
  if (val == null) return "-";

  const num = Number(val);

  if (Number.isFinite(num)) {
    const label = key.toLowerCase();

    if (label.includes("time")) return num.toFixed(3);
    if (label.includes("gear")) return String(Math.round(num));
    const isInputPercent =
      label.includes("throttle") ||
      label === "brake" ||
      label.includes("brake pos") ||
      label.includes("brake input");

    if (isInputPercent) {
      return `${Math.round(num > 1 ? num : num * 100)}%`;
    }
    if (Math.abs(num) >= 1000) {
      return new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(num);
    }
    if (Number.isInteger(num)) return num.toLocaleString();

    return num.toLocaleString("en", {
      maximumFractionDigits: 2,
      minimumFractionDigits: Math.abs(num) < 10 ? 2 : 0,
    });
  }

  return String(val);
}
