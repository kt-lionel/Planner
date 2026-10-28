import { useEffect, useMemo, useRef, useState } from 'react';
import { searchCommands } from '@shared/commands';
import type { PentestCommand } from '@shared/commands';
import CommandList from './CommandList';

interface Props {
  customCommands: PentestCommand[];
  onClose: () => void;
}

/** Ctrl+K overlay — the command vault reachable from every screen. */
export default function CommandPalette({ customCommands, onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => searchCommands(query, customCommands), [query, customCommands]);

  return (
    <div
      className="overlay"
      id="cmd-palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide cmd-palette" role="dialog" aria-label="Command vault">
        <div className="modal-head">
          <h2>⌘ Command vault</h2>
          <button className="btn-icon" id="cmd-palette-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <input
            ref={inputRef}
            id="cmd-palette-search"
            className="input"
            placeholder='Search commands — "port scan", "smb", "ad", "kerberos"…'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <CommandList commands={results} idPrefix="cmdp" onTag={setQuery} />
        </div>
      </div>
    </div>
  );
}
