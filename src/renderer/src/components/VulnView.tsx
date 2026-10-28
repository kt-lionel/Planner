import { useState } from 'react';
import type { Finding, FindingStatus, RiskFactor, VulnReport } from '@shared/types';
import {
  FINDING_STATUSES,
  RISK_COLORS,
  RISK_ORDER,
  findingBreached,
  findingHosts,
  findingIsOpen,
  findingOpenDays
} from '@shared/types';

interface Props {
  report: VulnReport;
  onTitle: (title: string) => void;
  onAdd: () => void;
  onOpen: (finding: Finding) => void;
  onImportScan: () => void;
}

function timelineText(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

type Filter = FindingStatus | 'All';

export default function VulnView({
  report,
  onTitle,
  onAdd,
  onOpen,
  onImportScan
}: Props) {
  const [filter, setFilter] = useState<Filter>('All');
  const all = report.findings;
  const findings = filter === 'All' ? all : all.filter((f) => f.status === filter);
  const counts = RISK_ORDER.map((risk) => ({
    risk,
    count: all.filter((f) => f.risk === risk).length
  }));
  const open = all.filter((f) => findingIsOpen(f)).length;
  const breached = all.filter((f) => findingBreached(f)).length;

  return (
    <main className="vuln">
      <div className="vuln-head">
        <div className="vuln-title-wrap">
          <span className="week-kicker">Vulnerability report</span>
          <input
            className="vuln-title"
            placeholder="Assessment title, e.g. DNS Resolver Security Assessment 12th - 14th August 2026"
            value={report.title}
            onChange={(e) => onTitle(e.target.value)}
            aria-label="Assessment title"
          />
          <p className="view-sub">
            Scanner imports, CVSS scoring, SLA tracking and compliance tagging — the source of the
            vulnerability report.
          </p>
        </div>
        <div className="vuln-actions">
          <button className="btn btn-yellow" id="new-finding" onClick={onAdd}>
            + Finding
          </button>
          <button className="btn" id="import-scan" onClick={onImportScan}>
            Import scan
          </button>
        </div>
      </div>

      <div className="risk-strip">
        {counts.map(({ risk, count }) => (
          <span
            key={risk}
            className="risk-chip"
            style={{ background: count ? RISK_COLORS[risk as RiskFactor] : undefined }}
            data-empty={count === 0 ? 'true' : undefined}
          >
            {risk} <b>{count}</b>
          </span>
        ))}
        <span className="risk-chip risk-total">
          Total <b>{all.length}</b>
        </span>
        <span className="risk-chip risk-open">
          Open <b>{open}</b>
        </span>
        <span className="risk-chip risk-breach" data-empty={breached === 0 ? 'true' : undefined}>
          SLA breach <b>{breached}</b>
        </span>
      </div>

      <div className="vuln-filter" id="vuln-filter">
        {(['All', ...FINDING_STATUSES] as Filter[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`filter-chip${filter === s ? ' active' : ''}`}
            data-status={s}
            onClick={() => setFilter(s)}
          >
            {s}
            <b>{s === 'All' ? all.length : all.filter((f) => f.status === s).length}</b>
          </button>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="empty-vuln">
          <div className="empty-glyph">🛡</div>
          <strong>No findings yet</strong>
          <p>Add the first finding — it will be exported into the report exactly like your template.</p>
          <button className="btn btn-yellow" onClick={onAdd}>
            + Add the first finding
          </button>
        </div>
      ) : findings.length === 0 ? (
        <div className="empty-vuln">
          <div className="empty-glyph">🔍</div>
          <strong>No findings with status “{filter}”</strong>
          <button className="btn" onClick={() => setFilter('All')}>
            Show all
          </button>
        </div>
      ) : (
        <div className="vuln-table-wrap">
          <table className="vuln-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Risk factor</th>
                <th>Host / affected system</th>
                <th>Description</th>
                <th>Timeline</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Responsible team</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id} onClick={() => onOpen(f)} title="Click to edit">
                  <td className="cell-num">{all.indexOf(f) + 1}</td>
                  <td>
                    <span className="risk-tag" style={{ background: RISK_COLORS[f.risk] }}>
                      {f.risk}
                    </span>
                    {f.cvss && (
                      <span className="cvss-badge" title={f.cvss.vector}>
                        {f.cvss.score.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="cell-host">
                    {findingHosts(f).map((h) => (
                      <span className="host-line" key={h}>
                        {h}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span className="clamp-2" title={f.description}>
                      {f.description}
                    </span>
                  </td>
                  <td className="cell-time">{timelineText(f.timeline)}</td>
                  <td>
                    <span className="status-tag" data-status={f.status}>
                      {f.status}
                    </span>
                  </td>
                  <td className="cell-sla">
                    {findingIsOpen(f) ? (
                      <span className={`sla${findingBreached(f) ? ' breach' : ''}`}>
                        {findingOpenDays(f)}d{findingBreached(f) ? ' ⚠' : ''}
                      </span>
                    ) : (
                      <span className="sla closed">✓</span>
                    )}
                  </td>
                  <td>{f.team || '—'}</td>
                  <td>
                    {f.evidence ? (
                      <img
                        className="evidence-thumb"
                        src={`file://${f.evidence}`}
                        alt="Evidence"
                        title={f.evidence}
                      />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
