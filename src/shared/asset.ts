import type { Asset, RiskFactor } from './types';

/**
 * Asset sheet import — reads inventory exports (Excel/CSV/TSV) with columns
 * like: #, HOSTNAME, IP ADDRESS, OS, STATUS, IP RANGE (/16), SOURCE, Has Hostname?
 * Offline, dependency-free text parsing; xlsx conversion happens in main.
 */

export interface AssetSheetRow {
  ref?: string;
  hostname: string;
  ip?: string;
  os?: string;
  status?: string;
  range?: string;
  source?: string;
  owner?: string;
  notes?: string;
  criticality: RiskFactor;
}

/** Normalize a header/cell for alias matching: lowercase, alphanumeric only. */
function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const RISK_NORMS = new Set(['critical', 'high', 'medium', 'low', 'info']);

function riskOf(value: string): RiskFactor | null {
  const n = norm(value);
  return RISK_NORMS.has(n) ? (n.charAt(0).toUpperCase() + n.slice(1)) as RiskFactor : null;
}

/** Default criticality from the STATUS column when no criticality column exists. */
function criticalityFromStatus(status: string): RiskFactor {
  const n = norm(status);
  if (n === 'inuse' || n === 'active' || n === 'production') return 'High';
  if (n === 'disabled' || n === 'retired' || n === 'decommissioned') return 'Low';
  return 'Medium';
}

/** `— NO HOSTNAME —`, `—`, `N/A`… → true. */
function isPlaceholderHost(value: string): boolean {
  const n = norm(value);
  return n === '' || n === 'nohostname' || n === 'none' || n === 'na' || n === 'null' || n === 'unknown';
}

/** Split one delimited line, honouring double-quote escaping. */
function splitLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
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
    } else if (ch === delim) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

const HEAD_ALIASES: Record<string, string[]> = {
  ref: ['#', 'id', 'no', 'num'],
  hostname: ['hostname', 'host', 'name', 'hostnamefqdn', 'device'],
  ip: ['ip', 'ipaddress', 'ipaddr', 'ipv4'],
  os: ['os', 'operatingsystem', 'platform', 'ostype'],
  status: ['status', 'state'],
  range: ['iprange', 'iprange16', 'range', 'subnet', 'cidr'],
  source: ['source', 'srctype', 'origin'],
  owner: ['owner', 'team', 'responsible', 'assignedto'],
  notes: ['notes', 'remarks', 'comment', 'comments'],
  criticality: ['criticality', 'crit', 'risk', 'riskfactor', 'priority']
};

function fieldFor(header: string): string | null {
  const raw = header.trim();
  const n = norm(header);
  for (const [field, aliases] of Object.entries(HEAD_ALIASES)) {
    // aliases may be symbols ('#') that norm() strips to '', so try raw too
    if (aliases.includes(n) || aliases.includes(raw)) return field;
  }
  return null;
}

/** Convert a grid of cells (first row = header) into asset sheet rows. */
export function parseAssetRows(grid: string[][]): AssetSheetRow[] {
  // Find the header row: first row with a hostname or IP column.
  let headerIndex = -1;
  let columns: Record<string, number> = {};
  for (let i = 0; i < Math.min(grid.length, 10); i += 1) {
    const map: Record<string, number> = {};
    grid[i].forEach((cell, col) => {
      const field = fieldFor(cell.trim());
      if (field && map[field] === undefined) map[field] = col;
    });
    if (map.hostname !== undefined || map.ip !== undefined) {
      headerIndex = i;
      columns = map;
      break;
    }
  }
  if (headerIndex < 0) return [];

  const rows: AssetSheetRow[] = [];
  const takenIps = new Set<string>();
  const cellAt = (line: string[], field: string): string => {
    const col = columns[field];
    if (col === undefined) return '';
    return (line[col] ?? '').trim();
  };

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const line = grid[i];
    if (!line || !line.some((c) => c.trim() !== '')) continue;

    const rawHost = cellAt(line, 'hostname');
    const ip = cellAt(line, 'ip') || undefined;
    const placeholder = isPlaceholderHost(rawHost);
    let hostname = placeholder ? '' : rawHost;
    if (!hostname && !ip) continue; // empty row
    if (!hostname) hostname = ip as string; // display fallback: IP as name

    if (ip) {
      const key = ip.toLowerCase();
      if (takenIps.has(key)) continue; // duplicate row inside the sheet
      takenIps.add(key);
    }

    const status = cellAt(line, 'status') || undefined;
    const explicitRisk = riskOf(cellAt(line, 'criticality'));
    const notes = cellAt(line, 'notes') || undefined;

    rows.push({
      ref: cellAt(line, 'ref') || undefined,
      hostname,
      ip,
      os: cellAt(line, 'os') || undefined,
      status,
      range: cellAt(line, 'range') || undefined,
      source: cellAt(line, 'source') || undefined,
      owner: cellAt(line, 'owner') || undefined,
      notes: [
        placeholder ? 'No hostname in source file' : '',
        notes ?? ''
      ]
        .filter((part) => part)
        .join(' · ') || undefined,
      criticality: explicitRisk ?? (status ? criticalityFromStatus(status) : 'Medium')
    });
  }
  return rows;
}

/** Parse raw CSV/TSV text (tab- or comma-delimited) into asset sheet rows. */
export function parseAssetSheet(text: string): AssetSheetRow[] {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (!lines.length) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const grid = lines.map((line) => splitLine(line, delim));
  return parseAssetRows(grid);
}

/** Map a sheet row to a full Asset record. */
export function rowToAsset(
  row: AssetSheetRow,
  id: string,
  nowIso: string
): Asset {
  return {
    id,
    hostname: row.hostname,
    ip: row.ip,
    os: row.os,
    owner: row.owner,
    criticality: row.criticality,
    notes: row.notes,
    status: row.status,
    range: row.range,
    source: row.source,
    ref: row.ref,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}
