import { useEffect, useState } from 'react';
import type { Engagement } from '@shared/types';
import { isoDate } from '@shared/date';

interface Props {
  weekLabel: string;
  findingsCount: number;
  engagements: Engagement[];
  exporting: boolean;
  onExportWeekly: () => void;
  onExportPptx: () => void;
  onExportDay: (date: string, format: 'xlsx' | 'pptx') => void;
  onExportScope: (engagement: Engagement, format: 'xlsx' | 'pdf') => void;
  onExportPentest: (engagement: Engagement, format: 'pdf' | 'html') => void;
  onExportVuln: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImport: () => void;
}

/** Central export hub — every report, every format, in one place. */
export default function ReportsView({
  weekLabel,
  findingsCount,
  engagements,
  exporting,
  onExportWeekly,
  onExportPptx,
  onExportDay,
  onExportScope,
  onExportPentest,
  onExportVuln,
  onExportCsv,
  onExportJson,
  onImport
}: Props) {
  const [day, setDay] = useState(() => isoDate(new Date()));
  const [engId, setEngId] = useState<string>('');

  useEffect(() => {
    if (!engagements.some((e) => e.id === engId)) setEngId(engagements[0]?.id ?? '');
  }, [engagements, engId]);

  const selected = engagements.find((e) => e.id === engId) ?? null;

  return (
    <main className="reports-view" id="reports-view">
      <div className="vuln-head">
        <div className="vuln-title-wrap">
          <span className="week-kicker">Reporting &amp; backups</span>
          <h1 className="view-title">Reports</h1>
          <p className="view-sub">
            Every export in one place — pick the report, pick the format. Weekly, daily and
            engagement reports, vulnerability sheets and full backups, all generated on this
            device.
          </p>
        </div>
      </div>

      <div className="vuln-table-wrap report-table-wrap">
        <table className="vuln-table report-table">
          <thead>
            <tr>
              <th>Report</th>
              <th>Details</th>
              <th>Formats</th>
            </tr>
          </thead>
          <tbody>
            <tr className="rep-row">
              <td>
                <b>Penetration test report</b>
                <span className="risk-chip">Cover · TOC · Findings</span>
                <p className="cell-sub">
                  Client-ready report — cover page, table of contents, executive summary with
                  methodology, scope, attack narrative, CVSSv4 findings, detailed findings and
                  appendices.
                </p>
              </td>
              <td>
                <label htmlFor="rep-pentest-eng">Engagement</label>
                <select
                  className="input"
                  id="rep-pentest-eng"
                  value={engId}
                  onChange={(e) => setEngId(e.target.value)}
                  disabled={engagements.length === 0}
                >
                  {engagements.length === 0 && <option value="">No engagements yet</option>}
                  {engagements.map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name || 'Untitled engagement'}
                      {eng.client ? ` — ${eng.client}` : ''}
                    </option>
                  ))}
                </select>
                <p className="muted report-hint">
                  Project type, dates, narrative and RoE live in Engagement → Report details;
                  firm and tester details come from your saved Report profile.
                </p>
              </td>
              <td className="row-actions-cell">
                <div className="report-formats">
                  <button
                    className="btn btn-yellow"
                    id="rep-pentest-pdf"
                    disabled={exporting || !selected}
                    onClick={() => selected && onExportPentest(selected, 'pdf')}
                  >
                    PDF .pdf
                  </button>
                  <button
                    className="btn"
                    id="rep-pentest-html"
                    disabled={exporting || !selected}
                    onClick={() => selected && onExportPentest(selected, 'html')}
                  >
                    HTML .html
                  </button>
                </div>
              </td>
            </tr>

            <tr className="rep-row">
              <td>
                <b>Weekly report</b>
                <p className="cell-sub">
                  This week&apos;s tasks, risk trend and findings — department template layout.
                </p>
              </td>
              <td>
                <span className="risk-chip risk-total">{weekLabel}</span>
              </td>
              <td className="row-actions-cell">
                <div className="report-formats">
                  <button
                    className="btn btn-yellow"
                    id="rep-weekly-xlsx"
                    disabled={exporting}
                    onClick={onExportWeekly}
                  >
                    Excel .xlsx
                  </button>
                  <button
                    className="btn"
                    id="rep-weekly-pptx"
                    disabled={exporting}
                    onClick={onExportPptx}
                  >
                    PowerPoint .pptx
                  </button>
                </div>
              </td>
            </tr>

            <tr className="rep-row">
              <td>
                <b>Day activity report</b>
                <p className="cell-sub">Tasks and activity log for a chosen day.</p>
              </td>
              <td>
                <label htmlFor="rep-day-date">Date</label>
                <input
                  className="input"
                  id="rep-day-date"
                  type="date"
                  value={day}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                />
              </td>
              <td className="row-actions-cell">
                <div className="report-formats">
                  <button
                    className="btn btn-yellow"
                    id="rep-day-xlsx"
                    disabled={exporting}
                    onClick={() => onExportDay(day, 'xlsx')}
                  >
                    Excel .xlsx
                  </button>
                  <button
                    className="btn"
                    id="rep-day-pptx"
                    disabled={exporting}
                    onClick={() => onExportDay(day, 'pptx')}
                  >
                    PowerPoint .pptx
                  </button>
                </div>
              </td>
            </tr>

            <tr className="rep-row">
              <td>
                <b>Engagement scope report</b>
                <p className="cell-sub">
                  Scope in/out, rules of engagement and the methodology checklist.
                </p>
              </td>
              <td>
                <label htmlFor="rep-eng-select">Engagement</label>
                <select
                  className="input"
                  id="rep-eng-select"
                  value={engId}
                  onChange={(e) => setEngId(e.target.value)}
                  disabled={engagements.length === 0}
                >
                  {engagements.length === 0 && <option value="">No engagements yet</option>}
                  {engagements.map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name || 'Untitled engagement'}
                      {eng.client ? ` — ${eng.client}` : ''}
                    </option>
                  ))}
                </select>
                {engagements.length === 0 && (
                  <p className="muted report-hint">
                    Create an engagement first — see the Engagement tab.
                  </p>
                )}
              </td>
              <td className="row-actions-cell">
                <div className="report-formats">
                  <button
                    className="btn btn-yellow"
                    id="rep-scope-xlsx"
                    disabled={exporting || !selected}
                    onClick={() => selected && onExportScope(selected, 'xlsx')}
                  >
                    Excel .xlsx
                  </button>
                  <button
                    className="btn"
                    id="rep-scope-pdf"
                    disabled={exporting || !selected}
                    onClick={() => selected && onExportScope(selected, 'pdf')}
                  >
                    PDF .pdf
                  </button>
                </div>
              </td>
            </tr>

            <tr className="rep-row">
              <td>
                <b>Vulnerability assessment</b>
                <p className="cell-sub">Full findings table with CVSS, SLA and control tags.</p>
              </td>
              <td>
                <span className="risk-chip">
                  <b>{findingsCount}</b> findings
                </span>
              </td>
              <td className="row-actions-cell">
                <div className="report-formats">
                  <button
                    className="btn btn-yellow"
                    id="rep-vuln-xlsx"
                    disabled={exporting}
                    onClick={onExportVuln}
                  >
                    Excel .xlsx
                  </button>
                </div>
              </td>
            </tr>

            <tr className="rep-row">
              <td>
                <b>Data &amp; backup</b>
                <p className="cell-sub">
                  Quick sheet export, a full JSON backup of everything, or restore from a previous
                  backup.
                </p>
              </td>
              <td>
                <span className="risk-chip">Restore included</span>
              </td>
              <td className="row-actions-cell">
                <div className="report-formats">
                  <button className="btn" id="rep-csv" disabled={exporting} onClick={onExportCsv}>
                    This week .csv
                  </button>
                  <button className="btn" id="rep-json" disabled={exporting} onClick={onExportJson}>
                    Full plan .json
                  </button>
                  <button className="btn btn-ghost" id="rep-import" onClick={onImport}>
                    Restore from JSON…
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </main>
  );
}
