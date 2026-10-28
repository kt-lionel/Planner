import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { COMMANDS, COMMAND_DOMAINS, COMMAND_TOOLS, domainOf, searchCommands } from '@shared/commands';
import type { PentestCommand } from '@shared/commands';
import CommandList from './CommandList';

interface Props {
  customCommands: PentestCommand[];
  domain: string;
  onAdd: (cmd: Omit<PentestCommand, 'id'>) => void;
  onDelete: (id: string) => void;
}

const EMPTY_FORM = {
  tool: 'Custom',
  domain: 'Custom',
  title: '',
  command: '',
  description: '',
  tags: ''
};

/** Full-page command vault — searchable, copy-ready, with user commands. */
export default function CommandsView({ customCommands, domain, onAdd, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const results = useMemo(() => {
    const byQuery = searchCommands(query, customCommands);
    return domain === 'All' ? byQuery : byQuery.filter((c) => domainOf(c) === domain);
  }, [query, domain, customCommands]);

  const submit = (): void => {
    const title = form.title.trim();
    const command = form.command.trim();
    if (!title || !command) return;
    onAdd({
      tool: form.tool.trim() || 'Custom',
      domain: form.domain,
      title,
      command,
      description: form.description.trim() || 'Custom command added to the vault.',
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    });
    setForm(EMPTY_FORM);
    setShowAdd(false);
  };

  const field = (key: keyof typeof EMPTY_FORM, className = 'input') => ({
    id: `cmd-new-${key}`,
    className,
    value: form[key],
    onChange: (
      e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ): void => setForm((f) => ({ ...f, [key]: e.target.value }))
  });

  return (
    <main className="cmd-view cmds-page" id="commands-view">
      <div className="vuln-head">
        <div className="vuln-title-wrap">
          <span className="week-kicker">Command vault</span>
          <h1 className="view-title">Commands</h1>
          <p className="view-sub">
            Copy-ready commands in one table, separated by attack target — filter with the
            categories on the sidebar (Network, Web, Radio / Telecom, Cloud), or scroll the table
            grouped by category and tool. The search bar lives in the sticky table header, so it
            stays visible while the list scrolls. Click a tag to filter, then copy. Add your own
            with “+ Add command”; they are saved with your plan. Opens anywhere with Ctrl+K.
          </p>
        </div>
        <div className="vuln-actions">
          <span className="risk-chip risk-total">
            Showing <b>{results.length}</b> / {COMMANDS.length + customCommands.length}
          </span>
          <button className="btn btn-yellow" id="cmd-add-toggle" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? '✕ Close' : '+ Add command'}
          </button>
        </div>
      </div>

      {showAdd && (
        <section className="cmd-add-panel" id="cmd-add-form">
          <div className="cmd-add-grid">
            <div className="field">
              <label htmlFor="cmd-new-title">Title *</label>
              <input {...field('title')} placeholder="e.g. Fast TCP sweep" />
            </div>
            <div className="field">
              <label htmlFor="cmd-new-domain">Category (attack target)</label>
              <select {...field('domain')}>
                {COMMAND_DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="Custom">Custom</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="cmd-new-tool">Sub-category / tool</label>
              <select {...field('tool')}>
                <option value="Custom">Custom</option>
                {COMMAND_TOOLS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cmd-new-tags">Tags (comma-separated)</label>
              <input {...field('tags')} placeholder="recon, internal, quick" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="cmd-new-command">Command *</label>
            <textarea
              {...field('command', 'textarea')}
              rows={2}
              placeholder="nmap -sS -T4 --open 10.0.0.0/24"
            />
          </div>
          <div className="field">
            <label htmlFor="cmd-new-description">Description</label>
            <input {...field('description')} placeholder="What it does and when to use it" />
          </div>
          <div className="cmd-add-actions">
            <button className="btn btn-ghost" id="cmd-new-cancel" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button
              className="btn btn-yellow"
              id="cmd-new-save"
              onClick={submit}
              disabled={!form.title.trim() || !form.command.trim()}
            >
              Save to vault
            </button>
          </div>
        </section>
      )}

      <CommandList
        commands={results}
        idPrefix="cmdv"
        layout="table"
        query={query}
        onQuery={setQuery}
        onTag={(tag) => setQuery(tag)}
        onDelete={onDelete}
      />
    </main>
  );
}
