import { useEffect, useState } from 'react';
import type { Task, TaskStatus } from '@shared/types';
import { STATUS_LABELS, STATUS_ORDER } from '@shared/types';

interface Props {
  task: Task;
  onSubmit: (status: TaskStatus) => void;
  onClose: () => void;
}

const STATUS_HINTS: Record<TaskStatus, string> = {
  todo: 'Not started yet',
  in_progress: 'Work is underway',
  blocked: 'Waiting on something else',
  done: 'Finished and delivered',
  canceled: 'No longer needed'
};

function effectNote(next: TaskStatus, current: TaskStatus): string {
  if (next === current) return 'No change — the task keeps its current status.';
  if (next === 'done') return 'Marks the task completed and records the completion time.';
  if (next === 'canceled') return 'Marks the task canceled and records the cancellation time.';
  if (current === 'done' || current === 'canceled') {
    return 'Reopens the task; the completion/cancellation stamp is cleared.';
  }
  return 'Updates progress tracking only — no completion stamp is recorded.';
}

export default function StatusModal({ task, onSubmit, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<TaskStatus>(task.status);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = task.status;
  const changed = picked !== current;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-status" role="dialog" aria-modal="true" aria-label="Change status">
        <div className="modal-head">
          <h2>Change status</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="stepper" aria-hidden="true">
            <span id="status-step1" className={`step${step >= 1 ? ' on' : ''}`}>
              1 · Select status
            </span>
            <span id="status-step2" className={`step${step >= 2 ? ' on' : ''}`}>
              2 · Review &amp; submit
            </span>
          </div>

          <div className="status-task">
            <span className="status-task-title">{task.title}</span>
            <span className="status-task-current">
              Currently: <b>{STATUS_LABELS[current]}</b>
            </span>
          </div>

          {step === 1 && (
            <div className="status-options" role="radiogroup" aria-label="Status">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  id={`status-opt-${s}`}
                  type="button"
                  role="radio"
                  aria-checked={picked === s}
                  className={`status-opt${picked === s ? ' sel' : ''}`}
                  onClick={() => setPicked(s)}
                >
                  <span className={`dot dot-${s}`} />
                  <span className="status-opt-label">
                    {STATUS_LABELS[s]}
                    {s === current && <em className="status-opt-current">current</em>}
                  </span>
                  <span className="status-opt-hint">{STATUS_HINTS[s]}</span>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="status-review">
              <div className="status-review-row">
                <span>Task</span>
                <b>{task.title}</b>
              </div>
              <div className="status-review-row">
                <span>Current status</span>
                <b>
                  <span className={`dot dot-${current}`} /> {STATUS_LABELS[current]}
                </b>
              </div>
              <div className="status-review-row highlight">
                <span>New status</span>
                <b>
                  <span className={`dot dot-${picked}`} /> {STATUS_LABELS[picked]}
                </b>
              </div>
              <p className="status-review-note">{effectNote(picked, current)}</p>
            </div>
          )}

          {!changed && step === 1 && (
            <div className="hint status-same">Choose a different status to continue.</div>
          )}
        </div>

        <div className="modal-foot">
          {step === 1 ? (
            <>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                id="status-next"
                disabled={!changed}
                onClick={() => setStep(2)}
              >
                Next
              </button>
            </>
          ) : (
            <>
              <button className="btn" id="status-back" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn btn-primary" id="status-submit" onClick={() => onSubmit(picked)}>
                Submit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
