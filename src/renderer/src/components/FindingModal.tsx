import { useEffect, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent } from 'react';
import type { Finding, FindingStatus, RiskFactor } from '@shared/types';
import { FINDING_STATUSES, RISK_ORDER, findingHosts } from '@shared/types';
import {
  CVSS_METRICS,
  DEFAULT_VECTOR,
  buildCvssVector,
  cvssBaseScore,
  cvssSeverity,
  parseCvssVector
} from '@shared/cvss';
import { CONTROL_GROUPS } from '@shared/compliance';
import { newId } from '../lib/format';

interface Props {
  initial: Finding | null;
  onSave: (finding: Finding) => void;
  onDelete: (finding: Finding) => void;
  onClose: () => void;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function FindingModal({ initial, onSave, onDelete, onClose }: Props) {
  const [risk, setRisk] = useState<RiskFactor>(initial?.risk ?? 'High');
  const [hosts, setHosts] = useState<string[]>(() => (initial ? findingHosts(initial) : []));
  const [hostDraft, setHostDraft] = useState('');
  const [status, setStatus] = useState<FindingStatus>(initial?.status ?? 'Open');
  const [team, setTeam] = useState(initial?.team ?? '');
  const [timeline, setTimeline] = useState(initial?.timeline ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [riskDetail, setRiskDetail] = useState(initial?.riskDetail ?? '');
  const [solution, setSolution] = useState(initial?.solution ?? '');
  const [evidence, setEvidence] = useState<string | undefined>(initial?.evidence);
  const [vector, setVector] = useState(initial?.cvss?.vector ?? '');
  const [cwe, setCwe] = useState(initial?.cwe ?? '');
  const [controls, setControls] = useState<string[]>(initial?.controls ?? []);
  const [controlDraft, setControlDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [importedScore, setImportedScore] = useState<number | null>(
    initial?.cvss && !initial.cvss.vector ? (initial.cvss.score ?? null) : null
  );
  const parsed = parseCvssVector(vector);
  const computed = cvssBaseScore(vector);
  const score = computed ?? importedScore;

  /** Rebuilds the vector and derives the risk factor from the score. */
  const applyVector = (next: string): void => {
    setVector(next);
    const s = cvssBaseScore(next);
    if (s != null) setRisk(cvssSeverity(s));
  };

  type CvssKey = (typeof CVSS_METRICS)[number]['key'];
  const setMetric = (key: CvssKey, value: string): void => {
    applyVector(buildCvssVector({ ...(parsed ?? DEFAULT_VECTOR), [key]: value }));
  };

  const addControl = (): void => {
    if (!controlDraft || controls.includes(controlDraft)) return;
    setControls((prev) => [...prev, controlDraft]);
    setControlDraft('');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const splitHosts = (raw: string): string[] =>
    raw
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);

  /** Merge the draft input into the chip list (Enter, blur or save). */
  const commitHosts = (raw: string): void => {
    const parts = splitHosts(raw);
    if (!parts.length) return;
    setHosts((prev) => [...prev, ...parts.filter((host) => !prev.includes(host))]);
    setHostDraft('');
  };

  const removeHost = (host: string): void => {
    setHosts((prev) => prev.filter((h) => h !== host));
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('clipboard read failed'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(file);
    });

  /** Saves an image file as the evidence screenshot (paste, drop or browse). */
  const attachImage = (file: File): void => {
    setPasting(true);
    setError(null);
    readFileAsBase64(file)
      .then((base64) => window.planner.saveEvidence(base64, file.type || 'image/png'))
      .then((path) => {
        if (path) setEvidence(path);
        else setError('Could not save the pasted screenshot.');
      })
      .catch(() => setError('Could not read the pasted screenshot.'))
      .finally(() => setPasting(false));
  };

  /** Ctrl+V anywhere in the dialog attaches a screenshot as evidence. */
  const handlePaste = (e: ReactClipboardEvent<HTMLDivElement>): void => {
    const image = Array.from(e.clipboardData.items).find(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    );
    const file = image?.getAsFile();
    if (!file) return;
    e.preventDefault();
    attachImage(file);
  };

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) attachImage(file);
    else setError('Drop an image file (PNG, JPG, WEBP…).');
  };

  const pickEvidence = async (): Promise<void> => {
    setPicking(true);
    try {
      const path = await window.planner.pickEvidenceImage();
      if (path) setEvidence(path);
    } finally {
      setPicking(false);
    }
  };

  const submit = (): void => {
    const committed = [
      ...hosts,
      ...splitHosts(hostDraft).filter((host) => !hosts.includes(host))
    ];
    if (!committed.length) {
      setError('Add at least one host / IP.');
      return;
    }
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    const nowIso = new Date().toISOString();
    const nowClosed = status === 'Resolved' || status === 'Closed' || status === 'Accepted';
    onSave({
      id: initial?.id ?? newId(),
      risk,
      hosts: committed,
      description: description.trim(),
      riskDetail: riskDetail.trim(),
      solution: solution.trim(),
      timeline: timeline || undefined,
      status,
      team: team.trim(),
      evidence,
      cvss:
        computed != null && vector.trim()
          ? { vector: vector.trim(), score: computed }
          : score != null
            ? { score }
            : undefined,
      cwe: cwe.trim() || undefined,
      controls: controls.length ? controls : undefined,
      openedAt: initial?.openedAt ?? nowIso,
      resolvedAt: nowClosed ? (initial?.resolvedAt ?? nowIso) : undefined,
      createdAt: initial?.createdAt ?? nowIso,
      updatedAt: nowIso
    });
  };

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onPaste={handlePaste}
    >
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label={initial ? 'Edit finding' : 'New finding'}
      >
        <div className="modal-head">
          <h2>{initial ? 'Edit finding' : 'New finding'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field-row">
            <div className="field">
              <label htmlFor="finding-risk">Risk factor</label>
              <select
                id="finding-risk"
                className="select"
                value={risk}
                onChange={(e) => setRisk(e.target.value as RiskFactor)}
              >
                {RISK_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="finding-status">Status</label>
              <select
                id="finding-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as FindingStatus)}
              >
                {FINDING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row cvss-row">
            <div className="field">
              <label>CVSS 3.1 base score (optional)</label>
              <div className="cvss-calc" id="cvss-calc">
                {CVSS_METRICS.map((m) => (
                  <div className="cvss-metric" key={m.key}>
                    <span className="cvss-metric-label">{m.label}</span>
                    <select
                      id={`cvss-${m.key}`}
                      className="select"
                      aria-label={m.label}
                      value={parsed ? parsed[m.key] : ''}
                      onChange={(e) => setMetric(m.key, e.target.value)}
                    >
                      {!parsed && <option value="">—</option>}
                      {m.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="cvss-out">
                  <span className="cvss-score" id="cvss-score">
                    {score != null ? score.toFixed(1) : '—'}
                  </span>
                  {score != null && (
                    <span className="cvss-sev" data-sev={cvssSeverity(score)} id="cvss-sev">
                      {cvssSeverity(score)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    id="cvss-clear"
                    onClick={() => {
                      setVector('');
                      setImportedScore(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <input
                id="cvss-vector"
                className="input"
                placeholder="…or paste a full vector: CVSS:3.1/AV:N/…"
                value={vector}
                onChange={(e) => applyVector(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="finding-cwe">CWE / compliance controls (optional)</label>
              <div className="field-row">
                <input
                  id="finding-cwe"
                  className="input"
                  placeholder="e.g. CWE-79"
                  value={cwe}
                  onChange={(e) => setCwe(e.target.value)}
                />
                <select
                  id="finding-controls"
                  className="select"
                  value={controlDraft}
                  onChange={(e) => setControlDraft(e.target.value)}
                >
                  <option value="">Add control…</option>
                  {CONTROL_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.controls.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id} — {c.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  id="control-add"
                  disabled={!controlDraft}
                  onClick={addControl}
                >
                  + Add
                </button>
              </div>
              {controls.length > 0 && (
                <div className="chips" id="finding-controls-chips">
                  {controls.map((c) => (
                    <span className="chip" key={c}>
                      {c}
                      <button
                        type="button"
                        onClick={() => setControls((prev) => prev.filter((x) => x !== c))}
                        aria-label={`Remove ${c}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="finding-host">Host / affected system (one or more)</label>
              <div
                className="chips-input"
                onClick={() => document.getElementById('finding-host')?.focus()}
              >
                {hosts.map((host) => (
                  <span className="chip" key={host}>
                    {host}
                    <button type="button" onClick={() => removeHost(host)} aria-label={`Remove ${host}`}>
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  id="finding-host"
                  className="chip-field"
                  autoFocus
                  placeholder={hosts.length ? 'Add another…' : 'e.g. 172.28.8.34'}
                  value={hostDraft}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/[\s,;]/.test(value.trim())) commitHosts(value);
                    else setHostDraft(value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitHosts(hostDraft);
                    } else if (e.key === 'Backspace' && !hostDraft && hosts.length) {
                      removeHost(hosts[hosts.length - 1]);
                    }
                  }}
                  onBlur={() => commitHosts(hostDraft)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="finding-team">Responsible team</label>
              <input
                id="finding-team"
                className="input"
                placeholder="e.g. IP Team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="finding-timeline">Timeline (optional)</label>
              <input
                id="finding-timeline"
                className="input"
                type="date"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Evidence screenshot (optional)</label>
              <div
                className={`evidence-zone${evidence ? ' has-image' : ''}${
                  dragOver ? ' drag-over' : ''
                }`}
                role="button"
                tabIndex={0}
                aria-label="Evidence screenshot"
                onClick={() => void pickEvidence()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void pickEvidence();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {evidence ? (
                  <div className="evidence-zone-filled">
                    <img className="evidence-preview" src={`file://${evidence}`} alt="Evidence" />
                    <div className="evidence-zone-meta">
                      <span className="evidence-meta">{basename(evidence)}</span>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={picking || pasting}
                          onClick={(e) => {
                            e.stopPropagation();
                            void pickEvidence();
                          }}
                        >
                          {pasting
                            ? 'Pasting…'
                            : picking
                              ? 'Opening…'
                              : 'Replace…'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEvidence(undefined);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="evidence-zone-empty">
                    <span className="evidence-zone-ico" aria-hidden="true">
                      📋
                    </span>
                    <span>
                      <b>Paste a screenshot here</b> — Ctrl+V anywhere in this dialog
                    </span>
                    <span className="paste-hint">or drop an image here / click to browse files</span>
                  </div>
                )}
              </div>
              {pasting && <span className="paste-hint">Attaching…</span>}
            </div>
          </div>

          <div className="field">
            <label htmlFor="finding-description">Description</label>
            <textarea
              id="finding-description"
              className="textarea"
              rows={3}
              placeholder="What was found (packages, versions, CVE ids…)"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="finding-risk-detail">Risk</label>
            <textarea
              id="finding-risk-detail"
              className="textarea"
              rows={2}
              placeholder="Impact if this finding is exploited"
              value={riskDetail}
              onChange={(e) => setRiskDetail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="finding-solution">Solution</label>
            <textarea
              id="finding-solution"
              className="textarea"
              rows={2}
              placeholder="Remediation steps and reference links"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
            />
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-foot">
          {initial && (
            <button
              className="btn btn-danger"
              onClick={() => onDelete(initial)}
              style={{ marginRight: 'auto' }}
            >
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            {initial ? 'Save changes' : 'Add finding'}
          </button>
        </div>
      </div>
    </div>
  );
}
