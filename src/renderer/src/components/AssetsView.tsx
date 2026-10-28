import { useEffect, useState } from 'react';
import type { Asset, Finding, RiskFactor } from '@shared/types';
import { RISK_COLORS, RISK_ORDER, findingHosts } from '@shared/types';
import { newId } from '../lib/format';
import TablePager from './TablePager';

interface Props {
  assets: Asset[];
  findings: Finding[];
  onSave: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  onExport: () => void;
  onImport: () => void;
}

const statusClass = (status?: string): string => {
  const n = (status ?? '').toLowerCase();
  if (n.includes('in use') || n === 'active' || n === 'production') return 's-use';
  if (n.includes('listening')) return 's-listen';
  if (n.includes('disab') || n.includes('retire') || n.includes('decomm')) return 's-off';
  return 's-other';
};

export default function AssetsView({
  assets,
  findings,
  onSave,
  onDelete,
  onExport,
  onImport
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hostname, setHostname] = useState('');
  const [ip, setIp] = useState('');
  const [os, setOs] = useState('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('');
  const [criticality, setCriticality] = useState<RiskFactor>('Medium');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  // a changed inventory (add, edit, import) jumps back to page 1
  useEffect(() => {
    setPage(0);
  }, [assets]);

  const reset = (): void => {
    setEditingId(null);
    setHostname('');
    setIp('');
    setOs('');
    setOwner('');
    setStatus('');
    setCriticality('Medium');
    setNotes('');
    setError(null);
  };

  const submit = (): void => {
    const name = hostname.trim();
    if (!name) {
      setError('Hostname is required.');
      return;
    }
    const duplicate = assets.find(
      (a) => a.hostname.toLowerCase() === name.toLowerCase() && a.id !== editingId
    );
    if (duplicate) {
      setError('An asset with this hostname already exists.');
      return;
    }
    const nowIso = new Date().toISOString();
    const existing = editingId ? assets.find((a) => a.id === editingId) : undefined;
    onSave({
      id: editingId ?? newId(),
      hostname: name,
      ip: ip.trim() || undefined,
      os: os.trim() || undefined,
      owner: owner.trim() || undefined,
      criticality,
      notes: notes.trim() || undefined,
      status: status.trim() || undefined,
      range: existing?.range,
      source: existing?.source,
      ref: existing?.ref,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso
    });
    reset();
  };

  const startEdit = (asset: Asset): void => {
    setEditingId(asset.id);
    setHostname(asset.hostname);
    setIp(asset.ip ?? '');
    setOs(asset.os ?? '');
    setOwner(asset.owner ?? '');
    setStatus(asset.status ?? '');
    setCriticality(asset.criticality);
    setNotes(asset.notes ?? '');
    setError(null);
  };

  const findingsFor = (asset: Asset): Finding[] =>
    findings.filter((f) => {
      const hosts = findingHosts(f).map((h) => h.toLowerCase());
      return (
        hosts.includes(asset.hostname.toLowerCase()) ||
        (asset.ip ? hosts.includes(asset.ip.toLowerCase()) : false)
      );
    });

  const withStatus = assets.filter((a) => a.status).length;

  const pageCount = Math.max(1, Math.ceil(assets.length / size));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = assets
    .map((a, i) => ({ a, i }))
    .slice(safePage * size, safePage * size + size);

  return (
    <main className="assets-view" id="assets-view">
      <div className="vuln-head">
        <div className="vuln-title-wrap">
          <span className="week-kicker">Asset registry</span>
          <h1 className="view-title">Assets</h1>
          <p className="view-sub">
            Every host in scope — import your inventory sheet, then findings link automatically by
            hostname and IP.
          </p>
        </div>
        <div className="vuln-actions">
          <span className="risk-chip risk-total">
            Assets <b>{assets.length}</b>
          </span>
          {withStatus > 0 && (
            <span className="risk-chip">
              Status known <b>{withStatus}</b>
            </span>
          )}
          <button
            className="btn btn-ghost"
            id="export-assets"
            onClick={onExport}
            disabled={assets.length === 0}
          >
            ⬆ Export Excel
          </button>
          <button className="btn btn-ghost" id="import-assets" onClick={onImport}>
            ⬇ Import Excel
          </button>
        </div>
      </div>

      <div className="asset-form" id="asset-form">
        <div className="field">
          <label htmlFor="asset-hostname">Hostname *</label>
          <input
            id="asset-hostname"
            className="input"
            placeholder="e.g. HQ_BURERA_C6506"
            value={hostname}
            onChange={(e) => {
              setHostname(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="asset-ip">IP address</label>
          <input
            id="asset-ip"
            className="input"
            placeholder="10.10.171.3"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="asset-os">OS / platform</label>
          <input
            id="asset-os"
            className="input"
            placeholder="Cisco IOS, Windows Server…"
            value={os}
            onChange={(e) => setOs(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="asset-owner">Owner / team</label>
          <input
            id="asset-owner"
            className="input"
            placeholder="Network team"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="asset-status">Status</label>
          <input
            id="asset-status"
            className="input"
            placeholder="In Use, Listening for Logs…"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="asset-crit">Criticality</label>
          <select
            id="asset-crit"
            className="select"
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as RiskFactor)}
          >
            {RISK_ORDER.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="field field-wide">
          <label htmlFor="asset-notes">Notes</label>
          <input
            id="asset-notes"
            className="input"
            placeholder="Rack, VLAN, contacts…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="asset-form-actions">
          <button className="btn btn-yellow" id="asset-add" onClick={submit}>
            {editingId ? 'Update asset' : '+ Add asset'}
          </button>
          {editingId && (
            <button className="btn btn-ghost" id="asset-cancel" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
        {error && <div className="form-error asset-error">{error}</div>}
      </div>

      {assets.length === 0 ? (
        <div className="empty-vuln">
          <div className="empty-glyph">🖧</div>
          <strong>No assets yet</strong>
          <p>
            Import an Excel/CSV inventory sheet — or register hosts one by one. Findings are linked
            to assets automatically by hostname / IP.
          </p>
        </div>
      ) : (
        <div className="vuln-table-wrap">
          <table className="vuln-table asset-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Hostname</th>
                <th>IP</th>
                <th>OS</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Criticality</th>
                <th>Findings</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ a, i }) => {
                const linked = findingsFor(a);
                const sub = [a.range, a.source].filter(Boolean).join(' · ');
                return (
                  <tr key={a.id}>
                    <td className="cell-num">{a.ref ?? i + 1}</td>
                    <td>
                      <b>{a.hostname}</b>
                      {sub && <div className="cell-sub">{sub}</div>}
                    </td>
                    <td className="cell-time">{a.ip ?? '—'}</td>
                    <td>{a.os ?? '—'}</td>
                    <td>
                      {a.status ? (
                        <span className={`asset-status ${statusClass(a.status)}`}>{a.status}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{a.owner ?? '—'}</td>
                    <td>
                      <span className="risk-tag" style={{ background: RISK_COLORS[a.criticality] }}>
                        {a.criticality}
                      </span>
                    </td>
                    <td className="cell-sla">
                      <span
                        className={`sla${linked.some((f) => f.status === 'Open') ? ' breach' : ''}`}
                        title={linked.map((f) => f.description).join('\n')}
                      >
                        {linked.length}
                      </span>
                    </td>
                    <td>
                      <span className="clamp-2" title={a.notes}>
                        {a.notes ?? '—'}
                      </span>
                    </td>
                    <td className="row-actions-cell">
                      <button className="btn btn-ghost" id={`asset-edit-${i}`} onClick={() => startEdit(a)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-danger-ghost"
                        id={`asset-del-${i}`}
                        onClick={() => onDelete(a)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {assets.length > 0 && (
        <TablePager
          idPrefix="asset"
          total={assets.length}
          page={safePage}
          size={size}
          onPage={setPage}
          onSize={setSize}
        />
      )}
    </main>
  );
}
