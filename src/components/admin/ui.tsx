import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { NotifyContext, type Notify } from "./hooks";
import { Icons } from "./icons";

// ------------------------------------------------------------------ notifications

type Notice = { id: number; type: "success" | "error"; text: string };

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const counter = useRef(0);
  const notify = useCallback<Notify>((type, text) => {
    counter.current += 1;
    const id = counter.current;
    setNotices((current) => [...current.slice(-2), { id, type, text }]);
    window.setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), 4500);
  }, []);

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div className="fixed bottom-5 right-5 z-[70] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {notices.map((notice) => (
          <div
            key={notice.id}
            role="status"
            className={`admin-toast flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${
              notice.type === "success" ? "border-[#8FAF5A]/30 text-[#D5E6C0]" : "border-[#E8967A]/30 text-[#F1C2B2]"
            }`}
            style={{ background: "rgba(18,37,26,0.96)" }}
          >
            <span className={`mt-0.5 ${notice.type === "success" ? "text-[#A9C97C]" : "text-[#E8967A]"}`}>
              {notice.type === "success" ? <Icons.Check /> : <Icons.Alert />}
            </span>
            <span className="leading-5">{notice.text}</span>
          </div>
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

// ------------------------------------------------------------------ layout

const glass: React.CSSProperties = {
  background: "rgba(150,190,120,0.07)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  boxShadow: "0 25px 70px -25px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
};

export function Panel({ children, className = "", padded = false }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-[22px] border border-white/10 overflow-hidden ${padded ? "p-6" : ""} ${className}`} style={glass}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/10 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div className={`min-w-0 ${actions ? "lg:max-w-[38%] lg:shrink-0" : ""}`}>
        <h2 className="font-admin-display text-xl text-[#EAF2DD]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[#8FA080]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
    </div>
  );
}

export function StatCard({
  title,
  value,
  description,
  icon,
  loading,
  onClick,
  tone = "green",
}: {
  title: string;
  value: React.ReactNode;
  description?: React.ReactNode;
  icon: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
  tone?: "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "text-[#E8967A] border-[#E8967A]/25 bg-[#E8967A]/10"
      : tone === "amber"
        ? "text-[#E0C985] border-[#E0C985]/25 bg-[#E0C985]/10"
        : "text-[#A9C97C] border-[#8FAF5A]/20 bg-[#8FAF5A]/10";
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-[#8FA080]">{title}</p>
        <p className="font-admin-display mt-2 text-3xl text-[#EAF2DD]">{loading ? "—" : value}</p>
        {description && <p className="mt-2 text-xs text-[#71806C]">{loading ? "Loading…" : description}</p>}
      </div>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}>{icon}</div>
    </div>
  );
  const className = "block w-full rounded-[20px] border border-white/10 p-5 text-left transition";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:border-[#8FAF5A]/35 hover:-translate-y-0.5`} style={glass}>
      {content}
    </button>
  ) : (
    <div className={className} style={glass}>
      {content}
    </div>
  );
}

// ------------------------------------------------------------------ buttons & badges

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode };

export function PrimaryButton({ icon, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[#12200F] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{ background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)" }}
    >
      {icon}
      {children}
    </button>
  );
}

export function SecondaryButton({ icon, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#8FAF5A]/25 px-4 py-2.5 text-sm text-[#A9C97C] transition hover:bg-[#8FAF5A]/10 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function DangerButton({ icon, children, className = "", ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  tone = "green",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "green" | "red" | "amber" }) {
  const toneClass =
    tone === "red"
      ? "border-red-500/20 text-red-400 hover:bg-red-500/10"
      : tone === "amber"
        ? "border-[#E0C985]/25 text-[#E0C985] hover:bg-[#E0C985]/10"
        : "border-[#8FAF5A]/20 text-[#A9C97C] hover:bg-[#8FAF5A]/10";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export type BadgeTone = "green" | "amber" | "red" | "gray" | "violet";

export function Badge({ tone, children, icon }: { tone: BadgeTone; children: React.ReactNode; icon?: React.ReactNode }) {
  const classes: Record<BadgeTone, string> = {
    green: "bg-[#8FAF5A]/10 text-[#A9C97C] border-[#8FAF5A]/25",
    amber: "bg-[#E0C985]/10 text-[#E6D49A] border-[#E0C985]/25",
    red: "bg-[#E8967A]/10 text-[#F0A88F] border-[#E8967A]/25",
    gray: "bg-white/5 text-[#A6B399] border-white/10",
    violet: "bg-[#CF70C1]/10 text-[#E2A6D9] border-[#CF70C1]/25",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium ${classes[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge tone="green" icon={<Icons.Check size={12} />}>Approved</Badge>;
  if (status === "rejected") return <Badge tone="red" icon={<Icons.X size={12} />}>Rejected</Badge>;
  if (status === "active") return <Badge tone="green" icon={<Icons.Check size={12} />}>Active</Badge>;
  if (status === "inactive") return <Badge tone="red" icon={<Icons.X size={12} />}>Inactive</Badge>;
  return <Badge tone="amber">Draft</Badge>;
}

// ------------------------------------------------------------------ inputs

const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-[#EAF2DD] placeholder-[#71806C] outline-none focus:border-[#8FAF5A]/60";

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-[220px]">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#71806C]">
        <Icons.Search />
      </span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${inputClass} pl-9`} />
    </div>
  );
}

export function FilterTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-white/[0.03] p-1" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${value === option.value ? "text-[#12200F]" : "text-[#A6B399] hover:text-[#EAF2DD]"}`}
          style={value === option.value ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)" } : undefined}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1 opacity-70">({option.count})</span>}
        </button>
      ))}
    </div>
  );
}

function FieldShell({ label, required, hint, htmlFor, children }: { label: string; required?: boolean; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs uppercase tracking-wider text-[#8FA080]">
        {label}
        {required && <span className="ml-0.5 text-[#E8967A]">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#71806C]">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  required,
  hint,
  type = "text",
  placeholder,
  maxLength,
  autoFocus,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  step?: string;
}) {
  const id = useId();
  return (
    <FieldShell label={label} required={required} hint={hint} htmlFor={id}>
      <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} autoFocus={autoFocus} step={step} className={inputClass} />
    </FieldShell>
  );
}

export function TextAreaField({ label, value, onChange, required, hint, maxLength, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; hint?: string; maxLength?: number; rows?: number }) {
  const id = useId();
  return (
    <FieldShell label={label} required={required} hint={hint} htmlFor={id}>
      <textarea id={id} value={value} rows={rows} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className={`${inputClass} resize-y`} />
    </FieldShell>
  );
}

export function SelectField({ label, value, onChange, options, required, hint }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; required?: boolean; hint?: string }) {
  const id = useId();
  return (
    <FieldShell label={label} required={required} hint={hint} htmlFor={id}>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} admin-select`}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7CA653]" />
      <span>
        <span className="block text-sm text-[#D5DFC9]">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-[#71806C]">{hint}</span>}
      </span>
    </label>
  );
}

export function ChipToggleGroup({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wider text-[#8FA080]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? selected.filter((value) => value !== option) : [...selected, option])}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize transition ${active ? "border-[#8FAF5A]/50 bg-[#8FAF5A]/20 text-[#D5E6C0]" : "border-white/10 text-[#A6B399] hover:bg-white/5"}`}
            >
              {active && <span className="mr-1">✓</span>}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ modals

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  busy,
  wide,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  wide?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`admin-modal relative flex max-h-full w-full flex-col rounded-[24px] border border-white/10 ${wide ? "max-w-2xl" : "max-w-md"}`}
        style={{ background: "rgba(20,42,28,0.96)", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 id={titleId} className="font-admin-display text-xl text-[#EAF2DD]">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-[#8FA080]">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} disabled={busy}>
            <Icons.X />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <SecondaryButton onClick={onCancel} disabled={busy}>
            Cancel
          </SecondaryButton>
          <DangerButton onClick={onConfirm} disabled={busy} icon={<Icons.Trash />}>
            {busy ? "Please wait…" : confirmLabel}
          </DangerButton>
        </>
      }
    >
      <div className="flex gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-300">
          <Icons.Alert size={20} />
        </div>
        <div className="text-sm leading-6 text-[#B7C4A9]">
          {message}
          <p className="mt-2 text-[#E8967A]">This action cannot be undone.</p>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ tables & pagination

export function TableShell({ children, minWidth = 760 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, loading, text }: { colSpan: number; loading?: boolean; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-14 text-center text-sm text-[#8FA080]">
        {loading ? "Loading…" : text}
      </td>
    </tr>
  );
}

export function Avatar({ text }: { text: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#8FAF5A]/20 bg-[#8FAF5A]/10 text-[#A9C97C]">
      {(text || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function pageList(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push("…");
    result.push(value);
  });
  return result;
}

export function Pagination({
  page,
  totalPages,
  start,
  end,
  total,
  noun,
  onChange,
}: {
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  noun: string;
  onChange: (page: number) => void;
}) {
  if (!total) return null;
  return (
    <div className="flex flex-col gap-4 border-t border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#71806C]">
        Showing <span className="text-[#A6B399]">{start}</span>–<span className="text-[#A6B399]">{end}</span> of <span className="text-[#A6B399]">{total}</span> {noun}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A6B399] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30">
            <Icons.ChevronLeft /> Previous
          </button>
          {pageList(page, totalPages).map((value, index) =>
            value === "…" ? (
              <span key={`gap-${index}`} className="px-1 text-xs text-[#71806C]">
                …
              </span>
            ) : (
              <button
                key={value}
                type="button"
                onClick={() => onChange(value)}
                aria-current={page === value ? "page" : undefined}
                className={`h-9 w-9 rounded-lg text-xs font-medium transition ${page === value ? "text-[#12200F]" : "text-[#A6B399] hover:bg-white/5"}`}
                style={page === value ? { background: "linear-gradient(135deg, #A9C97C 0%, #7CA653 100%)" } : undefined}
              >
                {value}
              </button>
            ),
          )}
          <button type="button" disabled={page === totalPages} onClick={() => onChange(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-[#A6B399] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30">
            Next <Icons.ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}

export function InfoNote({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" }) {
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-xs leading-5 ${tone === "amber" ? "border-[#E0C985]/25 bg-[#E0C985]/[0.06] text-[#E6D49A]" : "border-[#8FAF5A]/20 bg-[#8FAF5A]/[0.06] text-[#B7C9A0]"}`}>
      <span className="mt-0.5 shrink-0">
        <Icons.Alert size={14} />
      </span>
      <div>{children}</div>
    </div>
  );
}
