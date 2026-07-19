import { useCallback, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { formatNumber, formatValue } from "../utils/formatValue";

interface TelemetryRow {
  [key: string]: string | number | null | undefined;
}

interface TimeDataPoint {
  time: number;
}

interface ChartDataPoint extends TimeDataPoint {
  [key: string]: number | null | undefined;
}

type TimeRange = [number, number];

interface DashboardViewProps {
  chartData: {
    columns: string[];
    data: TelemetryRow[];
  };
  darkMode: boolean;
}

const MAX_CHART_POINTS = 900;
const INPUT_VALUE_KEYS = ["throttle", "brake"];
const MIN_VISIBLE_SECONDS = 1;

function ChartCard({
  children,
  title,
  subtitle,
  darkMode,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  darkMode: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={`w-full min-w-0 overflow-hidden rounded-lg border p-4 shadow-sm ${
        darkMode
          ? "border-white/10 bg-[#15181d]"
          : "border-zinc-200 bg-white"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function TimelineControls({
  canNavigate,
  darkMode,
  sessionRange,
  visibleTimeRange,
  scrollbarMax,
  scrollbarStep,
  onPanStartChange,
  onReset,
  onZoomIn,
  onZoomOut,
}: {
  canNavigate: boolean;
  darkMode: boolean;
  sessionRange: TimeRange | null;
  visibleTimeRange: TimeRange | null;
  scrollbarMax: number;
  scrollbarStep: number;
  onPanStartChange: (start: number) => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const disabled = !sessionRange || !visibleTimeRange;
  const isFullSession = disabled || rangesEqual(sessionRange, visibleTimeRange);
  const buttonClass = `flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${
    darkMode
      ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:text-zinc-600"
      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
  } disabled:cursor-not-allowed disabled:opacity-60`;

  return (
    <div
      className={`rounded-lg border p-4 ${
        darkMode ? "border-white/10 bg-[#15181d]" : "border-zinc-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={onZoomIn}
            disabled={disabled}
            title="Zoom in"
          >
            <ZoomIn size={15} />
            Zoom In
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={onZoomOut}
            disabled={disabled}
            title="Zoom out"
          >
            <ZoomOut size={15} />
            Zoom Out
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={onReset}
            disabled={isFullSession}
            title="Reset zoom"
          >
            <RotateCcw size={15} />
            Reset Zoom
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            className="h-2 w-full cursor-pointer accent-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            min={sessionRange?.[0] ?? 0}
            max={scrollbarMax}
            step={scrollbarStep}
            value={visibleTimeRange?.[0] ?? 0}
            onChange={(event) => onPanStartChange(Number(event.target.value))}
            disabled={!canNavigate}
            aria-label="Scroll telemetry timeline"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
            <span>
              View {formatAxisTime(visibleTimeRange?.[0])}–{formatAxisTime(visibleTimeRange?.[1])}
            </span>
            <span>Session {formatAxisTime(sessionRange?.[0])}–{formatAxisTime(sessionRange?.[1])}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function tooltipTheme(darkMode: boolean) {
  return {
    contentStyle: {
      backgroundColor: darkMode ? "#181b20" : "#ffffff",
      border: `1px solid ${darkMode ? "rgba(255,255,255,0.12)" : "#e4e4e7"}`,
      borderRadius: 8,
      boxShadow: "0 18px 40px rgba(0, 0, 0, 0.22)",
      color: darkMode ? "#f4f4f5" : "#18181b",
    },
    labelStyle: { color: darkMode ? "#a1a1aa" : "#71717a", marginBottom: 8 },
    itemStyle: { fontSize: 12 },
  };
}

function chartScales(darkMode: boolean) {
  return {
    grid: darkMode ? "rgba(255,255,255,0.08)" : "rgba(39,39,42,0.1)",
    axis: darkMode ? "#a1a1aa" : "#71717a",
  };
}

function normalizeColumnKey(column: string) {
  return column.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(columns: string[], candidates: string[]) {
  const normalized = new Map(
    columns.map((column) => [normalizeColumnKey(column), column])
  );
  const normalizedColumns = columns.map((column) => ({
    column,
    key: normalizeColumnKey(column),
  }));

  for (const candidate of candidates) {
    const match = normalized.get(normalizeColumnKey(candidate));
    if (match) return match;
  }

  for (const candidate of candidates) {
    const candidateKey = normalizeColumnKey(candidate);
    const match = normalizedColumns.find(
      ({ key }) => key.startsWith(candidateKey) || key.includes(candidateKey)
    );

    if (match) return match.column;
  }

  return null;
}

function numericValue(row: TelemetryRow | ChartDataPoint, column: string | null) {
  if (!column) return null;

  const value = row[column];

  if (value == null) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (
      trimmed === "" ||
      trimmed.toLowerCase() === "nan" ||
      trimmed.toLowerCase() === "null" ||
      trimmed.toLowerCase() === "none"
    ) {
      return null;
    }
  }

  const numberValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatClockTime(value: unknown) {
  const time = Number(value);

  if (!Number.isFinite(time)) return "-";

  const sign = time < 0 ? "-" : "";
  const absoluteTime = Math.abs(time);
  const minutes = Math.floor(absoluteTime / 60);
  const seconds = absoluteTime - minutes * 60;
  const wholeSeconds = Math.floor(seconds);
  const fractionalSeconds = seconds - wholeSeconds;
  const fractionalText = fractionalSeconds > 1e-9 ? `.${Math.round(fractionalSeconds * 1000).toString().padStart(3, "0")}` : "";

  return `${sign}${minutes}:${wholeSeconds.toString().padStart(2, "0")}${fractionalText}`;
}

function formatAxisTime(value: unknown) {
  const time = Number(value);

  if (!Number.isFinite(time)) return "-";

  const sign = time < 0 ? "-" : "";
  const absoluteTime = Math.abs(time);
  const minutes = Math.floor(absoluteTime / 60);
  const seconds = Math.floor(absoluteTime - minutes * 60);

  return `${sign}${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTooltipTime(value: unknown) {
  return formatClockTime(value);
}

function formatTooltipValue(
  value: unknown,
  name: unknown,
  item: { dataKey?: unknown; payload?: unknown }
) {
  const dataKey =
    typeof item.dataKey === "string" || typeof item.dataKey === "number"
      ? String(item.dataKey)
      : null;
  const payload =
    item.payload && typeof item.payload === "object"
      ? (item.payload as ChartDataPoint)
      : null;
  const rowValue = dataKey && payload ? payload[dataKey] : value;
  const label = String(name);
  const numericRowValue = Number(rowValue);

  if (
    Number.isFinite(numericRowValue) &&
    (label.toLowerCase().includes("throttle") ||
      label.toLowerCase().includes("brake"))
  ) {
    return [`${formatNumber(numericRowValue)}%`, label] as [string, string];
  }

  return [formatValue(label, rowValue), label] as [string, string];
}

function niceTimeStep(range: number, targetIntervals: number) {
  const roughStep = range / targetIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;

  if (normalizedStep <= 1) return magnitude;
  if (normalizedStep <= 2) return 2 * magnitude;
  if (normalizedStep <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function timeTickStep(range: number) {
  const targetIntervals = range <= 60 ? 15 : 12;

  return Math.max(1, niceTimeStep(range, targetIntervals));
}

function timeRangeFromRows(rows: TimeDataPoint[]): TimeRange | null {
  const times = rows
    .map((row) => row.time)
    .filter((time): time is number => Number.isFinite(time));

  if (times.length === 0) return null;

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  return minTime === maxTime ? [minTime, minTime + MIN_VISIBLE_SECONDS] : [minTime, maxTime];
}

function buildTimeTicksForRange(range: TimeRange | null) {
  if (!range) return [];

  const [minTime, maxTime] = range;
  const width = maxTime - minTime;

  if (width <= 0) return [minTime];

  const step = timeTickStep(width);
  const tickStart = Math.ceil(minTime / step) * step;
  const tickEnd = Math.floor(maxTime / step) * step;
  const ticks: number[] = [minTime];

  for (let tick = tickStart; tick <= tickEnd + step / 2; tick += step) {
    const fixedTick = Number(tick.toFixed(6));

    if (fixedTick > minTime && fixedTick < maxTime) {
      ticks.push(fixedTick);
    }
  }

  ticks.push(maxTime);

  return ticks;
}

function clampRange(range: TimeRange, bounds: TimeRange): TimeRange {
  const [boundsStart, boundsEnd] = bounds;
  const maxWidth = boundsEnd - boundsStart;
  const safeStart = Number.isFinite(range[0]) ? range[0] : boundsStart;
  const safeEnd = Number.isFinite(range[1]) ? range[1] : boundsEnd;
  const requestedWidth = Math.max(MIN_VISIBLE_SECONDS, safeEnd - safeStart);
  const width = Math.min(requestedWidth, Math.max(MIN_VISIBLE_SECONDS, maxWidth));

  if (maxWidth <= MIN_VISIBLE_SECONDS) return [boundsStart, boundsEnd];

  let start = safeStart;

  if (start < boundsStart) start = boundsStart;
  if (start + width > boundsEnd) start = boundsEnd - width;

  return [Number(start.toFixed(6)), Number((start + width).toFixed(6))];
}

function zoomRange(range: TimeRange, bounds: TimeRange, factor: number) {
  const center = (range[0] + range[1]) / 2;
  const nextWidth = (range[1] - range[0]) * factor;

  return clampRange([center - nextWidth / 2, center + nextWidth / 2], bounds);
}

function panRange(range: TimeRange, bounds: TimeRange, delta: number) {
  return clampRange([range[0] + delta, range[1] + delta], bounds);
}

function rangesEqual(a: TimeRange | null, b: TimeRange | null) {
  if (!a || !b) return a === b;

  return a[0] === b[0] && a[1] === b[1];
}

function resolveBrushIndexes(rows: ChartDataPoint[], range: TimeRange | null) {
  if (!rows.length || !range) {
    return { startIndex: 0, endIndex: rows.length > 0 ? rows.length - 1 : 0 };
  }

  const safeRange = Number.isFinite(range[0]) && Number.isFinite(range[1]) ? range : [rows[0].time, rows[rows.length - 1].time];
  let startIndex = 0;
  while (startIndex < rows.length && rows[startIndex].time < safeRange[0]) {
    startIndex += 1;
  }

  let endIndex = rows.length - 1;
  while (endIndex >= 0 && rows[endIndex].time > safeRange[1]) {
    endIndex -= 1;
  }

  const clampedStart = Math.min(Math.max(startIndex, 0), Math.max(rows.length - 1, 0));
  const clampedEnd = Math.min(Math.max(endIndex, 0), Math.max(rows.length - 1, 0));

  return {
    startIndex: Math.min(clampedStart, clampedEnd),
    endIndex: Math.max(clampedStart, clampedEnd),
  };
}

function buildTimeRows(rows: TelemetryRow[], timeColumn: string) {
  return rows
    .map((row) => {
      const time = numericValue(row, timeColumn);

      return time === null ? null : { time };
    })
    .filter((row): row is TimeDataPoint => row !== null);
}

function sortByTime(rows: ChartDataPoint[]) {
  return [...rows].sort((a, b) => a.time - b.time);
}

function chartPointValue(row: ChartDataPoint, valueKeys: string[]) {
  let total = 0;
  let count = 0;

  for (const key of valueKeys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      count += 1;
    }
  }

  return count === 0 ? 0 : total / count;
}

function averagePoint(rows: ChartDataPoint[], valueKeys: string[]) {
  let timeTotal = 0;
  let valueTotal = 0;

  for (const row of rows) {
    timeTotal += row.time;
    valueTotal += chartPointValue(row, valueKeys);
  }

  return {
    time: timeTotal / rows.length,
    value: valueTotal / rows.length,
  };
}

function triangleArea(
  a: ChartDataPoint,
  b: ChartDataPoint,
  c: { time: number; value: number },
  valueKeys: string[]
) {
  const ay = chartPointValue(a, valueKeys);
  const by = chartPointValue(b, valueKeys);

  return Math.abs((a.time - c.time) * (by - ay) - (a.time - b.time) * (c.value - ay)) / 2;
}

function downsampleChartRows(
  rows: ChartDataPoint[],
  valueKeys: string[],
  maxPoints = MAX_CHART_POINTS
) {
  const sortedRows = sortByTime(rows);

  if (sortedRows.length <= maxPoints) return sortedRows;
  if (maxPoints < 3) return sortedRows.slice(0, maxPoints);

  const sampled: ChartDataPoint[] = [sortedRows[0]];
  const bucketSize = (sortedRows.length - 2) / (maxPoints - 2);
  let selectedIndex = 0;

  for (let i = 0; i < maxPoints - 2; i += 1) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.floor((i + 2) * bucketSize) + 1;
    const bucket = sortedRows.slice(bucketStart, bucketEnd);
    const nextBucket = sortedRows.slice(
      nextBucketStart,
      Math.min(nextBucketEnd, sortedRows.length)
    );
    const average = averagePoint(
      nextBucket.length > 0 ? nextBucket : [sortedRows[sortedRows.length - 1]],
      valueKeys
    );
    let maxArea = -1;
    let nextSelectedIndex = bucketStart;

    for (let j = 0; j < bucket.length; j += 1) {
      const area = triangleArea(sortedRows[selectedIndex], bucket[j], average, valueKeys);

      if (area > maxArea) {
        maxArea = area;
        nextSelectedIndex = bucketStart + j;
      }
    }

    sampled.push(sortedRows[nextSelectedIndex]);
    selectedIndex = nextSelectedIndex;
  }

  sampled.push(sortedRows[sortedRows.length - 1]);

  return sampled;
}

function inputPercentScale(rows: TelemetryRow[], column: string | null) {
  if (!column) return 1;

  const values = rows
    .map((row) => numericValue(row, column))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return 1;

  const maxValue = Math.max(...values.map((value) => Math.abs(value)));

  return maxValue > 0 && maxValue <= 1 ? 100 : 1;
}

function normalizeInputPercent(value: number | null, scale: number) {
  if (value === null) return null;

  return Math.max(0, Math.min(100, value * scale));
}

function addUniquePoint(
  points: Map<number, ChartDataPoint>,
  row: ChartDataPoint
) {
  points.set(row.time, row);
}

function downsampleDriverInputRows(
  rows: ChartDataPoint[],
  maxPoints = MAX_CHART_POINTS
) {
  const sortedRows = sortByTime(rows);

  if (sortedRows.length <= maxPoints) return sortedRows;
  if (maxPoints < 3) return sortedRows.slice(0, maxPoints);

  const points = new Map<number, ChartDataPoint>();
  const bucketCount = Math.max(
    1,
    Math.floor((maxPoints - 2) / (INPUT_VALUE_KEYS.length * 2))
  );
  const bucketSize = sortedRows.length / bucketCount;

  addUniquePoint(points, sortedRows[0]);
  addUniquePoint(points, sortedRows[sortedRows.length - 1]);

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const bucketStart = Math.floor(bucketIndex * bucketSize);
    const bucketEnd = Math.min(
      sortedRows.length,
      Math.floor((bucketIndex + 1) * bucketSize)
    );
    const bucket = sortedRows.slice(bucketStart, bucketEnd);

    for (const key of INPUT_VALUE_KEYS) {
      let minRow: ChartDataPoint | null = null;
      let maxRow: ChartDataPoint | null = null;

      for (const row of bucket) {
        const value = row[key];

        if (typeof value !== "number" || !Number.isFinite(value)) continue;

        if (minRow === null || value < Number(minRow[key])) minRow = row;
        if (maxRow === null || value > Number(maxRow[key])) maxRow = row;
      }

      if (minRow) addUniquePoint(points, minRow);
      if (maxRow) addUniquePoint(points, maxRow);
    }
  }

  return Array.from(points.values()).sort((a, b) => a.time - b.time);
}

function buildMetricSeries(
  rows: TelemetryRow[],
  timeColumn: string,
  sourceColumn: string | null,
  valueKey: string,
  visibleRange: [number, number] | null
) {
  if (!sourceColumn) return [];

  const series = rows
    .map<ChartDataPoint | null>((row) => {
      const time = numericValue(row, timeColumn);
      const value = numericValue(row, sourceColumn);

      if (time === null || value === null) return null;
      if (visibleRange && (time < visibleRange[0] || time > visibleRange[1])) {
        return null;
      }

      return { time, [valueKey]: value };
    })
    .filter((row): row is ChartDataPoint => row !== null);

  return downsampleChartRows(series, [valueKey]);
}

function buildDriverInputSeries(
  rows: TelemetryRow[],
  timeColumn: string,
  throttleColumn: string | null,
  brakeColumn: string | null,
  visibleRange: [number, number] | null
) {
  if (!throttleColumn && !brakeColumn) return [];

  const throttleScale = inputPercentScale(rows, throttleColumn);
  const brakeScale = inputPercentScale(rows, brakeColumn);
  const series = rows
    .map<ChartDataPoint | null>((row) => {
      const time = numericValue(row, timeColumn);

      if (time === null) return null;
      if (visibleRange && (time < visibleRange[0] || time > visibleRange[1])) {
        return null;
      }

      const throttle = normalizeInputPercent(
        numericValue(row, throttleColumn),
        throttleScale
      );
      const brakeValue = normalizeInputPercent(
        numericValue(row, brakeColumn),
        brakeScale
      );
      const brake = brakeValue !== null && brakeValue > 0 ? brakeValue : null;

      if (throttle === null && brake === null) return null;

      return {
        time,
        throttle,
        brake,
      };
    })
    .filter((row): row is ChartDataPoint => row !== null);

  return downsampleDriverInputRows(series);
}

export default function DashboardView({
  chartData,
  darkMode,
}: DashboardViewProps) {
  const scales = chartScales(darkMode);
  const tooltip = tooltipTheme(darkMode);
  const tooltipCursor = {
    stroke: darkMode ? "rgba(248,113,113,0.38)" : "rgba(220,38,38,0.32)",
    strokeWidth: 1,
  };
  const chartTooltipProps = {
    ...tooltip,
    formatter: formatTooltipValue,
    labelFormatter: (value: unknown) => `Time ${formatTooltipTime(value)}`,
    cursor: { ...tooltipCursor, strokeDasharray: "3 3" },
    filterNull: true,
    shared: true,
  };
  const axisProps = {
    stroke: scales.axis,
    fontSize: 12,
    tickLine: false,
    axisLine: false,
  };
  const timeColumn = findColumn(chartData.columns, ["time", "time s", "timestamp"]) ?? "time";
  const speedColumn = findColumn(chartData.columns, ["Ground Speed", "Ground Speed km h", "Speed km h", "speed", "velocity"]);
  const rpmColumn = findColumn(chartData.columns, ["Engine RPM", "Engine RPM rpm", "rpm", "engineRPM", "rpms"]);
  const throttleColumn = findColumn(chartData.columns, ["Throttle Pos", "Throttle Position", "throttle", "throttle input", "gas"]);
  const brakeColumn = findColumn(chartData.columns, ["Brake Pos", "Brake Position", "brake", "brake input"]);
  const timeRows = useMemo(
    () => buildTimeRows(chartData.data, timeColumn),
    [chartData.data, timeColumn]
  );
  const sessionRange = useMemo(() => timeRangeFromRows(timeRows), [timeRows]);
  const [viewRange, setViewRange] = useState<TimeRange | null>(null);
  const visibleTimeRange = useMemo(() => {
    if (!sessionRange) return null;
    if (!viewRange) return sessionRange;

    return clampRange(viewRange, sessionRange);
  }, [sessionRange, viewRange]);
  const safeVisibleTimeRange = visibleTimeRange &&
    Number.isFinite(visibleTimeRange[0]) &&
    Number.isFinite(visibleTimeRange[1])
    ? visibleTimeRange
    : sessionRange;
  const timeTicks = useMemo(() => {
    const ticks = buildTimeTicksForRange(safeVisibleTimeRange);

    if (ticks.length <= 8) return ticks;

    const sampleStep = Math.ceil(ticks.length / 8);
    const sampledTicks = [ticks[0]];

    for (let index = sampleStep; index < ticks.length - 1; index += sampleStep) {
      sampledTicks.push(ticks[index]);
    }

    sampledTicks.push(ticks[ticks.length - 1]);

    return sampledTicks;
  }, [safeVisibleTimeRange]);
  const timeDomain = safeVisibleTimeRange
    ? safeVisibleTimeRange
    : (["dataMin", "dataMax"] as [string, string]);
  const sessionDuration = sessionRange ? sessionRange[1] - sessionRange[0] : 0;
  const visibleDuration = safeVisibleTimeRange ? safeVisibleTimeRange[1] - safeVisibleTimeRange[0] : 0;
  const canNavigate = Boolean(sessionRange && safeVisibleTimeRange) && !rangesEqual(sessionRange, safeVisibleTimeRange);
  const scrollbarMax = sessionRange && safeVisibleTimeRange ? sessionRange[1] - visibleDuration : 0;
  const scrollbarStep = Math.max(0.01, sessionDuration / 1000);
  const setVisibleRange = useCallback((range: TimeRange) => {
    if (!sessionRange) return;

    setViewRange(clampRange(range, sessionRange));
  }, [sessionRange]);
  const zoomView = useCallback((factor: number) => {
    if (!sessionRange || !safeVisibleTimeRange) return;

    setViewRange(zoomRange(safeVisibleTimeRange, sessionRange, factor));
  }, [safeVisibleTimeRange, sessionRange]);
  const resetView = useCallback(() => {
    setViewRange(sessionRange);
  }, [sessionRange]);
  const speedRows = useMemo(
    () => buildMetricSeries(chartData.data, timeColumn, speedColumn, "speed", safeVisibleTimeRange),
    [chartData.data, speedColumn, timeColumn, safeVisibleTimeRange]
  );
  const rpmRows = useMemo(
    () => buildMetricSeries(chartData.data, timeColumn, rpmColumn, "rpm", safeVisibleTimeRange),
    [chartData.data, rpmColumn, timeColumn, safeVisibleTimeRange]
  );
  const driverInputRows = useMemo(
    () =>
      buildDriverInputSeries(
        chartData.data,
        timeColumn,
        throttleColumn,
        brakeColumn,
        safeVisibleTimeRange
      ),
    [brakeColumn, chartData.data, throttleColumn, timeColumn, safeVisibleTimeRange]
  );
  const speedOverviewRows = useMemo(
    () => buildMetricSeries(chartData.data, timeColumn, speedColumn, "speed", null),
    [chartData.data, speedColumn, timeColumn]
  );
  const rpmOverviewRows = useMemo(
    () => buildMetricSeries(chartData.data, timeColumn, rpmColumn, "rpm", null),
    [chartData.data, rpmColumn, timeColumn]
  );
  const driverInputOverviewRows = useMemo(
    () =>
      buildDriverInputSeries(
        chartData.data,
        timeColumn,
        throttleColumn,
        brakeColumn,
        null
      ),
    [brakeColumn, chartData.data, throttleColumn, timeColumn]
  );
  const brushSelection = useMemo(() => {
    if (speedOverviewRows.length > 0) {
      return resolveBrushIndexes(speedOverviewRows, safeVisibleTimeRange);
    }

    if (rpmOverviewRows.length > 0) {
      return resolveBrushIndexes(rpmOverviewRows, safeVisibleTimeRange);
    }

    return resolveBrushIndexes(driverInputOverviewRows, safeVisibleTimeRange);
  }, [driverInputOverviewRows, rpmOverviewRows, safeVisibleTimeRange, speedOverviewRows]);
  const timeAxisProps = {
    ...axisProps,
    type: "number" as const,
    scale: "linear" as const,
    domain: timeDomain,
    ticks: timeTicks,
    interval: "preserveStartEnd" as const,
    minTickGap: 24,
    tickMargin: 8,
    tickFormatter: formatAxisTime,
  };
  const chartActions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
          darkMode
            ? "border-white/10 text-zinc-300 hover:bg-white/10"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        }`}
        onClick={() => zoomView(0.8)}
        disabled={!safeVisibleTimeRange}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomIn size={15} />
      </button>
      <button
        type="button"
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
          darkMode
            ? "border-white/10 text-zinc-300 hover:bg-white/10"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        }`}
        onClick={() => zoomView(1.25)}
        disabled={!safeVisibleTimeRange}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOut size={15} />
      </button>
      <button
        type="button"
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
          darkMode
            ? "border-white/10 text-zinc-300 hover:bg-white/10"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        } disabled:cursor-not-allowed disabled:opacity-50`}
        onClick={resetView}
        disabled={!sessionRange || !safeVisibleTimeRange || rangesEqual(sessionRange, safeVisibleTimeRange)}
        title="Reset zoom"
        aria-label="Reset zoom"
      >
        <RotateCcw size={15} />
      </button>
    </div>
  );

  if (!speedColumn && !rpmColumn && !throttleColumn && !brakeColumn) {
    return (
      <div className={`rounded-lg border p-8 text-sm ${darkMode ? "border-white/10 bg-[#15181d] text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"}`}>
        Backend telemetry loaded, but no speed, RPM, throttle, or brake columns were found for charts.
      </div>
    );
  }

  if (speedRows.length === 0 && rpmRows.length === 0 && driverInputRows.length === 0) {
    return (
      <div className={`rounded-lg border p-8 text-sm ${darkMode ? "border-white/10 bg-[#15181d] text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"}`}>
        Backend telemetry loaded, but the chart columns did not contain finite numeric values.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TimelineControls
        canNavigate={canNavigate}
        darkMode={darkMode}
        sessionRange={sessionRange}
        visibleTimeRange={safeVisibleTimeRange}
        scrollbarMax={scrollbarMax}
        scrollbarStep={scrollbarStep}
        onPanStartChange={(start) => {
          if (!safeVisibleTimeRange) return;

          const width = safeVisibleTimeRange[1] - safeVisibleTimeRange[0];
          setVisibleRange([start, start + width]);
        }}
        onReset={resetView}
        onZoomIn={() => zoomView(0.8)}
        onZoomOut={() => zoomView(1.25)}
      />

      <div className="grid gap-5 lg:grid-cols-2">

        {speedColumn && speedRows.length > 0 && (
        <ChartCard title="Speed Trace" subtitle="km/h over session time" darkMode={darkMode} actions={chartActions}>
          <div className="relative w-full min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={speedRows} margin={{ top: 12, right: 18, bottom: 4, left: 2 }} syncId="telemetry">
              <CartesianGrid
                stroke={scales.grid}
                vertical={false}
                strokeDasharray="2 2"
              />

              <XAxis
                dataKey="time"
                {...timeAxisProps}
              />

              <YAxis
                {...axisProps}
                tickFormatter={(value) => formatNumber(Number(value))}
              />

              <Tooltip
                {...chartTooltipProps}
              />

              <Line
                type="stepAfter"
                dataKey="speed"
                name="Speed"
                stroke="#38bdf8"
                fill="none"
                strokeWidth={1.8}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={{ r: 3.5, stroke: "#38bdf8", strokeWidth: 1.5, fill: "transparent" }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </ChartCard>
        )}

        {rpmColumn && rpmRows.length > 0 && (
        <ChartCard title="Engine RPM" subtitle="Power delivery and shift windows" darkMode={darkMode} actions={chartActions}>
          <div className="relative w-full min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rpmRows} margin={{ top: 12, right: 18, bottom: 4, left: 2 }} syncId="telemetry">
              <CartesianGrid
                stroke={scales.grid}
                vertical={false}
                strokeDasharray="2 2"
              />

              <XAxis
                dataKey="time"
                {...timeAxisProps}
              />

              <YAxis
                {...axisProps}
                tickFormatter={(value) => formatNumber(Number(value))}
              />

              <Tooltip
                {...chartTooltipProps}
              />

              <Line
                type="stepAfter"
                dataKey="rpm"
                name="RPM"
                stroke="#f97316"
                fill="none"
                strokeWidth={1.8}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={{ r: 3.5, stroke: "#f97316", strokeWidth: 1.5, fill: "transparent" }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </ChartCard>
        )}
      </div>

      {(throttleColumn || brakeColumn) && driverInputRows.length > 0 && (
      <ChartCard title="Driver Inputs" subtitle="Throttle and brake correlation" darkMode={darkMode} actions={chartActions}>
        <div className="relative w-full min-w-0 overflow-hidden">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={driverInputRows} margin={{ top: 12, right: 18, bottom: 4, left: 2 }} syncId="telemetry">
            <CartesianGrid
              vertical={false}
              stroke={scales.grid}
              strokeDasharray="2 2"
            />

            <XAxis
              dataKey="time"
              {...timeAxisProps}
            />

            <YAxis
              domain={[0, 100]}
              {...axisProps}
              tickFormatter={(value) => `${formatNumber(Number(value))}%`}
            />

            <Tooltip
              {...chartTooltipProps}
            />

            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />

            {throttleColumn && (
            <Line
              type="stepAfter"
              dataKey="throttle"
              name="Throttle"
              stroke="#22c55e"
              fill="none"
              strokeWidth={1.8}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={{ r: 3.5, stroke: "#22c55e", strokeWidth: 1.5, fill: "transparent" }}
            />
            )}

            {brakeColumn && (
            <Line
              type="stepAfter"
              dataKey="brake"
              name="Brake"
              stroke="#ef4444"
              fill="none"
              strokeWidth={1.8}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={{ r: 3.5, stroke: "#ef4444", strokeWidth: 1.5, fill: "transparent" }}
            />
            )}
          </LineChart>
        </ResponsiveContainer>
        </div>
      </ChartCard>
      )}
    </div>
  );
}
