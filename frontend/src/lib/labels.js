// Human labels for the level / state keys returned by the API.

const OVERRIDES = {
  very_hot: 'Very hot',
  very_dry: 'Very dry',
  very_humid: 'Very humid',
  very_dark: 'Very dark',
  low_light: 'Low light',
  indoor: 'Indoor lighting',
  well_lit: 'Well lit',
  direct_sun: 'Direct sunlight',
  too_cold_to_charge: 'Too cold to charge',
  weak_sun: 'Weak sun',
  partial_sun: 'Partial sun',
  good_sun: 'Good sun',
  full_sun: 'Full sun',
  very_good: 'Very good',
  light: 'Light load',
  moderate: 'Moderate',
  heavy: 'Heavy load',
  charger_active: 'Charger active',
  charger_limit: 'At charger limit',
  below_minimum: 'Below charger minimum',
  no_input: 'No input',
  usb_spec_ok: 'Within USB spec',
  usb_spec_out: 'Out of USB spec',
};

export const label = (key) => {
  if (!key) return '--';
  if (OVERRIDES[key]) return OVERRIDES[key];
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const FLOW_STATE = {
  charging: { title: 'Charging', tone: 'sage' },
  full: { title: 'Powered by source', tone: 'sky' },
  battery: { title: 'On battery', tone: 'apricot' },
};

// Pastel tone tokens defined in index.css (@theme).
export const TONES = {
  peach: { fg: 'var(--color-peach)', bg: 'var(--color-peach-bg)', line: 'var(--color-peach-line)' },
  sky: { fg: 'var(--color-sky)', bg: 'var(--color-sky-bg)', line: 'var(--color-sky-line)' },
  lilac: { fg: 'var(--color-lilac)', bg: 'var(--color-lilac-bg)', line: 'var(--color-lilac-line)' },
  butter: { fg: 'var(--color-butter)', bg: 'var(--color-butter-bg)', line: 'var(--color-butter-line)' },
  sage: { fg: 'var(--color-sage)', bg: 'var(--color-sage-bg)', line: 'var(--color-sage-line)' },
  apricot: { fg: 'var(--color-apricot)', bg: 'var(--color-apricot-bg)', line: 'var(--color-apricot-line)' },
  teal: { fg: 'var(--color-teal)', bg: 'var(--color-teal-bg)', line: 'var(--color-teal-line)' },
  rose: { fg: 'var(--color-rose)', bg: 'var(--color-rose-bg)', line: 'var(--color-rose-line)' },
  coral: { fg: 'var(--color-coral)', bg: 'var(--color-coral-bg)', line: 'var(--color-coral-line)' },
  slate: { fg: 'var(--color-slate)', bg: 'var(--color-slate-bg)', line: 'var(--color-slate-line)' },
};

/** Battery tone by percent. */
export const batteryTone = (pct) => (pct == null ? 'slate' : pct >= 35 ? 'sage' : pct >= 15 ? 'apricot' : 'coral');
