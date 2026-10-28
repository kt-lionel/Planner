import { Fragment, useEffect, useRef, useState } from 'react';
import { domainOf } from '@shared/commands';
import type { PentestCommand } from '@shared/commands';
import TablePager from './TablePager';

interface Props {
  commands: PentestCommand[];
  idPrefix: string;
  /** 'cards' = compact palette layout; 'table' = scrollable table with sticky search header. */
  layout?: 'cards' | 'table';
  query?: string;
  onQuery?: (query: string) => void;
  onTag?: (tag: string) => void;
  onDelete?: (id: string) => void;
}

type DomainGroup = [string, Array<[string, PentestCommand[]]>];

function bucket(commands: PentestCommand[]): DomainGroup[] {
  const domainOrder: string[] = [];
  const byDomain = new Map<string, PentestCommand[]>();
  for (const cmd of commands) {
    const domain = domainOf(cmd);
    let bucket = byDomain.get(domain);
    if (!bucket) {
      bucket = [];
      byDomain.set(domain, bucket);
      domainOrder.push(domain);
    }
    bucket.push(cmd);
  }
  const groups: DomainGroup[] = [];
  for (const domain of domainOrder) {
    const tools: Array<[string, PentestCommand[]]> = [];
    for (const cmd of byDomain.get(domain) ?? []) {
      const last = tools[tools.length - 1];
      if (last && last[0] === cmd.tool) last[1].push(cmd);
      else tools.push([cmd.tool, [cmd]]);
    }
    groups.push([domain, tools]);
  }
  return groups;
}

const SEARCH_PLACEHOLDER = 'Search — try "port scanning", "smb", "ad", "kerberos", "web shell"…';

/** Grouped, copy-ready commands — card grid for the palette, sticky-header table for the view. */
export default function CommandList({
  commands,
  idPrefix,
  layout = 'cards',
  query,
  onQuery,
  onTag,
  onDelete
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // a new result set (query, domain or custom-command change) starts back at page 1
  useEffect(() => {
    setPage(0);
  }, [commands]);

  const copy = async (cmd: PentestCommand): Promise<void> => {
    await window.planner.copyText(cmd.command);
    setCopiedId(cmd.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiedId(null), 1600);
  };

  const domainGroups = bucket(commands);

  if (layout === 'cards' && !commands.length) {
    return (
      <div className="cmd-empty">
        <div className="empty-glyph">⌕</div>
        <strong>No commands match</strong>
        <p>Try a broader keyword — “port scan”, “smb”, “ad”, “kerberos”, “web”…</p>
      </div>
    );
  }

  if (layout === 'table') {
    // flat rows in display order (domain group → tool → command)
    const flat = domainGroups.flatMap(([domain, tools]) =>
      tools.flatMap(([tool, list]) => list.map((cmd) => ({ cmd, domain, tool })))
    );
    // running index across the whole table so #<prefix>-copy-0 is the first row
    const orderIndex = new Map<string, number>();
    flat.forEach(({ cmd }, idx) => orderIndex.set(cmd.id, idx));

    // full-group totals for the group header rows (shown even mid-pagination)
    const domainTotal = new Map<string, number>();
    const toolTotal = new Map<string, number>();
    for (const { domain, tool } of flat) {
      domainTotal.set(domain, (domainTotal.get(domain) ?? 0) + 1);
      const toolKey = `${domain}::${tool}`;
      toolTotal.set(toolKey, (toolTotal.get(toolKey) ?? 0) + 1);
    }

    const pageCount = Math.max(1, Math.ceil(flat.length / size));
    const safePage = Math.min(page, pageCount - 1);
    const pageRows = flat.slice(safePage * size, safePage * size + size);

    return (
      <>
        <div className="cmd-table-wrap">
        <table className="cmd-table">
          <thead>
            <tr className="cmd-thead-search-row">
              <th colSpan={5} className="cmd-thead-search">
                <input
                  id="cmd-search"
                  className="input"
                  placeholder={SEARCH_PLACEHOLDER}
                  value={query ?? ''}
                  onChange={(e) => onQuery?.(e.target.value)}
                />
              </th>
            </tr>
            <tr className="cmd-thead-cols">
              <th className="c-title">Title</th>
              <th className="c-tool">Tool</th>
              <th className="c-cmd">Command</th>
              <th className="c-tags">Tags</th>
              <th className="c-act">Actions</th>
            </tr>
          </thead>
          <tbody className="cmd-groups">
            {flat.length === 0 && (
              <tr className="cmd-empty-row">
                <td colSpan={5}>
                  <div className="cmd-empty">
                    <div className="empty-glyph">⌕</div>
                    <strong>No commands match</strong>
                    <p>Try a broader keyword — “port scan”, “smb”, “ad”, “kerberos”, “web”…</p>
                  </div>
                </td>
              </tr>
            )}
            {pageRows.map(({ cmd, domain, tool }, i) => {
              const prevRow = pageRows[i - 1];
              const newDomain = !prevRow || prevRow.domain !== domain;
              const newTool = newDomain || prevRow.tool !== tool;
              return (
                <Fragment key={cmd.id}>
                  {newDomain && (
                    <tr className="cmd-gr cmd-gr-domain">
                      <td colSpan={5}>
                        <span className="cmd-domain-dot" aria-hidden="true" />
                        {domain}
                        <span className="cmd-count">{domainTotal.get(domain) ?? 0}</span>
                      </td>
                    </tr>
                  )}
                  {newTool && tool.toLowerCase() !== domain.toLowerCase() && (
                    <tr className="cmd-gr cmd-gr-tool">
                      <td colSpan={5}>
                        {tool}
                        <span className="cmd-count">
                          {toolTotal.get(`${domain}::${tool}`) ?? 0}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="cmd-row">
                    <td className="c-title">
                      <b className="cmd-title">
                        {cmd.title}
                        {cmd.id.startsWith('custom-') && (
                          <span className="cmd-badge-yours">YOURS</span>
                        )}
                      </b>
                      <p className="cmd-desc">{cmd.description}</p>
                    </td>
                    <td className="c-tool">{cmd.tool}</td>
                    <td className="c-cmd">
                      <code
                        className="cmd-code"
                        onClick={() => void copy(cmd)}
                        title="Click to copy"
                      >
                        {cmd.command}
                      </code>
                    </td>
                    <td className="c-tags">
                      {cmd.tags.slice(0, 6).map((tag) => (
                        <button
                          key={tag}
                          className="cmd-tag"
                          onClick={() => onTag?.(tag)}
                          title={`Search “${tag}”`}
                        >
                          {tag}
                        </button>
                      ))}
                    </td>
                    <td className="c-act">
                      <div className="cmd-card-btns">
                        <button
                          className={`btn btn-yellow btn-copy${copiedId === cmd.id ? ' copied' : ''}`}
                          id={`${idPrefix}-copy-${orderIndex.get(cmd.id) ?? 0}`}
                          onClick={() => void copy(cmd)}
                        >
                          {copiedId === cmd.id ? 'Copied ✓' : '⧉ Copy'}
                        </button>
                        {cmd.id.startsWith('custom-') && onDelete && (
                          <button
                            className="btn btn-ghost btn-icon"
                            id={`${idPrefix}-del-${cmd.id}`}
                            title="Remove this command"
                            onClick={() => onDelete(cmd.id)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {flat.length > 0 && (
        <TablePager
          idPrefix={idPrefix}
          total={flat.length}
          page={safePage}
          size={size}
          onPage={setPage}
          onSize={setSize}
        />
      )}
      </>
    );
  }

  return (
    <div className="cmd-groups">
      {domainGroups.map(([domain, toolGroups]) => (
        <section className="cmd-domain" key={domain}>
          <h3 className="cmd-domain-head">
            <span className="cmd-domain-dot" aria-hidden="true" />
            {domain}
            <span className="cmd-count">
              {toolGroups.reduce((n, [, list]) => n + list.length, 0)}
            </span>
          </h3>
          {toolGroups.map(([tool, list]) => (
            <div className="cmd-tool-block" key={tool}>
              {tool.toLowerCase() !== domain.toLowerCase() && (
                <h4 className="cmd-tool">
                  {tool}
                  <span className="cmd-count">{list.length}</span>
                </h4>
              )}
              <div className="cmd-list">
                {list.map((cmd, index) => (
                  <article className="cmd-card" key={cmd.id}>
                    <div className="cmd-card-head">
                      <b className="cmd-title">
                        {cmd.title}
                        {cmd.id.startsWith('custom-') && (
                          <span className="cmd-badge-yours">YOURS</span>
                        )}
                      </b>
                      <div className="cmd-card-btns">
                        <button
                          className={`btn btn-yellow btn-copy${copiedId === cmd.id ? ' copied' : ''}`}
                          id={`${idPrefix}-copy-${index}`}
                          onClick={() => void copy(cmd)}
                        >
                          {copiedId === cmd.id ? 'Copied ✓' : '⧉ Copy'}
                        </button>
                        {cmd.id.startsWith('custom-') && onDelete && (
                          <button
                            className="btn btn-ghost btn-icon"
                            id={`${idPrefix}-del-${cmd.id}`}
                            title="Remove this command"
                            onClick={() => onDelete(cmd.id)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="cmd-desc">{cmd.description}</p>
                    <code className="cmd-code" onClick={() => void copy(cmd)} title="Click to copy">
                      {cmd.command}
                    </code>
                    <div className="cmd-tags">
                      {cmd.tags.slice(0, 6).map((tag) => (
                        <button
                          key={tag}
                          className="cmd-tag"
                          onClick={() => onTag?.(tag)}
                          title={`Search “${tag}”`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
