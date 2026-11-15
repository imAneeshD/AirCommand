import React from "react";
import { ArrowLeft, X } from "lucide-react";

interface MobileViewHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  action?: React.ReactNode;
}

export const MobileViewHeader: React.FC<MobileViewHeaderProps> = ({
  title,
  subtitle,
  onClose,
  action,
}) => {
  return (
    <div className="h-12 px-3 border-b border-[var(--atc-border)] bg-[var(--atc-surface)] flex items-center justify-between shrink-0 select-none">
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:bg-[var(--atc-surface)] text-[var(--atc-text)] font-mono text-xs font-bold transition-colors cursor-pointer"
        title="Back to Radar Scope"
      >
        <ArrowLeft className="w-4 h-4 text-[var(--atc-accent)]" />
        <span>RADAR</span>
      </button>

      <div className="text-center min-w-0 px-2">
        <div className="text-xs font-mono font-extrabold text-[var(--atc-text)] truncate tracking-wider">
          {title}
        </div>
        {subtitle && (
          <div className="text-[10px] font-mono text-[var(--atc-muted)] truncate">
            {subtitle}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {action}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] transition-colors cursor-pointer"
          title="Close to Radar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
