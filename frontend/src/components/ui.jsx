import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { TONES } from '../lib/labels.js';

export const ICON_STROKE = 1.6;

export function Card({ className = '', children, ...rest }) {
  return (
    <section className={`glass rounded-[28px] p-5 sm:p-6 ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** Rounded tinted square holding a vector icon. */
export function IconChip({ icon: Icon, tone = 'slate', size = 'md' }) {
  const t = TONES[tone];
  const box = size === 'lg' ? 'h-11 w-11 rounded-[14px]' : size === 'sm' ? 'h-8 w-8 rounded-[10px]' : 'h-9 w-9 rounded-xl';
  const px = size === 'lg' ? 22 : size === 'sm' ? 16 : 18;
  return (
    <span className={`chip inline-flex shrink-0 items-center justify-center ${box}`} style={{ '--chip-bg': t.bg, color: t.fg }}>
      <Icon size={px} strokeWidth={ICON_STROKE} aria-hidden="true" />
    </span>
  );
}

export function CardHeader({ icon, tone, title, subtitle, right }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconChip icon={icon} tone={tone} />}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="truncate text-[13px] text-ink-2">{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
  );
}

/** Small capsule with a trend arrow and the rate. */
export function TrendPill({ trend, text, tone = 'slate' }) {
  if (!trend) return null;
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const t = TONES[trend === 'flat' ? 'slate' : tone];
  return (
    <span
      className="tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={{ background: t.bg, color: t.fg }}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {text}
    </span>
  );
}

export function Pill({ tone = 'slate', icon: Icon, children }) {
  const t = TONES[tone];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: t.bg, color: t.fg }}>
      {Icon && <Icon size={14} strokeWidth={ICON_STROKE} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Apple-style segmented control. */
export function Segmented({ options, value, onChange, label, size = 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]';
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-full bg-[var(--seg-bg)] p-1 ring-1 ring-[var(--hair)] backdrop-blur-md [scrollbar-width:none]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`${pad} whitespace-nowrap rounded-full font-medium transition-all duration-200 ${
              active ? 'bg-white text-[#16202c] shadow-[0_1px_3px_rgba(20,50,90,0.12),0_1px_1px_rgba(20,50,90,0.05)]' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Label + value tile used across cards. */
export function Stat({ label, value, unit, hint, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="truncate text-[12px] font-medium text-ink-2">{label}</div>
      <div className="tabular mt-0.5 truncate text-[17px] font-semibold tracking-tight text-ink">
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-medium text-ink-2">{unit}</span>}
      </div>
      {hint && <div className="truncate text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function Divider() {
  return <div className="my-4 h-px bg-gradient-to-r from-transparent via-[var(--hair-strong)] to-transparent" />;
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-[var(--track)] ${className}`} />;
}

export function SectionTitle({ title, subtitle, right }) {
  return (
    <div className="mb-4 mt-10 flex flex-wrap items-end justify-between gap-3 px-1">
      <div>
        <h2 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="text-[14px] text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
