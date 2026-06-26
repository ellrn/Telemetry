import { Activity, FileUp, Moon, RefreshCw, Sun } from "lucide-react";

interface HeaderProps {
  selectedCsvFile: File | null;
  setSelectedCsvFile: (file: File | null) => void;
  darkMode: boolean;
  setDarkMode: (mode: boolean) => void;
  loading?: boolean;
}

export default function Header({ selectedCsvFile, setSelectedCsvFile, darkMode, setDarkMode, loading = false }: HeaderProps) {
  return (
    <header className={`sticky top-0 z-50 border-b px-4 py-3 backdrop-blur-xl sm:px-6 ${darkMode ? "border-white/10 bg-[#111316]/90 text-zinc-100" : "border-zinc-200 bg-white/90 text-zinc-950 shadow-sm"}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 place-items-center rounded-md border ${darkMode ? "border-red-400/20 bg-red-400/10" : "border-red-200 bg-red-50"}`}>
          <Activity className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Telemetry Analytics</h1>
          <p className="text-xs text-zinc-500">Session trace inspection</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className={`flex min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-sm ${darkMode ? "border-white/10 bg-white/[0.04]" : "border-zinc-200 bg-zinc-50"}`}>
          <span className="flex items-center gap-2 font-medium">
            <FileUp className="h-4 w-4 shrink-0 text-zinc-500" />
            Telemetry Data
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setSelectedCsvFile(e.target.files?.[0] ?? null)}
            className={`max-w-[15rem] text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-semibold ${darkMode ? "text-zinc-100 file:bg-red-400/10 file:text-red-200" : "text-zinc-900 file:bg-red-50 file:text-red-600"}`}
          />
          <span className="text-xs text-zinc-500">
            Selected: {selectedCsvFile ? selectedCsvFile.name : "No CSV selected."}
          </span>
        </label>

        {loading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" aria-label="Loading telemetry" />}

        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`grid h-10 w-10 place-items-center rounded-md border ${darkMode ? "border-white/10 hover:bg-white/10" : "border-zinc-200 hover:bg-zinc-100"}`}
          aria-label="Toggle Dark Mode"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
      </div>
    </header>
  );
}
