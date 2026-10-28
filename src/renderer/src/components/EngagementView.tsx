import { useEffect, useState } from 'react';
import type { Engagement, EngagementPhase } from '@shared/types';
import { PROJECT_TYPES } from '@shared/types';
import { newId } from '../lib/format';
import TablePager from './TablePager';

interface Props {
  engagements: Engagement[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onChange: (next: Engagement) => void;
  onGenerateTasks: (phaseNames: string[]) => void;
}

export const DEFAULT_ENGAGEMENT: Engagement = {
  id: newId(),
  name: '',
  client: '',
  scopeIn: '',
  scopeOut: '',
  roe: '',
  phases: [
    'Pre-engagement interactions',
    'Intelligence gathering',
    'Threat modeling',
    'Vulnerability analysis',
    'Exploitation',
    'Post-exploitation',
    'Reporting',
    'Remediation retest'
  ].map((name) => ({ id: newId(), name, done: false }))
};

const FIELD_LABELS: Array<{ key: keyof Engagement; id: string; label: string; placeholder: string; rows?: number }> = [
  { key: 'name', id: 'eng-name', label: 'Engagement name', placeholder: 'e.g. Internal Network Penetration Test' },
  { key: 'client', id: 'eng-client', label: 'Client / requester', placeholder: 'e.g. IT Infrastructure Dept' },
  {
    key: 'scopeIn',
    id: 'eng-scope-in',
    label: 'Scope — in',
    placeholder: '10.0.0.0/24, webapp.example.com, physical social engineering…',
    rows: 3
  },
  {
    key: 'scopeOut',
    id: 'eng-scope-out',
    label: 'Scope — out of bounds',
    placeholder: '10.0.5.0/24 (prod DB), DoS testing, third-party SaaS…',
    rows: 3
  },
  {
    key: 'roe',
    id: 'eng-roe',
    label: 'Rules of engagement',
    placeholder: 'Working hours, emergency contacts, allowed techniques, escalation…',
    rows: 4
  }
];

function scopePreview(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return 'No scope recorded yet.';
  return lines.slice(0, 2).join(' · ');
}

/** Engagement registry: a list of recorded engagements, or the active one. */
export default function EngagementView({
  engagements,
  activeId,
  onSelect,
  onDeselect,
  onCreate,
  onDelete,
  onChange,
  onGenerateTasks
}: Props) {
  const [phaseName, setPhaseName] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const active = engagements.find((e) => e.id === activeId) ?? null;

  // a changed registry (create, delete) jumps back to page 1
  useEffect(() => {
    setPage(0);
  }, [engagements]);

  const pageCount = Math.max(1, Math.ceil(engagements.length / size));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = engagements
    .map((eng, i) => ({ eng, i }))
    .slice(safePage * size, safePage * size + size);

  // ---- list mode ------------------------------------------------------
  if (!active) {
    return (
      <main className="engage eng-list-mode" id="engage-view">
        <div className="vuln-head">
          <div className="vuln-title-wrap">
            <span className="week-kicker">Pentest engagements</span>
            <h1 className="view-title">Engagements</h1>
            <p className="view-sub">
              Every engagement with its scope, rules of engagement and methodology checklist —
              open one to work on it, or export its scope report from Reports.
            </p>
          </div>
          <div className="vuln-actions">
            <button className="btn btn-yellow" id="eng-new" onClick={onCreate}>
              + New engagement
            </button>
          </div>
        </div>

        {engagements.length === 0 ? (
          <div className="dash-empty eng-empty" id="eng-empty">
            No engagements yet — record your first one, then tick its phases and push them to the
            board.
          </div>
        ) : (
          <>
            <div className="vuln-table-wrap eng-table-wrap">
              <table className="vuln-table eng-table">
                <thead>
                  <tr>
                    <th>Engagement</th>
                    <th>Client</th>
                    <th>Scope</th>
                    <th>Phases</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(({ eng }) => {
                    const done = eng.phases.filter((p) => p.done).length;
                    const total = eng.phases.length;
                    const pct = total ? Math.round((done / total) * 100) : 0;
                    return (
                      <tr className="eng-row" key={eng.id} id={`eng-row-${eng.id}`}>
                        <td>
                          <b>{eng.name || 'Untitled engagement'}</b>
                        </td>
                        <td>{eng.client || '—'}</td>
                        <td>
                          <span className="clamp-2" title={eng.scopeIn}>
                            {scopePreview(eng.scopeIn)}
                          </span>
                        </td>
                        <td>
                          <div
                            className="eng-prog"
                            title={`${done} of ${total} phases complete`}
                          >
                            <i style={{ width: `${pct}%` }} />
                          </div>
                          <span className="eng-prog-label">
                            {done}/{total}
                          </span>
                        </td>
                        <td className="cell-time">
                          {eng.createdAt
                            ? new Date(eng.createdAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="row-actions-cell">
                          <button
                            className="btn btn-yellow"
                            id={`eng-open-${eng.id}`}
                            onClick={() => onSelect(eng.id)}
                          >
                            Open
                          </button>
                          <button
                            className="btn btn-ghost btn-danger-ghost"
                            id={`eng-del-${eng.id}`}
                            onClick={() => onDelete(eng.id)}
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
            <TablePager
              idPrefix="eng"
              total={engagements.length}
              page={safePage}
              size={size}
              onPage={setPage}
              onSize={setSize}
            />
          </>
        )}
      </main>
    );
  }

  // ---- detail mode ----------------------------------------------------
  const set = (key: keyof Engagement, value: string): void =>
    onChange({ ...active, [key]: value });

  const togglePhase = (id: string): void =>
    onChange({
      ...active,
      phases: active.phases.map((p: EngagementPhase) => (p.id === id ? { ...p, done: !p.done } : p))
    });

  const addPhase = (): void => {
    const name = phaseName.trim();
    if (!name) return;
    onChange({
      ...active,
      phases: [...active.phases, { id: newId(), name, done: false }]
    });
    setPhaseName('');
  };

  const removePhase = (id: string): void =>
    onChange({ ...active, phases: active.phases.filter((p) => p.id !== id) });

  const pending = active.phases.filter((p) => !p.done);
  const doneCount = active.phases.length - pending.length;

  return (
    <main className="engage" id="engage-view">
      <div className="vuln-head">
        <div className="vuln-title-wrap">
          <button className="btn btn-ghost eng-back" id="eng-back" onClick={onDeselect}>
            ← All engagements
          </button>
          <span className="week-kicker">Engagement workspace</span>
          <h1 className="view-title">{active.name || 'New engagement'}</h1>
          <p className="view-sub">
            Scope, phases and rules of engagement — tick phases as you go, then push them to the
            board as tasks. Export the scope report from the Reports tab.
          </p>
        </div>
        <div className="vuln-actions">
          <span className="risk-chip risk-total" id="eng-progress">
            Phases <b>
              {doneCount}/{active.phases.length}
            </b>
          </span>
          <button
            className="btn btn-yellow"
            id="eng-generate"
            disabled={pending.length === 0}
            onClick={() => onGenerateTasks(pending.map((p) => p.name))}
          >
            + Generate tasks ({pending.length})
          </button>
        </div>
      </div>

      <div className="engage-grid">
        <section className="dash-panel" id="engage-scope">
          <h2>Scope &amp; rules of engagement</h2>
          {FIELD_LABELS.map((field) => (
            <div className="field" key={field.key}>
              <label htmlFor={field.id}>{field.label}</label>
              {field.rows ? (
                <textarea
                  id={field.id}
                  className="textarea"
                  rows={field.rows}
                  placeholder={field.placeholder}
                  value={String(active[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              ) : (
                <input
                  id={field.id}
                  className="input"
                  placeholder={field.placeholder}
                  value={String(active[field.key] ?? '')}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              )}
            </div>
          ))}

          <h3 className="engage-subhead">Report details</h3>
          <p className="muted engage-hint">
            Drives the pentest report — project type picks the methodology section, dates and the
            attack narrative appear in the executive summary.
          </p>
          <div className="field-row">
            <div className="field">
              <label htmlFor="eng-project-type">Project type</label>
              <select
                id="eng-project-type"
                className="input"
                value={active.projectType ?? ''}
                onChange={(e) => set('projectType', e.target.value)}
              >
                <option value="">Web Application Penetration Test (default)</option>
                {PROJECT_TYPES.filter((t) => t !== 'Web Application Penetration Test').map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="eng-start">Start date</label>
              <input
                id="eng-start"
                className="input"
                type="date"
                value={active.startDate ?? ''}
                onChange={(e) => set('startDate', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="eng-end">End date</label>
              <input
                id="eng-end"
                className="input"
                type="date"
                value={active.endDate ?? ''}
                onChange={(e) => set('endDate', e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="eng-narrative">Attack narrative (markdown)</label>
            <textarea
              id="eng-narrative"
              className="textarea"
              rows={4}
              placeholder={'How the attack unfolded — **bold**, - lists, ## headings…'}
              value={active.attackNarrative ?? ''}
              onChange={(e) => set('attackNarrative', e.target.value)}
            />
          </div>
        </section>

        <section className="dash-panel" id="engage-phases">
          <div className="today-head">
            <h2>Methodology checklist</h2>
            <div className="row-actions phase-add-row">
              <input
                id="eng-phase-input"
                className="input"
                placeholder="New phase name…"
                value={phaseName}
                onChange={(e) => setPhaseName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addPhase();
                }}
              />
              <button className="btn btn-ghost" id="eng-add-phase" onClick={addPhase}>
                + Phase
              </button>
            </div>
          </div>
          <table className="vuln-table phase-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Phase</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.phases.map((phase, i) => (
                <tr key={phase.id} className={`phase-row${phase.done ? ' done' : ''}`}>
                  <td className="cell-num">{i + 1}</td>
                  <td>
                    <label className="phase-check">
                      <input
                        type="checkbox"
                        id={`phase-${i}`}
                        checked={phase.done}
                        onChange={() => togglePhase(phase.id)}
                      />
                      <span>{phase.name}</span>
                    </label>
                  </td>
                  <td>
                    {phase.done ? (
                      <span className="phase-status on">✓ Complete</span>
                    ) : (
                      <span className="phase-status">Pending</span>
                    )}
                  </td>
                  <td className="row-actions-cell">
                    <button
                      className="btn btn-ghost btn-icon"
                      id={`phase-del-${i}`}
                      title="Remove phase"
                      onClick={() => removePhase(phase.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {active.phases.length === 0 && (
                <tr className="cmd-empty-row">
                  <td colSpan={4}>
                    <span className="muted">No phases — add one to start.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted engage-hint">
            “Generate tasks” creates one board task per unfinished phase, spread across the current
            week.
          </p>
        </section>
      </div>
    </main>
  );
}
