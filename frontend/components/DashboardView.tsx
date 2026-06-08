import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { formatValue } from "../utils/formatValue";

interface ChartDataPoint {
  time: number;
  speed?: number;
  rpm?: number;
  throttle?: number;
  brake?: number;
  steering?: number;
  [key: string]: string | number | null | undefined;
}

interface DashboardViewProps {
  chartData: {
    columns: string[];
    data: ChartDataPoint[];
  };
  darkMode: boolean;
}

function ChartCard({
  children,
  title,
  subtitle,
  darkMode,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  darkMode: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
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
      </div>
      {children}
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

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function findColumn(columns: string[], candidates: string[]) {
  const normalized = new Map(
    columns.map((column) => [column.toLowerCase().replace(/[\s_-]/g, ""), column])
  );

  for (const candidate of candidates) {
    const match = normalized.get(candidate.toLowerCase().replace(/[\s_-]/g, ""));
    if (match) return match;
  }

  return null;
}

export default function DashboardView({
  chartData,
  darkMode,
}: DashboardViewProps) {
  const scales = chartScales(darkMode);
  const tooltip = tooltipTheme(darkMode);
  const axisProps = {
    stroke: scales.axis,
    fontSize: 12,
    tickLine: false,
    axisLine: false,
  };
  const timeColumn = findColumn(chartData.columns, ["time"]) ?? "time";
  const speedColumn = findColumn(chartData.columns, ["Ground Speed", "speed", "velocity"]);
  const rpmColumn = findColumn(chartData.columns, ["Engine RPM", "rpm", "engine rpm", "engineRPM"]);
  const throttleColumn = findColumn(chartData.columns, ["Throttle Pos", "throttle", "throttle input", "gas"]);
  const brakeColumn = findColumn(chartData.columns, ["Brake Pos", "brake", "brake input"]);

  if (!speedColumn && !rpmColumn && !throttleColumn && !brakeColumn) {
    return (
      <div className={`rounded-lg border p-8 text-sm ${darkMode ? "border-white/10 bg-[#15181d] text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"}`}>
        Backend telemetry loaded, but no speed, RPM, throttle, or brake columns were found for charts.
      </div>
    );
  }

  return (
    <div className="space-y-5">

      <div className="grid gap-5 lg:grid-cols-2">

        {speedColumn && (
        <ChartCard title="Speed Trace" subtitle="km/h over session time" darkMode={darkMode}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData.data} margin={{ top: 12, right: 18, bottom: 4, left: 2 }}>
              <CartesianGrid
                stroke={scales.grid}
                vertical={false}
              />

              <XAxis
                dataKey={timeColumn}
                {...axisProps}
                tickFormatter={(value) => `${value}s`}
              />

              <YAxis
                {...axisProps}
                tickFormatter={(value) => compactNumber.format(Number(value))}
              />

              <Tooltip
                {...tooltip}
                formatter={(value, name) => [formatValue(String(name), value), String(name)]}
                labelFormatter={(value) => `Time ${Number(value).toFixed(3)}s`}
                cursor={{ stroke: darkMode ? "rgba(248,113,113,0.38)" : "rgba(220,38,38,0.32)", strokeWidth: 1 }}
              />

              <Line
                type="monotone"
                dataKey={speedColumn}
                name="Speed"
                stroke="#38bdf8"
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: "#38bdf8" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        )}

        {rpmColumn && (
        <ChartCard title="Engine RPM" subtitle="Power delivery and shift windows" darkMode={darkMode}>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData.data} margin={{ top: 12, right: 18, bottom: 4, left: 2 }}>
              <CartesianGrid
                stroke={scales.grid}
                vertical={false}
              />

              <XAxis
                dataKey={timeColumn}
                {...axisProps}
                tickFormatter={(value) => `${value}s`}
              />

              <YAxis
                {...axisProps}
                tickFormatter={(value) => compactNumber.format(Number(value))}
              />

              <Tooltip
                {...tooltip}
                formatter={(value, name) => [formatValue(String(name), value), String(name)]}
                labelFormatter={(value) => `Time ${Number(value).toFixed(3)}s`}
                cursor={{ stroke: darkMode ? "rgba(248,113,113,0.38)" : "rgba(220,38,38,0.32)", strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey={rpmColumn}
                name="RPM"
                stroke="#f97316"
                strokeWidth={2.2}
                fill="#f97316"
                fillOpacity={0.14}
                activeDot={{ r: 4, strokeWidth: 0, fill: "#f97316" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        )}
      </div>

      {(throttleColumn || brakeColumn) && (
      <ChartCard title="Driver Inputs" subtitle="Throttle and brake correlation" darkMode={darkMode}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData.data} margin={{ top: 12, right: 18, bottom: 4, left: 2 }}>
            <CartesianGrid
              vertical={false}
              stroke={scales.grid}
            />

            <XAxis
              dataKey={timeColumn}
              {...axisProps}
              tickFormatter={(value) => `${value}s`}
            />

            <YAxis
              domain={[0, 100]}
              {...axisProps}
              tickFormatter={(value) => `${Math.round(Number(value))}%`}
            />

            <Tooltip
              {...tooltip}
              formatter={(value, name) => [formatValue(String(name), value), String(name)]}
              labelFormatter={(value) => `Time ${Number(value).toFixed(3)}s`}
              cursor={{ stroke: darkMode ? "rgba(248,113,113,0.38)" : "rgba(220,38,38,0.32)", strokeWidth: 1 }}
            />

            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />

            {throttleColumn && (
            <Line
              type="monotone"
              dataKey={throttleColumn}
              name="Throttle"
              stroke="#22c55e"
              strokeWidth={2.3}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#22c55e" }}
            />
            )}

            {brakeColumn && (
            <Line
              type="monotone"
              dataKey={brakeColumn}
              name="Brake"
              stroke="#ef4444"
              strokeWidth={2.3}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: "#ef4444" }}
            />
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      )}
    </div>
  );
}
