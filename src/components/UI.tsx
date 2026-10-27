import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { pointsToPath } from "../lib/utils";
import type { ImportedShape } from "../types";

export function Section({
  title,
  icon,
  hint,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section${open ? " open" : ""}`}>
      <button type="button" className="section-head" onClick={() => setOpen((value) => !value)}>
        <span className="section-icon">{icon}</span>
        <span className="section-title">
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </span>
        {badge && <span className="section-badge">{badge}</span>}
        <ChevronDown size={16} className="section-chevron" />
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = -1000,
  max = 1000,
  step = 1,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <span className="number-wrap">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
    </Field>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="range-field">
      <div className="range-label">
        <span>{label}</span>
        <strong>
          {value}
          {suffix ? ` ${suffix}` : ""}
        </strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({
  label,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`toggle-row${disabled ? " disabled" : ""}`}>
      <label htmlFor={id} className="toggle-copy">
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

const SWATCHES = ["#ef6f5e", "#d9789b", "#e6b63c", "#77a85a", "#3e9a8f", "#6288c6", "#8b7bc6", "#f4efe5", "#20252b"];

export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="color-field">
      <span className="field-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="color-row">
        <label className="color-chip">
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
          <span style={{ background: value }} />
        </label>
        <code>{value.toUpperCase()}</code>
        <div className="swatches">
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              className={color.toLowerCase() === value.toLowerCase() ? "swatch active" : "swatch"}
              style={{ background: color }}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`segmented${small ? " small" : ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function ShapePreview({
  shape,
  className,
  color = "#ef6f5e",
}: {
  shape: Pick<ImportedShape, "outer" | "holes" | "bounds"> | null;
  className?: string;
  color?: string;
}) {
  if (!shape || !shape.outer.length) {
    return <div className={`shape-preview empty ${className || ""}`}>Sube un dibujo</div>;
  }
  const { bounds } = shape;
  const pad = Math.max(2, Math.max(bounds.width, bounds.height) * 0.08);
  const paths = [pointsToPath(shape.outer), ...shape.holes.map((ring) => pointsToPath(ring))].join(" ");
  return (
    <svg
      className={`shape-preview ${className || ""}`}
      viewBox={`${bounds.minX - pad} ${-bounds.maxY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`}
      role="img"
      aria-label="Silueta importada"
    >
      <path d={paths} fill={color} fillRule="evenodd" />
    </svg>
  );
}
