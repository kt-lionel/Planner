import { avatarColor, initials } from '../lib/format';
import { APP_LOGO } from '../lib/logo';
import { DOMAIN_CLOUD, DOMAIN_NETWORK, DOMAIN_RADIO, DOMAIN_WEB } from '@shared/commands';

type View =
  | 'dashboard'
  | 'board'
  | 'log'
  | 'vuln'
  | 'assets'
  | 'engage'
  | 'toolbox'
  | 'commands'
  | 'reports'
  | 'references'
  | 'vault';

interface Props {
  view: View;
  onView: (view: View) => void;
  cmdDomain: string;
  onCmdDomain: (domain: string) => void;
  user: string;
  hasRecovery: boolean;
  onLock: () => void;
  onRecoveryKey: () => void;
}

type NavItem = { id: string; view: View; icon: string; label: string };

/** Sub-options rendered under the Commands nav entry. */
const CMD_SUBS: Array<{ id: string; label: string }> = [
  { id: 'nav-cmds-network', label: DOMAIN_NETWORK },
  { id: 'nav-cmds-web', label: DOMAIN_WEB },
  { id: 'nav-cmds-radio', label: DOMAIN_RADIO },
  { id: 'nav-cmds-cloud', label: DOMAIN_CLOUD }
];

/** Navigation grouped into sections so the rail stays scannable. */
const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { id: 'nav-dashboard', view: 'dashboard', icon: '▦', label: 'Dashboard' },
      { id: 'nav-board', view: 'board', icon: '▤', label: 'Board' },
      { id: 'nav-log', view: 'log', icon: '⏱', label: 'Activity log' }
    ]
  },
  {
    label: 'Pentest',
    items: [
      { id: 'nav-vuln', view: 'vuln', icon: '⛨', label: 'Vulnerabilities' },
      { id: 'nav-engage', view: 'engage', icon: '⚑', label: 'Engagement' },
      { id: 'nav-assets', view: 'assets', icon: '🖥', label: 'Assets' }
    ]
  },
  {
    label: 'Resources',
    items: [
      { id: 'nav-cmds', view: 'commands', icon: '⌘', label: 'Commands' },
      { id: 'nav-reports', view: 'reports', icon: '📤', label: 'Reports' },
      { id: 'nav-refs', view: 'references', icon: '🔗', label: 'References' },
      { id: 'nav-toolbox', view: 'toolbox', icon: '⚒', label: 'Toolbox' }
    ]
  },
  {
    label: 'Security',
    items: [{ id: 'nav-vault', view: 'vault', icon: '🔐', label: 'Passwords' }]
  }
];

export default function Sidebar({
  view,
  onView,
  cmdDomain,
  onCmdDomain,
  user,
  hasRecovery,
  onLock,
  onRecoveryKey
}: Props) {
  return (
    <aside className="sidebar">
      <div className="side-brand">
        <img className="brand-logo" src={APP_LOGO} alt="" />
        <div className="side-brand-text">
          <b>ANZIKA</b>
          <small>Security Operations</small>
        </div>
      </div>

      <nav className="side-nav" aria-label="Sections">
        {NAV_GROUPS.map((group) => (
          <div className="side-group" key={group.label}>
            <div className="side-group-label">{group.label}</div>
            {group.items.map((item) => (
              <div className="side-item" key={item.id}>
                <button
                  id={item.id}
                  className={`side-link${view === item.view ? ' active' : ''}`}
                  onClick={() => {
                    if (item.id === 'nav-cmds') onCmdDomain('All');
                    onView(item.view);
                  }}
                >
                  <span className="side-ico">{item.icon}</span>
                  {item.label}
                </button>
                {item.id === 'nav-cmds' && (
                  <div className="side-sub" role="group" aria-label="Command categories">
                    {CMD_SUBS.map((sub) => (
                      <button
                        key={sub.id}
                        id={sub.id}
                        className={`side-sub-link${
                          view === 'commands' && cmdDomain === sub.label ? ' active' : ''
                        }`}
                        onClick={() => {
                          onCmdDomain(sub.label);
                          onView('commands');
                        }}
                      >
                        <span className="side-sub-dot" aria-hidden="true" />
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <div className="side-user">
          <span className="avatar" style={{ background: avatarColor(user) }}>
            {initials(user)}
          </span>
          <span className="user-name">{user}</span>
          <span className="side-user-actions">
            <button
              className={`btn btn-ghost btn-icon${hasRecovery ? '' : ' hint'}`}
              id="recovery-key-btn"
              onClick={onRecoveryKey}
              title={
                hasRecovery ? 'Recovery key on file' : 'Create a recovery key (recommended)'
              }
            >
              🔑
            </button>
            <button
              className="btn btn-ghost btn-icon"
              id="lock-btn"
              onClick={onLock}
              title="Lock the app"
            >
              ⏻
            </button>
          </span>
        </div>
        <div className="side-note">Data never leaves this device</div>
      </div>
    </aside>
  );
}
