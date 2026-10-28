import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { REFERENCE_CATEGORIES } from '@shared/references';
import type { ReferenceLink } from '@shared/types';
import TablePager from './TablePager';

interface Props {
  references: ReferenceLink[];
  onAdd: (ref: Omit<ReferenceLink, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
  onOpen: (url: string) => void;
}

const EMPTY_FORM = {
  title: '',
  url: '',
  category: REFERENCE_CATEGORIES[0],
  notes: ''
};

function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Reference library — record go-to hacker links and open them in the browser. */
export default function ReferencesView({ references, onAdd, onDelete, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  const categoryChips = useMemo(() => {
    const seen: string[] = [];
    for (const r of references) {
      if (!seen.includes(r.category)) seen.push(r.category);
    }
    return ['All', ...seen];
  }, [references]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...references]
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .filter((r) => {
        if (category !== 'All' && r.category !== category) return false;
        if (!q) return true;
        return `${r.title} ${r.url} ${r.notes ?? ''} ${r.category}`.toLowerCase().includes(q);
      });
  }, [references, query, category]);

  // any change to the result set (add, delete, search, filter) jumps back to page 1
  useEffect(() => {
    setPage(0);
  }, [results]);

  const pageCount = Math.max(1, Math.ceil(results.length / size));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = results.slice(safePage * size, safePage * size + size);

  const submit = (): void => {
    const title = form.title.trim();
    const url = normalizeUrl(form.url);
    if (!title || !url) return;
    onAdd({
      title,
      url,
      category: form.category,
      notes: form.notes.trim()
    });
    setForm(EMPTY_FORM);
    setShowAdd(false);
  };

  const copy = (ref: ReferenceLink): void => {
    void window.planner.copyText(ref.url).then(() => {
      setCopiedId(ref.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === ref.id ? null : cur)), 1500);
    });
  };

  const field = (key: keyof typeof EMPTY_FORM) => ({
    id: `ref-new-${key}`,
    className: 'input',
    value: form[key],
    onChange: (
      e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ): void => setForm((f) => ({ ...f, [key]: e.target.value }))
  });

  return (
    <main className="cmd-view refs-view" id="references-view">
      <div className="vuln-head">
        <div className="vuln-title-wrap">
          <span className="week-kicker">Reference library</span>
          <h1 className="view-title">References</h1>
          <p className="view-sub">
            Record your go-to hacker references — exploit databases, cheat sheets, advisories and
            tool docs — saved with your plan. Search or filter by category, click a title to open
            it in your browser. Add your own with “+ Add reference”; links are normalized
            (https:// added automatically).
          </p>
        </div>
        <div className="vuln-actions">
          <span className="risk-chip risk-total">
            Showing <b>{results.length}</b> / {references.length}
          </span>
          <button className="btn btn-yellow" id="ref-add-toggle" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? '✕ Close' : '+ Add reference'}
          </button>
        </div>
      </div>

      {showAdd && (
        <section className="cmd-add-panel" id="ref-add-form">
          <div className="cmd-add-grid">
            <div className="field">
              <label htmlFor="ref-new-title">Title *</label>
              <input {...field('title')} placeholder="e.g. Cisco IOS XE advisory tracker" />
            </div>
            <div className="field">
              <label htmlFor="ref-new-url">URL *</label>
              <input {...field('url')} placeholder="example.com/path (https:// added for you)" />
            </div>
            <div className="field">
              <label htmlFor="ref-new-category">Category</label>
              <select {...field('category')}>
                {REFERENCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ref-new-notes">Notes</label>
            <input {...field('notes')} placeholder="Why this link matters / when you use it" />
          </div>
          <div className="cmd-add-actions">
            <button className="btn btn-ghost" id="ref-new-cancel" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button
              className="btn btn-yellow"
              id="ref-new-save"
              onClick={submit}
              disabled={!form.title.trim() || !form.url.trim()}
            >
              Record link
            </button>
          </div>
        </section>
      )}

      <div className="cmd-search-row">
        <input
          id="ref-search"
          className="input"
          placeholder='Search — try "owasp", "nvd", "payloads", "mitre"…'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="cmd-chips">
          {categoryChips.map((c) => (
            <button
              key={c}
              className={`cmd-chip${category === c ? ' active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="cmd-empty" id="ref-empty">
          <div className="empty-glyph">⌗</div>
          <strong>No references match</strong>
          <p>Record a new link with “+ Add reference”, or try a broader keyword.</p>
        </div>
      ) : (
        <>
          <div className="vuln-table-wrap ref-table-wrap">
            <table className="vuln-table ref-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>URL</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr className="ref-row" key={r.id}>
                    <td>
                      <button
                        className="ref-title"
                        id={`refv-open-${r.id}`}
                        onClick={() => onOpen(r.url)}
                        title="Open in browser"
                      >
                        {r.title}
                      </button>
                    </td>
                    <td>
                      <span className="ref-cat">{r.category}</span>
                    </td>
                    <td className="ref-url">{r.url}</td>
                    <td>
                      <span className="clamp-2 ref-notes" title={r.notes ?? ''}>
                        {r.notes ?? '—'}
                      </span>
                    </td>
                    <td className="row-actions-cell">
                      <button className="btn btn-ghost" onClick={() => onOpen(r.url)}>
                        Open ↗
                      </button>
                      <button className="btn btn-ghost" onClick={() => copy(r)}>
                        {copiedId === r.id ? 'Copied' : '⧉ Copy'}
                      </button>
                      <button
                        className="btn btn-ghost btn-danger-ghost"
                        id={`refv-del-${r.id}`}
                        onClick={() => onDelete(r.id)}
                        title="Remove this reference"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePager
            idPrefix="refv"
            total={results.length}
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
