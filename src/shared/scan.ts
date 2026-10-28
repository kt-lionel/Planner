import type { RiskFactor } from './types';

/**
 * Parses scanner exports (Nessus CSV and generic CSV) into flat rows.
 * Offline, dependency-free CSV reader with RFC4180-style quoting.
 */

export interface ScanRow {
  host: string;
  port?: string;
  proto?: string;
  /** Plugin / rule name */
  name: string;
  risk: RiskFactor;
  cve?: string;
  cvss?: number;
  solution?: string;
  synopsis?: string;
  pluginId?: string;
}

/** RFC4180-ish CSV → array of rows (arrays of cells). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function riskOf(raw: string): RiskFactor {
  const v = raw.trim().toLowerCase();
  if (v === 'critical') return 'Critical';
  if (v === 'high') return 'High';
  if (v === 'medium') return 'Medium';
  if (v === 'low') return 'Low';
  return 'Info';
}

function findCol(headers: string[], ...candidates: string[]): number {
  for (const want of candidates) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === want.toLowerCase());
    if (idx >= 0) return idx;
  }
  for (const want of candidates) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase().includes(want.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parses a scan export. Returns [] when no recognisable rows are found.
 * Understands Nessus CSV ("Plugin ID", "Risk", "Host", "Name", …) and
 * generic CSV with common column aliases.
 */
export function parseScanCsv(text: string): ScanRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];

  const hostCol = findCol(headers, 'host', 'ip', 'asset', 'hostname', 'address');
  const nameCol = findCol(headers, 'name', 'title', 'plugin name', 'finding', 'issue');
  const riskCol = findCol(headers, 'risk', 'severity');
  const cveCol = findCol(headers, 'cve');
  const cvssCol = findCol(
    headers,
    'cvss v3.0 base score',
    'cvss v3.1 base score',
    'cvss v3 base score',
    'cvss',
    'base score'
  );
  const solutionCol = findCol(headers, 'solution', 'remediation', 'fix', 'recommendation');
  const synopsisCol = findCol(headers, 'synopsis', 'summary');
  const pluginCol = findCol(headers, 'plugin id', 'pluginid', 'rule id', 'qid');
  const portCol = findCol(headers, 'port');
  const protoCol = findCol(headers, 'protocol', 'proto');

  if (hostCol < 0 || nameCol < 0) return [];

  const out: ScanRow[] = [];
  for (const row of rows.slice(1)) {
    const host = (row[hostCol] ?? '').trim();
    const name = (row[nameCol] ?? '').trim();
    if (!host || !name) continue;
    const cvssRaw = cvssCol >= 0 ? Number.parseFloat(row[cvssCol] ?? '') : Number.NaN;
    const cvss = Number.isFinite(cvssRaw) && cvssRaw >= 0 && cvssRaw <= 10 ? cvssRaw : undefined;
    const cve = cveCol >= 0 ? (row[cveCol] ?? '').trim() || undefined : undefined;
    const risk =
      riskCol >= 0 && (row[riskCol] ?? '').trim()
        ? riskOf(row[riskCol])
        : cvss !== undefined
          ? cvss >= 9
            ? 'Critical'
            : cvss >= 7
              ? 'High'
              : cvss >= 4
                ? 'Medium'
                : cvss > 0
                  ? 'Low'
                  : 'Info'
          : 'Info';
    out.push({
      host,
      name,
      risk,
      cve,
      cvss,
      port: portCol >= 0 ? (row[portCol] ?? '').trim() || undefined : undefined,
      proto: protoCol >= 0 ? (row[protoCol] ?? '').trim() || undefined : undefined,
      solution: solutionCol >= 0 ? (row[solutionCol] ?? '').trim() || undefined : undefined,
      synopsis: synopsisCol >= 0 ? (row[synopsisCol] ?? '').trim() || undefined : undefined,
      pluginId: pluginCol >= 0 ? (row[pluginCol] ?? '').trim() || undefined : undefined
    });
  }
  return out;
}
