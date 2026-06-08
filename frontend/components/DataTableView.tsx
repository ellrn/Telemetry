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

  const cleanedColumns = useMemo(
    () =>
      (telemetry?.columns ?? []).filter((col) =>
        filteredData.some((row) => row?.[col] !== null && row?.[col] !== undefined && row?.[col] !== "")
      ),
    [filteredData, telemetry?.columns]
  );

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filteredData.slice(pageStart, pageStart + pageSize);
  const firstRow = filteredData.length === 0 ? 0 : pageStart + 1;
  const lastRow = Math.min(pageStart + pageSize, filteredData.length);

  const isNumericColumn = (column: string) =>
    filteredData.some((row) => Number.isFinite(Number(row?.[column])));

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
            Showing {firstRow}-{lastRow} of {filteredData.length}
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

      <div className="h-[560px] w-full overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead
            className={`sticky top-0 z-10 text-[0.68rem] uppercase tracking-wide ${
              darkMode
                ? "bg-[#1d2128] text-zinc-400"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            <tr>
              {cleanedColumns.map((col) =>
                visibleColumns.includes(col) ? (
                  <th
                    key={col}
                    className={`whitespace-nowrap border-b px-4 py-3 font-medium ${isNumericColumn(col) ? "text-right" : "text-left"} ${darkMode ? "border-white/10" : "border-zinc-200"}`}
                  >
                    {col}
                  </th>
                ) : null
              )}
            </tr>
          </thead>

          <tbody className={`font-mono ${darkMode ? "divide-y divide-white/5" : "divide-y divide-zinc-100"}`}>
            {pageRows.map((row, idx) => (
              <tr
                key={`${pageStart + idx}-${row.time ?? ""}`}
                className={`
                  transition-colors
                  ${idx % 2 === 0
                    ? darkMode
                      ? "bg-transparent"
                      : "bg-white"
                    : darkMode
                    ? "bg-white/[0.025]"
                    : "bg-zinc-50/80"}
                  ${darkMode ? "hover:bg-red-400/5" : "hover:bg-red-50/70"}
                `}
              >
                {cleanedColumns.map((col) =>
                  visibleColumns.includes(col) ? (
                    <td key={col} className={`whitespace-nowrap px-4 py-2.5 ${isNumericColumn(col) ? "text-right" : "text-left"} ${col.toLowerCase().includes("time") ? "text-red-300" : darkMode ? "text-zinc-300" : "text-zinc-700"}`}>
                      {formatValue(col, row?.[col])}
                    </td>
                  ) : null
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty state */}
        {filteredData.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No matching records found.
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
