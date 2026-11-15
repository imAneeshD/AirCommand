import React from "react";
import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";

interface MobileViewHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  action?: React.ReactNode;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const MobileViewHeader: React.FC<MobileViewHeaderProps> = ({
  title,
  subtitle,
  onClose,
  action,
  isExpanded,
  onToggleExpand,
}) => {
  return (
    <div className="h-11 px-3 border-b border-[var(--atc-border)] bg-[var(--atc-surface)] flex items-center justify-between shrink-0 select-none">
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--atc-border)] bg-[var(--atc-surface-alt)] hover:bg-[var(--atc-surface)] text-[var(--atc-text)] font-mono text-[11px] font-bold transition-colors cursor-pointer"
        title="Back to Radar Scope"
      >
        <ArrowLeft className="w-3.5 h-3.5 text-[var(--atc-accent)]" />
        <span>MAP</span>
      </button>

      <div className="text-center min-w-0 px-2 flex-1">
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
        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 rounded-md text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] transition-colors cursor-pointer"
            title={isExpanded ? "Collapse to half sheet (show map)" : "Expand sheet"}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-surface-alt)] transition-colors cursor-pointer"
          title="Close sheet"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
