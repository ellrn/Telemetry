import { LayoutDashboard, Table as TableIcon } from "lucide-react";

interface TabsProps {
  activeTab: "dashboard" | "data";
  onTabChange: (tab: "dashboard" | "data") => void;
  darkMode: boolean;
}

function TabButton({
  active,
  onClick,
  label,
  icon,
  darkMode,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  darkMode: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 items-center gap-2 border-b-2 px-1 text-sm font-medium transition ${
        active
          ? darkMode
            ? "border-red-400 text-red-300"
            : "border-red-500 text-red-600"
          : darkMode
            ? "border-transparent text-zinc-500 hover:text-zinc-200"
            : "border-transparent text-zinc-500 hover:text-zinc-900"
      }`}
      aria-pressed={active}
    >
      {icon} {label}
    </button>
  );
}

export default function Tabs({ activeTab, onTabChange, darkMode }: TabsProps) {
  return (
    <div className={`mb-5 flex gap-6 border-b ${darkMode ? "border-white/10" : "border-zinc-200"}`}>
      <TabButton active={activeTab === "dashboard"} onClick={() => onTabChange("dashboard")} label="Visual Dashboard" icon={<LayoutDashboard size={18} />} darkMode={darkMode} />
      <TabButton active={activeTab === "data"} onClick={() => onTabChange("data")} label="Raw Telemetry" icon={<TableIcon size={18} />} darkMode={darkMode} />
    </div>
  );
}
