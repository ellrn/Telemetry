import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatValue } from "../utils/formatValue";

interface TelemetryRow {
  time: string | number;
  [key: string]: string | number | null;
}

interface TelemetryData {
  file: string;
  rows: number;
  columns: string[];
  data: TelemetryRow[];
  metadata?: Record<string, string | number | undefined>;
}

interface DataTableViewProps {
  telemetry: TelemetryData | null;
  filteredData: TelemetryRow[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  visibleColumns: string[];
  darkMode: boolean;
}

export default function DataTableView({
  telemetry,
  filteredData,
  searchTerm,
  setSearchTerm,
  visibleColumns,
  darkMode
}: DataTableViewProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const displayColumns = useMemo(
    () => (telemetry?.columns ?? []).filter((col) => visibleColumns.includes(col)),
    [telemetry?.columns, visibleColumns]
  );

  const sampledData = useMemo(() => {
    const rowsBySecond = new Map<number, TelemetryRow>();

    for (const row of filteredData) {
      const time = Number(row.time);

      if (!Number.isFinite(time)) {
        return filteredData;
      }

      const second = Math.floor(time);

      if (!rowsBySecond.has(second)) {
        rowsBySecond.set(second, row);
      }
    }

    return Array.from(rowsBySecond.values());
  }, [filteredData]);

  const totalPages = Math.max(1, Math.ceil(sampledData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = sampledData.slice(pageStart, pageStart + pageSize);
  const firstRow = sampledData.length === 0 ? 0 : pageStart + 1;
  const lastRow = Math.min(pageStart + pageSize, sampledData.length);

  const isNumericColumn = (column: string) =>
    sampledData.some((row) => Number.isFinite(Number(row?.[column])));

  if (!telemetry?.columns || !Array.isArray(filteredData)) {
    return (
      <div className={`rounded-lg border p-8 text-center text-sm ${darkMode ? "border-white/10 bg-[#15181d] text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"}`}>
        No telemetry loaded.
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border ${
        darkMode ? "border-white/10 bg-[#15181d]" : "border-zinc-200 bg-white"
      }`}
    >
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b p-4 ${darkMode ? "border-white/10" : "border-zinc-200"}`}>
        <div
          className={`flex w-full max-w-sm items-center rounded-md border px-3 py-2 ${
            darkMode
              ? "border-white/10 bg-black/20"
              : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <Search className="mr-2 text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Search value..."
            value={searchTerm}
            onChange={(e) => {
              setPage(1);
              setSearchTerm(e.target.value);
            }}
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span className="font-mono">
            Showing {firstRow}-{lastRow} of {sampledData.length}
          </span>
          <label className="flex items-center gap-2">
            Rows
            <select
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
              className={`rounded-md border px-2 py-1 ${darkMode ? "border-white/10 bg-[#111316] text-zinc-200" : "border-zinc-200 bg-white text-zinc-800"}`}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="h-[560px] w-full overflow-y-auto overflow-x-hidden p-3">
        {sampledData.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No matching records found.
          </div>
        )}

        {pageRows.length > 0 && (
          <div className="space-y-3">
            {pageRows.map((row, idx) => (
              <article
                key={`${pageStart + idx}-${row.time ?? ""}`}
                className={`rounded-md border transition-colors ${
                  darkMode
                    ? "border-white/10 bg-[#111316] hover:bg-red-400/5"
                    : "border-zinc-200 bg-white hover:bg-red-50/60"
                }`}
              >
                <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 ${darkMode ? "border-white/10" : "border-zinc-100"}`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Sample {pageStart + idx + 1}
                  </span>
                  <span className={`font-mono text-xs ${darkMode ? "text-red-300" : "text-red-600"}`}>
                    Time {formatValue("time", row.time)}
                  </span>
                </div>

                <dl className="grid grid-cols-1 gap-px p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {displayColumns.map((col) => {
                    const numeric = isNumericColumn(col);

                    return (
                      <div
                        key={col}
                        className={`min-w-0 rounded px-3 py-2 ${
                          darkMode ? "bg-white/[0.025]" : "bg-zinc-50"
                        }`}
                      >
                        <dt className="truncate text-[0.68rem] font-medium uppercase tracking-wide text-zinc-500" title={col}>
                          {col}
                        </dt>
                        <dd
                          className={`mt-1 break-words font-mono text-sm tabular-nums ${
                            numeric ? "text-right" : "text-left"
                          } ${col.toLowerCase().includes("time") ? "text-red-300" : darkMode ? "text-zinc-300" : "text-zinc-700"}`}
                        >
                          {formatValue(col, row?.[col])}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 border-t p-3 ${darkMode ? "border-white/10" : "border-zinc-200"}`}>
        <span className="font-mono text-xs text-zinc-500">
          Page {currentPage} / {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            className={`grid h-9 w-9 place-items-center rounded-md border disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? "border-white/10 hover:bg-white/10" : "border-zinc-200 hover:bg-zinc-100"}`}
            aria-label="Previous page"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={currentPage === totalPages}
            className={`grid h-9 w-9 place-items-center rounded-md border disabled:cursor-not-allowed disabled:opacity-40 ${darkMode ? "border-white/10 hover:bg-white/10" : "border-zinc-200 hover:bg-zinc-100"}`}
            aria-label="Next page"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
