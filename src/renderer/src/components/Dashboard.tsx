import type { RiskFactor, RiskSnapshot, Task, VulnReport } from '@shared/types';
import { RISK_COLORS, RISK_ORDER, STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from '@shared/types';
import { isoDate } from '@shared/date';
import TodayPanel from './TodayPanel';

interface Props {
  tasks: Task[];
  weekTasks: Task[];
  weekLabel: string;
  vuln: VulnReport;
  risk: RiskSnapshot[];
  onStatusChange: (task: Task) => void;
  onOpenTask: (task: Task) => void;
  onQuickAdd: (title: string) => void;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function Dashboard({
  tasks,
  weekTasks,
  weekLabel,
  vuln,
  risk,
  onStatusChange,
  onOpenTask,
  onQuickAdd
}: Props) {
  const todayIso = isoDate(new Date());
  const count = (status: string): number => tasks.filter((t) => t.status === status).length;
  const done = count('done');
  const canceled = count('canceled');
  const inProgress = count('in_progress');
  const blocked = count('blocked');
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdue = tasks.filter(
    (t) =>
      t.dueDate &&
      t.dueDate < todayIso &&
      t.status !== 'done' &&
      t.status !== 'canceled'
  );

  const deadlines = tasks
    .filter(
      (t) =>
        t.recurrence === 'none' &&
        t.dueDate &&
        t.status !== 'done' &&
        t.status !== 'canceled'
    )
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 6);

  const recent = [...tasks]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const weekCounts = Array.from({ length: 7 }, (_, i) =>
    weekTasks.filter((t) => {
      const [y, m, d] = t.date.split('-').map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return (day === 0 ? 6 : day - 1) === i;
    }).length
  );
  const weekMax = Math.max(1, ...weekCounts);

  const riskCounts = RISK_ORDER.map(
    (risk) => vuln.findings.filter((f) => f.risk === risk).length
  );
  const riskMax = Math.max(1, ...riskCounts);

  const C = 2 * Math.PI * 52;

  const trend = risk.slice(-14);
  const trendMax = Math.max(1, ...trend.map((s) => s.open));
  const trendDelta =
    trend.length >= 2 ? trend[trend.length - 1].open - (trend[trend.length - 8]?.open ?? trend[0].open) : 0;

  const kpis = [
    { glyph: '▣', label: 'Total tasks', value: total, tone: 'blue' },
    { glyph: '✓', label: 'Completed', value: done, tone: 'green' },
    { glyph: '◐', label: 'In progress', value: inProgress, tone: 'yellow' },
    { glyph: '⚑', label: 'Overdue', value: overdue.length, tone: 'red' },
    { glyph: '⛨', label: 'Findings', value: vuln.findings.length, tone: 'blue' }
  ];

  return (
    <main className="dash">
      <div className="dash-head">
        <div>
          <span className="dash-kicker">Overview</span>
          <h1>Dashboard</h1>
        </div>
        <span className="dash-range">{weekLabel}</span>
      </div>

      <TodayPanel
        tasks={tasks}
        onStatusChange={onStatusChange}
        onOpenTask={onOpenTask}
        onQuickAdd={onQuickAdd}
      />

      {trend.length > 1 && (
        <section className="dash-panel" id="risk-trend">
          <div className="today-head">
            <div>
              <h2>Open-findings trend</h2>
              <span className="today-date">
                {trend.length} daily snapshot{trend.length === 1 ? '' : 's'}
              </span>
            </div>
            <span
              className={`trend-delta ${trendDelta > 0 ? 'bad' : trendDelta < 0 ? 'good' : ''}`}
              id="trend-delta"
            >
              {trendDelta > 0 ? `▲ +${trendDelta}` : trendDelta < 0 ? `▼ ${trendDelta}` : '± 0'} vs
              7 days ago
            </span>
          </div>
          <div className="trend-bars" id="trend-bars">
            {trend.map((s, i) => {
              const segments: Array<[RiskFactor, number]> = [
                ['Critical', s.critical],
                ['High', s.high],
                ['Medium', s.medium],
                ['Low', s.low],
                ['Info', s.info]
              ];
              const prev = i > 0 ? trend[i - 1].open : s.open;
              return (
                <div
                  className="trend-col"
                  key={s.date}
                  title={`${s.date}: ${s.open} open · C${s.critical} H${s.high} M${s.medium} L${s.low} I${s.info}${
                    s.open !== prev ? ` (${s.open > prev ? '+' : ''}${s.open - prev})` : ''
                  }`}
                >
                  <span className="trend-val">{s.open}</span>
                  <div className="trend-stack">
                    {segments.map(([sev, value]) =>
                      value > 0 ? (
                        <span
                          key={sev}
                          className="trend-seg"
                          style={{
                            background: RISK_COLORS[sev],
                            height: `${Math.round((value / trendMax) * 56)}px`
                          }}
                        />
                      ) : null
                    )}
                  </div>
                  <span className="trend-date">{s.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="dash-kpis">
        {kpis.map((k) => (
          <div className={`dash-kpi tone-${k.tone}`} key={k.label}>
            <span className="dash-kpi-ico">{k.glyph}</span>
            <div className="dash-kpi-body">
              <b>{k.value}</b>
              <span>{k.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <section className="dash-panel">
          <h2>Overall completion</h2>
          <div className="ring-wrap">
            <svg viewBox="0 0 120 120" className="ring-svg" role="img" aria-label={`${pct}% done`}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="#1d2c4d" strokeWidth="12" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#facc15"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * C} ${C}`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="ring-label">
              <b>{pct}%</b>
              <span>done</span>
            </div>
          </div>
          <div className="dash-legend">
            <span>
              <i style={{ background: 'var(--green)' }} /> {done} completed
            </span>
            <span>
              <i style={{ background: 'var(--red)' }} /> {blocked} blocked
            </span>
            <span>
              <i style={{ background: '#94a3b8' }} /> {canceled} canceled
            </span>
          </div>
        </section>

        <section className="dash-panel">
          <h2>Status breakdown</h2>
          <div className="bar-list">
            {STATUS_ORDER.map((s) => {
              const value = tasks.filter((t) => t.status === s).length;
              const width = total ? Math.round((value / total) * 100) : 0;
              return (
                <div className="bar-row" key={s}>
                  <span className="bar-name">{STATUS_LABELS[s]}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${width}%`, background: STATUS_COLORS[s] }}
                    />
                  </span>
                  <span className="bar-value">{value}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="dash-panel">
          <h2>This week&apos;s load</h2>
          <div className="col-chart">
            {weekCounts.map((value, i) => (
              <div className="col-item" key={DAY_SHORT[i]} title={`${value} task(s)`}>
                <span className="col-value">{value}</span>
                <span className="col-bar-track">
                  <span
                    className="col-bar"
                    style={{ height: `${Math.round((value / weekMax) * 100)}%` }}
                  />
                </span>
                <span className="col-label">{DAY_SHORT[i]}</span>
              </div>
            ))}
          </div>
          <div className="dash-sub">{weekTasks.length} task(s) scheduled this week</div>
        </section>

        <section className="dash-panel">
          <h2>Deadlines</h2>
          {deadlines.length === 0 ? (
            <div className="dash-empty">No open deadlines — every one-off task is clear.</div>
          ) : (
            <ul className="dash-list">
              {deadlines.map((t) => {
                const late = (t.dueDate ?? '') < todayIso;
                return (
                  <li key={t.id} className={late ? 'late' : ''}>
                    <span className="dash-list-title">{t.title}</span>
                    <span className={`dash-list-meta${late ? ' late' : ''}`}>
                      {late ? 'Overdue · ' : 'Due '}
                      {fmtDate(t.dueDate ?? '')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {overdue.length > 0 && (
            <div className="dash-warn">⚑ {overdue.length} task(s) past their deadline</div>
          )}
        </section>

        <section className="dash-panel">
          <h2>Findings by risk</h2>
          {vuln.findings.length === 0 ? (
            <div className="dash-empty">No findings recorded yet.</div>
          ) : (
            <div className="bar-list">
              {RISK_ORDER.map((risk, i) => (
                <div className="bar-row" key={risk}>
                  <span className="bar-name">{risk}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${Math.round((riskCounts[i] / riskMax) * 100)}%`,
                        background:
                          risk === 'Critical'
                            ? '#c00000'
                            : risk === 'High'
                              ? '#ff0000'
                              : risk === 'Medium'
                                ? '#ffb000'
                                : risk === 'Low'
                                  ? '#00b050'
                                  : '#808080'
                      }}
                    />
                  </span>
                  <span className="bar-value">{riskCounts[i]}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dash-panel">
          <h2>Recently recorded</h2>
          {recent.length === 0 ? (
            <div className="dash-empty">No tasks yet.</div>
          ) : (
            <ul className="dash-list">
              {recent.map((t) => (
                <li key={t.id}>
                  <span className="dash-list-title">{t.title}</span>
                  <span
                    className="dash-status-chip"
                    style={{ background: `${STATUS_COLORS[t.status]}22`, color: STATUS_COLORS[t.status] }}
                  >
                    {STATUS_LABELS[t.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
