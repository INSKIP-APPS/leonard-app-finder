import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────
// Briques du formulaire de matching (extraites de routes/matching.tsx) :
// stepper, blocs, champs texte/select/multi-select, jauge. Purement
// présentationnelles — aucun état métier.
// ──────────────────────────────────────────────────────────────────────

export function Stepper({ step }: { step: string }) {
  const steps = ["1 · Le projet", "2 · Résultats"];
  const activeIdx = step === "form" ? 0 : 1;
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const active = i <= activeIdx;
        return (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${active ? "bg-navy text-white" : "bg-white border border-border text-muted"}`}
            >
              {s}
            </div>
            {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

export function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="label-caps mb-1">{title}</div>
      {subtitle && <div className="text-xs text-muted mb-3">{subtitle}</div>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-text mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-border rounded-md text-sm bg-white focus:outline-none focus:border-navy"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function SliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-text">{label}</span>
        <span className="text-sm font-semibold text-navy tabular-nums">
          {value}
          <span className="text-muted font-normal text-xs">/100</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-[var(--color-navy,#001D3D)] cursor-pointer"
      />
    </div>
  );
}

export function MultiSelect({
  options,
  values,
  onChange,
  placeholder,
}: {
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = (o: string) => {
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  };
  const remove = (o: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(values.filter((v) => v !== o));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[38px] px-3 py-1.5 border border-border rounded-md text-sm bg-white text-left flex items-center justify-between gap-2 focus:outline-none focus:border-navy"
      >
        <div className="flex flex-wrap gap-1.5 flex-1">
          {values.length === 0 ? (
            <span className="text-muted">{placeholder ?? "—"}</span>
          ) : (
            values.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 bg-navy text-white text-xs px-2 py-0.5 rounded-full"
              >
                {v}
                <span onClick={(e) => remove(v, e)} className="hover:opacity-80 cursor-pointer">
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-border rounded-md shadow-lg">
          {options.map((o) => {
            const active = values.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[var(--color-accent)] ${active ? "bg-[var(--color-accent)]" : ""}`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${active ? "bg-navy border-navy" : "border-border"}`}
                >
                  {active && <span className="text-white text-xs leading-none">✓</span>}
                </span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
