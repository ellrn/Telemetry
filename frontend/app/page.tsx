"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import DashboardView from "../components/DashboardView";
import DataTableView from "../components/DataTableView";
import Header from "../components/Header";
import MetadataBar from "../components/MetadataBar";
import Tabs from "../components/Tabs";

type Tab = "dashboard" | "data";

type TelemetryRow = {
  time: number;
  [key: string]: string | number | null;
};

type TelemetryData = {
  file: string;
  car: string;
  track: string;
  rows: number;
  columns: string[];
  data: TelemetryRow[];
  metadata?: Record<string, string | number | undefined>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL;
function backendError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }

  if (payload && typeof payload === "object" && "detail" in payload) {
    return String((payload as { detail: unknown }).detail);
  }

  return fallback;
}

async function uploadTelemetry(file: File, signal?: AbortSignal): Promise<TelemetryData> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/telemetry`, {
    method: "POST",
    body: formData,
    signal,
  });
  const payload = await response.json();

  if (!response.ok || (payload && typeof payload === "object" && "error" in payload)) {
    throw new Error(backendError(payload, "Telemetry upload failed."));
  }

  return normalizeTelemetry(payload);
}

function normalizeTelemetry(payload: unknown): TelemetryData {
  if (!payload || typeof payload !== "object") {
    throw new Error("Backend telemetry response was not a JSON object.");
  }

  const record = payload as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : null;
  const columns = Array.isArray(record.columns) ? record.columns.map(String) : null;

  if (!data || !columns) {
    throw new Error("Backend telemetry response did not include data and columns.");
  }

  return {
    file: String(record.file ?? ""),
    car: String(record.car ?? ""),
    track: String(record.track ?? ""),
    rows: Number(record.rows ?? data.length),
    columns,
    data: data as TelemetryRow[],
    metadata: record.metadata as TelemetryData["metadata"],
  };
}

export default function Home() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return true;

    const storedTheme = window.localStorage.getItem("telemetry-theme");
    return storedTheme === "light" ? false : true;
  });
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dashboardRef = useRef<HTMLElement | null>(null);
  const rawTableRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    window.localStorage.setItem("telemetry-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (!selectedCsvFile) {
      setTelemetry(null);
      setSearchTerm("");
      setLoadError(null);
      setLoadingTelemetry(false);
      return;
    }

    const csvFile = selectedCsvFile;
    const controller = new AbortController();

    async function loadTelemetry() {
      setLoadingTelemetry(true);
      setLoadError(null);
      setTelemetry(null);
      setSearchTerm("");

      try {
        const nextTelemetry = await uploadTelemetry(csvFile, controller.signal);
        if (!controller.signal.aborted) setTelemetry(nextTelemetry);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Unable to upload telemetry CSV.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingTelemetry(false);
      }
    }

    loadTelemetry();

    return () => controller.abort();
  }, [selectedCsvFile]);

  const filteredData = useMemo(() => {
    if (!telemetry) return [];

    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return telemetry.data;
    }

    return telemetry.data.filter((row) =>
      telemetry.columns.some((column) =>
        String(row[column]).toLowerCase().includes(query)
      )
    );
  }, [searchTerm, telemetry]);

  const handleExport = () => {
    if (!telemetry) return;

    const csvRows = [
      telemetry.columns.join(","),
      ...filteredData.map((row) =>
        telemetry.columns.map((column) => row[column] ?? "").join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = telemetry.file || "telemetry.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTabChange = useCallback((tab: Tab) => {
    flushSync(() => setActiveTab(tab));

    const target = tab === "data" ? rawTableRef.current : dashboardRef.current;
    target?.scrollIntoView({
      behavior: tab === "data" ? "smooth" : "auto",
      block: "start",
    });
  }, []);

  return (
    <div className={darkMode ? "dark min-h-screen" : "min-h-screen"}>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <Header
          selectedCsvFile={selectedCsvFile}
          setSelectedCsvFile={setSelectedCsvFile}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          loading={loadingTelemetry}
        />

        <main className="mx-auto flex w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Tabs activeTab={activeTab} onTabChange={handleTabChange} darkMode={darkMode} />

          {loadError && (
            <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${darkMode ? "border-amber-400/20 bg-amber-400/10 text-amber-200" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
              {loadError}
            </div>
          )}

          <MetadataBar
            telemetry={telemetry}
            onExport={handleExport}
            darkMode={darkMode}
          />

          <section
            ref={dashboardRef}
            className={`scroll-mt-28 space-y-6 transition-opacity duration-150 ${
              activeTab === "dashboard" ? "opacity-100" : "opacity-75"
            }`}
            aria-label="Telemetry visualizations"
          >
            {loadingTelemetry ? (
              <div className={`rounded-lg border p-8 text-sm ${darkMode ? "border-white/10 bg-[#15181d] text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"}`}>
                Loading telemetry from backend...
              </div>
            ) : telemetry ? (
              <DashboardView chartData={telemetry} darkMode={darkMode} />
            ) : (
              <div className={`rounded-lg border p-8 text-sm ${darkMode ? "border-white/10 bg-[#15181d] text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"}`}>
                No telemetry data loaded. Select a CSV file to load telemetry.
              </div>
            )}
          </section>

          <section
            ref={rawTableRef}
            className={`mt-8 scroll-mt-28 transition-opacity duration-150 ${
              activeTab === "data" ? "opacity-100" : "opacity-85"
            }`}
            aria-label="Raw telemetry table"
          >
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Raw Telemetry</h2>
                <p className="text-sm text-zinc-500">Paginated sample inspection for loaded telemetry.</p>
              </div>
            </div>
            <DataTableView
              telemetry={telemetry}
              filteredData={filteredData}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              visibleColumns={telemetry?.columns ?? []}
              darkMode={darkMode}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
