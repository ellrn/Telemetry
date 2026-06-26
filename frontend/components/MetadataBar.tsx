import { Activity, CalendarDays, Download, Gauge, MapPin, Settings } from "lucide-react";

interface TelemetryData {
  file: string;
  car: string;
  track: string;
  rows: number;
  columns: string[];
  data: Record<string, string | number | null>[];
  metadata?: Record<string, string | number | undefined>;
}

interface MetadataBarProps {
  telemetry: TelemetryData | null;
  onExport: () => void;
  darkMode: boolean;
}

function MetaItem({ label, value, icon }: { label: string, value?: string | number, icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-wide text-zinc-500">
        {icon} {label}
      </span>
      <span className="mt-1 block truncate font-mono text-sm" title={String(value ?? "-")}>{value || "-"}</span>
    </div>
  );
}

export default function MetadataBar({ telemetry, onExport, darkMode }: MetadataBarProps) {
  const metadata = telemetry?.metadata;
  const sampleRate = metadata?.sampleRate ?? metadata?.["Sample Rate"];
  const date = metadata?.date ?? metadata?.["Log Date"];

  return (
    <div className={`mb-6 grid grid-cols-2 gap-4 rounded-lg border p-4 md:grid-cols-4 lg:grid-cols-7 ${darkMode ? "border-white/10 bg-[#15181d]" : "border-zinc-200 bg-white"}`}>
      <MetaItem label="Session File" value={telemetry?.file} icon={<Settings size={16}/>} />
      <MetaItem label="Total Samples" value={telemetry?.rows} icon={<Activity size={16}/>} />
      <MetaItem label="Track" value={telemetry?.track} icon={<MapPin size={16}/>} />
      <MetaItem label="Vehicle" value={telemetry?.car} icon={<Gauge size={16}/>} />
      <MetaItem label="Sample Rate" value={sampleRate} />
      <MetaItem label="Date" value={date} icon={<CalendarDays size={16}/>} />
      <div className="col-span-2 flex items-center justify-center md:col-span-2 md:justify-end lg:col-span-1">
        <button onClick={onExport} className={`flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold uppercase tracking-wide ${darkMode ? "border-red-400/25 text-red-300 hover:bg-red-400/10" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
          <Download size={16} /> CSV
        </button>
      </div>
    </div>
  );
}
