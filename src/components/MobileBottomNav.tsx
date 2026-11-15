import React from "react";
import { Compass, FileText, Radio, MessageSquare } from "lucide-react";
import { useAtcStore, type MobileViewTab } from "../store/atcStore.ts";

export const MobileBottomNav: React.FC = () => {
  const mobileTab = useAtcStore((s) => s.mobileTab);
  const setMobileTab = useAtcStore((s) => s.setMobileTab);
  const sim = useAtcStore((s) => s.sim);

  const selectedAc = sim.selectedAircraftId ? sim.aircraft[sim.selectedAircraftId] : null;
  const activeFlightsCount = sim.aircraftOrder.filter((id) => {
    const ac = sim.aircraft[id];
    return ac && ac.state !== "COMPLETED_ARRIVAL" && ac.state !== "COMPLETED_DEPARTURE";
  }).length;

  const hasUrgentAlert = selectedAc && (selectedAc.hasReadbackError || selectedAc.operationMode === "EMERGENCY_OPERATION");

  const tabs: Array<{
    id: MobileViewTab;
    label: string;
    icon: React.ReactNode;
    badge?: string | number | null;
    badgeColor?: string;
  }> = [
    {
      id: "RADAR",
      label: "RADAR",
      icon: <Compass className="w-5 h-5" />,
    },
    {
      id: "STRIPS",
      label: "STRIPS",
      icon: <FileText className="w-5 h-5" />,
      badge: activeFlightsCount > 0 ? activeFlightsCount : null,
      badgeColor: "bg-[var(--atc-surface-alt)] text-[var(--atc-cyan)] border border-[var(--atc-border)]",
    },
    {
      id: "CLEARANCE",
      label: "CLEARANCE",
      icon: <Radio className="w-5 h-5" />,
      badge: hasUrgentAlert ? "!" : selectedAc ? selectedAc.callsign.slice(0, 4) : null,
      badgeColor: hasUrgentAlert
        ? "bg-red-500 text-white animate-pulse"
        : "bg-[var(--atc-accent-bg)] text-[var(--atc-accent-text)] border border-[var(--atc-accent-border)]",
    },
    {
      id: "COMMS",
      label: "RADIO",
      icon: <MessageSquare className="w-5 h-5" />,
      badge: sim.incidents.length > 0 ? sim.incidents.length : null,
      badgeColor: "bg-amber-500 text-slate-950 font-bold",
    },
  ];

  return (
    <nav className="h-14 bg-[var(--atc-surface)]/95 backdrop-blur-md border-t border-[var(--atc-border)] flex items-stretch shrink-0 z-30 select-none shadow-lg">
      {tabs.map((tab) => {
        const active = mobileTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all cursor-pointer ${
              active
                ? "text-[var(--atc-accent)] font-extrabold"
                : "text-[var(--atc-muted)] hover:text-[var(--atc-text)]"
            }`}
          >
            {active && (
              <span className="absolute top-0 left-4 right-4 h-0.5 bg-[var(--atc-accent)] rounded-full" />
            )}
            <div className="relative">
              {tab.icon}
              {tab.badge !== null && tab.badge !== undefined && (
                <span
                  className={`absolute -top-1.5 -right-3 text-[9px] font-mono font-bold px-1 rounded-full leading-tight ${tab.badgeColor}`}
                >
                  {tab.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono tracking-wide">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
