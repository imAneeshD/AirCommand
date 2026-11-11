import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionProps {
  title: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (next: boolean) => void;
  rightSlot?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Clean, minimal theme-aware collapsible section used across panels
 * so dense ATC controls stay organized and uncluttered.
 */
export const Accordion: React.FC<AccordionProps> = ({
  title,
  badge,
  icon,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  rightSlot,
  className = "",
  bodyClassName = "",
  children,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? internalOpen;

  const handleToggle = () => {
    const next = !isOpen;
    if (controlledOpen === undefined) {
      setInternalOpen(next);
    }
    onToggle?.(next);
  };

  return (
    <section
      className={`rounded-lg border border-[var(--atc-border)] bg-[var(--atc-surface)] shadow-[var(--atc-shadow)] overflow-hidden transition-colors ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--atc-surface-alt)]/70 border-b border-transparent data-[open=true]:border-[var(--atc-border)]" data-open={isOpen}>
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          className="flex-1 min-w-0 flex items-center gap-2 text-left group"
        >
          {icon && (
            <span className="shrink-0 text-[var(--atc-muted)] group-hover:text-[var(--atc-text)] transition-colors">
              {icon}
            </span>
          )}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--atc-text-secondary)] group-hover:text-[var(--atc-text)] truncate">
            {title}
          </span>
          {badge !== undefined && badge !== null && (
            <span className="shrink-0">{badge}</span>
          )}
        </button>

        {rightSlot && <div className="shrink-0 flex items-center gap-1.5">{rightSlot}</div>}

        <button
          type="button"
          onClick={handleToggle}
          aria-label={isOpen ? "Collapse section" : "Expand section"}
          className="shrink-0 p-0.5 rounded text-[var(--atc-muted)] hover:text-[var(--atc-text)] hover:bg-[var(--atc-border)]/40 transition-colors"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              isOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
        </button>
      </div>

      {isOpen && (
        <div className={`px-3 py-2.5 ${bodyClassName}`}>{children}</div>
      )}
    </section>
  );
};
