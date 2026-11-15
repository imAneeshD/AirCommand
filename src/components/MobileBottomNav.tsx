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
    badge?: React.ReactNode;
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
      badge:
        activeFlightsCount > 0 ? (
          <span className="absolute -top-1 -right-2.5 px-1 min-w-[15px] h-3.5 flex items-center justify-center text-[9px] font-mono font-bold rounded-full bg-[var(--atc-accent)] text-slate-950">
            {activeFlightsCount}
          </span>
        ) : null,
    },
    {
      id: "CLEARANCE",
      label: "CLEARANCE",
      icon: <Radio className="w-5 h-5" />,
      badge: hasUrgentAlert ? (
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse absolute -top-0.5 -right-0.5 ring-2 ring-[var(--atc-surface)]" />
      ) : selectedAc ? (
        <span className="w-2 h-2 rounded-full bg-[var(--atc-cyan)] absolute -top-0.5 -right-0.5 ring-2 ring-[var(--atc-surface)]" />
      ) : null,
    },
    {
      id: "COMMS",
      label: "RADIO",
      icon: <MessageSquare className="w-5 h-5" />,
      badge:
        sim.incidents.length > 0 ? (
          <span className="absolute -top-1 -right-2.5 px-1 min-w-[15px] h-3.5 flex items-center justify-center text-[9px] font-mono font-bold rounded-full bg-amber-500 text-slate-950">
            {sim.incidents.length}
          </span>
        ) : null,
    },
  ];

  return (
    <nav className="h-[58px] pb-1.5 pt-1 bg-[var(--atc-surface)]/95 backdrop-blur-md border-t border-[var(--atc-border)] flex items-stretch shrink-0 z-30 select-none shadow-lg">
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
            <div className="relative flex items-center justify-center">
              {tab.icon}
              {tab.badge}
            </div>
            <span className="text-[10px] font-mono font-semibold tracking-tight leading-none mt-0.5">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
