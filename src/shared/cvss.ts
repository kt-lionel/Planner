import type { RiskFactor } from './types';

/** CVSS v3.1 base-score calculator (offline, no dependencies). */

export interface CvvMetricOption {
  value: string;
  label: string;
}

export interface CvssMetricDef {
  key: 'AV' | 'AC' | 'PR' | 'UI' | 'S' | 'C' | 'I' | 'A';
  label: string;
  options: CvvMetricOption[];
}

export const CVSS_METRICS: CvssMetricDef[] = [
  {
    key: 'AV',
    label: 'Attack Vector',
    options: [
      { value: 'N', label: 'Network' },
      { value: 'A', label: 'Adjacent' },
      { value: 'L', label: 'Local' },
      { value: 'P', label: 'Physical' }
    ]
  },
  {
    key: 'AC',
    label: 'Attack Complexity',
    options: [
      { value: 'L', label: 'Low' },
      { value: 'H', label: 'High' }
    ]
  },
  {
    key: 'PR',
    label: 'Privileges Required',
    options: [
      { value: 'N', label: 'None' },
      { value: 'L', label: 'Low' },
      { value: 'H', label: 'High' }
    ]
  },
  {
    key: 'UI',
    label: 'User Interaction',
    options: [
      { value: 'N', label: 'None' },
      { value: 'R', label: 'Required' }
    ]
  },
  {
    key: 'S',
    label: 'Scope',
    options: [
      { value: 'U', label: 'Unchanged' },
      { value: 'C', label: 'Changed' }
    ]
  },
  {
    key: 'C',
    label: 'Confidentiality',
    options: [
      { value: 'H', label: 'High' },
      { value: 'L', label: 'Low' },
      { value: 'N', label: 'None' }
    ]
  },
  {
    key: 'I',
    label: 'Integrity',
    options: [
      { value: 'H', label: 'High' },
      { value: 'L', label: 'Low' },
      { value: 'N', label: 'None' }
    ]
  },
  {
    key: 'A',
    label: 'Availability',
    options: [
      { value: 'H', label: 'High' },
      { value: 'L', label: 'Low' },
      { value: 'N', label: 'None' }
    ]
  }
];

export type CvssVector = Record<CvssMetricDef['key'], string>;

export const DEFAULT_VECTOR: CvssVector = {
  AV: 'N',
  AC: 'L',
  PR: 'N',
  UI: 'N',
  S: 'U',
  C: 'H',
  I: 'H',
  A: 'H'
};

const AV_W: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_W: Record<string, number> = { L: 0.77, H: 0.44 };
const PR_W_UNCHANGED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_W_CHANGED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };
const UI_W: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA_W: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

/** Round up to one decimal place (CVSS v3.1 Roundup). */
function roundup(x: number): number {
  return Math.ceil(x * 10) / 10;
}

/** Parses "CVSS:3.1/AV:N/…" into metric values. Returns null when malformed. */
export function parseCvssVector(vector: string): CvssVector | null {
  const trimmed = vector.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/');
  if (parts.length < 2) return null;
  if (!/^CVSS:3\.[01]$/i.test(parts[0])) return null;
  const out: Partial<CvssVector> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf(':');
    if (eq < 1) return null;
    const key = part.slice(0, eq).toUpperCase();
    const value = part.slice(eq + 1).toUpperCase();
    if (!CVSS_METRICS.some((m) => m.key === key)) return null;
    const def = CVSS_METRICS.find((m) => m.key === key);
    if (!def || !def.options.some((o) => o.value === value)) return null;
    out[key as CvssMetricDef['key']] = value;
  }
  const missing = CVSS_METRICS.filter((m) => !out[m.key]);
  if (missing.length) return null;
  return out as CvssVector;
}

/** Builds the canonical "CVSS:3.1/…" string from metric values. */
export function buildCvssVector(metrics: CvssVector): string {
  return `CVSS:3.1/${CVSS_METRICS.map((m) => `${m.key}:${metrics[m.key]}`).join('/')}`;
}

/** Base score for a vector, or null when the vector cannot be parsed. */
export function cvssBaseScore(vector: string): number | null {
  const m = parseCvssVector(vector);
  if (!m) return null;
  const changed = m.S === 'C';
  const pr = changed ? PR_W_CHANGED[m.PR] : PR_W_UNCHANGED[m.PR];
  const av = AV_W[m.AV];
  const ac = AC_W[m.AC];
  const ui = UI_W[m.UI];
  const iss =
    1 -
    (1 - CIA_W[m.C]) * (1 - CIA_W[m.I]) * (1 - CIA_W[m.A]);
  const impact = changed
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av * ac * pr * ui;
  const raw = changed
    ? 1.08 * (impact + exploitability)
    : impact + exploitability;
  return Math.min(10, roundup(raw));
}

/** Risk-factor label for a score (0 → Info, 9.0+ → Critical). */
export function cvssSeverity(score: number): RiskFactor {
  if (score <= 0) return 'Info';
  if (score < 4) return 'Low';
  if (score < 7) return 'Medium';
  if (score < 9) return 'High';
  return 'Critical';
}
