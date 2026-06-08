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

const API_BASE = "http://localhost:8000";
const TELEMETRY_WINDOW_SECONDS = 30;

function backendError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }

  return fallback;
}

async function fetchBackend<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    signal,
  });
  const payload = await response.json();

  if (!response.ok || (payload && typeof payload === "object" && "error" in payload)) {
    throw new Error(backendError(payload, `Backend request failed: ${path}`));
  }

  return payload as T;
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
  const [cars, setCars] = useState<string[]>([]);
  const [tracks, setTracks] = useState<string[]>([]);
  const [selectedCar, setSelectedCar] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingCars, setLoadingCars] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
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
    let cancelled = false;

    async function loadCars() {
      setLoadingCars(true);
      setLoadError(null);

      try {
        const payload = await fetchBackend<{ cars: string[] }>("/cars");
        const nextCars = Array.isArray(payload.cars) ? payload.cars.map(String) : [];

        if (cancelled) return;

        setCars(nextCars);
        setSelectedCar(nextCars[0] ?? "");
      } catch (error) {
        if (!cancelled) {
          setCars([]);
          setTracks([]);
          setTelemetry(null);
          setLoadError(error instanceof Error ? error.message : "Unable to load cars from backend.");
        }
      } finally {
        if (!cancelled) setLoadingCars(false);
      }
    }

    loadCars();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCar) {
      setTracks([]);
      setSelectedTrack("");
      setTelemetry(null);
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ car: selectedCar }).toString();

    async function loadTracks() {
      setLoadingTracks(true);
      setLoadError(null);
      setTracks([]);
      setSelectedTrack("");
      setTelemetry(null);
      setSearchTerm("");

      try {
        const payload = await fetchBackend<{ tracks: string[] }>(`/tracks?${query}`, controller.signal);
        const nextTracks = Array.isArray(payload.tracks) ? payload.tracks.map(String) : [];

        if (controller.signal.aborted) return;

        setTracks(nextTracks);
        setSelectedTrack(nextTracks[0] ?? "");
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load tracks from backend.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingTracks(false);
      }
    }

    loadTracks();

    return () => controller.abort();
  }, [selectedCar]);

  useEffect(() => {
    if (!selectedCar || !selectedTrack) return;

    const controller = new AbortController();
    const query = new URLSearchParams({
      car: selectedCar,
      track: selectedTrack,
      window: String(TELEMETRY_WINDOW_SECONDS),
    }).toString();

    async function loadTelemetry() {
      setLoadingTelemetry(true);
      setLoadError(null);
      setTelemetry(null);
      setSearchTerm("");

      try {
        const payload = await fetchBackend<unknown>(`/telemetry?${query}`, controller.signal);
        const nextTelemetry = normalizeTelemetry(payload);

        if (!controller.signal.aborted) setTelemetry(nextTelemetry);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load telemetry from backend.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingTelemetry(false);
      }
    }

    loadTelemetry();

    return () => controller.abort();
  }, [selectedCar, selectedTrack]);

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

  const handleCarChange = (car: string) => {
    setSelectedCar(car);
  };

  const handleTrackChange = (track: string) => {
    setSelectedTrack(track);
  };

  const isLoading = loadingCars || loadingTracks || loadingTelemetry;

  return (
    <div className={darkMode ? "dark min-h-screen" : "min-h-screen"}>
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <Header
          cars={cars}
          selectedCar={selectedCar}
          setSelectedCar={handleCarChange}
          tracks={tracks}
          selectedTrack={selectedTrack}
          setSelectedTrack={handleTrackChange}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          loading={isLoading}
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
            selectedTrack={selectedTrack}
            selectedCar={selectedCar}
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
                Select a backend car and track to load telemetry.
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
                <p className="text-sm text-zinc-500">Paginated sample inspection for the active car and track.</p>
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
