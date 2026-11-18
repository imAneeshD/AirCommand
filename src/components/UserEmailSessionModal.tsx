import React, { useEffect, useState } from "react";
import { Mail, ShieldCheck, UserCheck, X } from "lucide-react";
import { loadSavedUserEmail, saveUserEmail } from "../utils/storage.ts";
import { sessionTracker } from "../utils/sessionTracker.ts";

export interface UserEmailSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (email: string) => void;
}

export const UserEmailSessionModal: React.FC<UserEmailSessionModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [emailInput, setEmailInput] = useState(() => loadSavedUserEmail() ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEmailInput(loadSavedUserEmail() ?? "");
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = emailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!clean || !emailRegex.test(clean)) {
      setErrorMsg("Please enter a valid email address (e.g. captain@airline.com).");
      return;
    }

    saveUserEmail(clean);
    sessionTracker.flushCurrentSession();
    if (onSaved) onSaved(clean);
    onClose();
  };

  const handleSkipGuest = () => {
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in select-none"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--atc-border-strong)] bg-gradient-to-b from-[#0a1526] via-[#07111e] to-[#040812] p-6 shadow-2xl text-[var(--atc-text)]">
        {/* Close Button */}
        <button
          onClick={handleSkipGuest}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          title="Continue as Guest"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ATC Badge Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-bold tracking-widest text-[var(--atc-cyan)] uppercase">
              ATC Officer Logbook
            </div>
            <h3 className="text-base font-mono font-extrabold text-white tracking-wide">
              Controller Credentials
            </h3>
          </div>
        </div>

        {/* Explanatory Context */}
        <p className="mt-3 text-xs font-mono text-slate-300 leading-relaxed">
          Enter your email to record flight operations, track radar duty hours, and save your controller safety rating across sessions.
          <span className="block mt-1 text-[11px] text-cyan-400/90 font-sans">
            No password needed — just your email to sync your logbook.
          </span>
        </p>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-cyan-400" />
              <span>Controller Email</span>
            </label>
            <div className="relative">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="controller@aircommand.aero"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0b1b33] border border-cyan-500/40 text-white font-mono text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
              />
            </div>
            {errorMsg && (
              <p className="mt-1.5 text-xs text-rose-400 font-mono tracking-tight">
                {errorMsg}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="submit"
              className="w-full sm:flex-1 py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition-all active:scale-[0.98]"
            >
              <UserCheck className="w-4 h-4" />
              <span>Save & Log In</span>
            </button>
            <button
              type="button"
              onClick={handleSkipGuest}
              className="w-full sm:w-auto py-2.5 px-3.5 rounded-lg border border-slate-700/60 hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 font-mono text-xs tracking-wider transition-colors"
            >
              Skip (Guest)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserEmailSessionModal;
