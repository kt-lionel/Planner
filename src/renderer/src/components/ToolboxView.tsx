import { useEffect, useState } from 'react';

/* ------------------------------------------------------------------ */
/* CIDR / subnet calculator (IPv4, offline)                            */
/* ------------------------------------------------------------------ */

interface CidrInfo {
  address: string;
  prefix: number;
  netmask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  first: string;
  last: string;
  total: number;
  usable: number;
  scope: string;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function intToIp(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function scopeOf(ip: number): string {
  const a = (ip >>> 24) & 255;
  const b = (ip >>> 16) & 255;
  if (a === 127) return 'Loopback';
  if (a === 10) return 'Private (RFC1918)';
  if (a === 172 && b >= 16 && b <= 31) return 'Private (RFC1918)';
  if (a === 192 && b === 168) return 'Private (RFC1918)';
  if (a === 169 && b === 254) return 'Link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'CGNAT (RFC6598)';
  if (a === 0) return 'This network';
  if (a >= 224 && a <= 239) return 'Multicast';
  if (a >= 240) return 'Reserved';
  if (a === 192 && b === 0) return 'IETF special';
  return 'Public';
}

function cidrInfo(raw: string): CidrInfo | { error: string } {
  const input = raw.trim();
  if (!input) return { error: 'Enter e.g. 192.168.1.0/24' };
  const [addrPart, prefixPart, ...rest] = input.split('/');
  if (rest.length) return { error: 'Too many "/" separators.' };
  const ip = ipToInt(addrPart ?? '');
  if (ip === null) return { error: 'Invalid IPv4 address.' };
  const prefix = prefixPart === undefined ? 32 : Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32)
    return { error: 'Prefix must be 0–32.' };
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = Math.pow(2, 32 - prefix);
  const pointToPoint = prefix >= 31;
  return {
    address: intToIp(ip),
    prefix,
    netmask: intToIp(mask),
    wildcard: intToIp(~mask >>> 0),
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    first: intToIp(pointToPoint ? network : network + 1),
    last: intToIp(pointToPoint ? broadcast : broadcast - 1),
    total,
    usable: pointToPoint ? total : Math.max(0, total - 2),
    scope: scopeOf(ip)
  };
}

/* ------------------------------------------------------------------ */

const ROT13 = (text: string): string =>
  text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });

function textToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToText(hex: string): string {
  const clean = hex.replace(/[\s,]/g, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2) throw new Error('Invalid hex string.');
  const bytes = new Uint8Array(clean.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? []);
  return new TextDecoder().decode(bytes);
}

const PORTS: Array<[number, string, string]> = [
  [20, 'TCP', 'FTP data'],
  [21, 'TCP', 'FTP control'],
  [22, 'TCP', 'SSH / SCP / SFTP'],
  [23, 'TCP', 'Telnet'],
  [25, 'TCP', 'SMTP'],
  [53, 'UDP/TCP', 'DNS'],
  [67, 'UDP', 'DHCP server'],
  [68, 'UDP', 'DHCP client'],
  [69, 'UDP', 'TFTP'],
  [80, 'TCP', 'HTTP'],
  [88, 'TCP', 'Kerberos'],
  [110, 'TCP', 'POP3'],
  [111, 'TCP', 'RPCBind'],
  [123, 'UDP', 'NTP'],
  [135, 'TCP', 'MS RPC / DCOM'],
  [137, 'UDP', 'NetBIOS name'],
  [138, 'UDP', 'NetBIOS datagram'],
  [139, 'TCP', 'NetBIOS session'],
  [143, 'TCP', 'IMAP'],
  [161, 'UDP', 'SNMP'],
  [162, 'UDP', 'SNMP trap'],
  [389, 'TCP', 'LDAP'],
  [443, 'TCP', 'HTTPS'],
  [445, 'TCP', 'SMB / SMBv3'],
  [465, 'TCP', 'SMTPS'],
  [514, 'UDP', 'Syslog'],
  [587, 'TCP', 'SMTP submission'],
  [636, 'TCP', 'LDAPS'],
  [873, 'TCP', 'rsync'],
  [993, 'TCP', 'IMAPS'],
  [995, 'TCP', 'POP3S'],
  [1433, 'TCP', 'Microsoft SQL Server'],
  [1521, 'TCP', 'Oracle DB'],
  [1723, 'TCP', 'PPTP'],
  [2049, 'TCP/UDP', 'NFS'],
  [2375, 'TCP', 'Docker API (plain)'],
  [2376, 'TCP', 'Docker API (TLS)'],
  [3306, 'TCP', 'MySQL / MariaDB'],
  [3389, 'TCP', 'RDP'],
  [4444, 'TCP', 'Common backdoor / Metasploit'],
  [5432, 'TCP', 'PostgreSQL'],
  [5900, 'TCP', 'VNC'],
  [5985, 'TCP', 'WinRM HTTP'],
  [5986, 'TCP', 'WinRM HTTPS'],
  [6379, 'TCP', 'Redis'],
  [8080, 'TCP', 'HTTP proxy / alt'],
  [8443, 'TCP', 'HTTPS alt'],
  [9090, 'TCP', 'Prometheus / alt console'],
  [9200, 'TCP', 'Elasticsearch'],
  [11211, 'TCP/UDP', 'Memcached'],
  [27017, 'TCP', 'MongoDB'],
  [31337, 'TCP', 'Classic backdoor ("Elite")'],
  [50000, 'TCP', 'SAP / generic high port']
];

type Hashes = Record<string, string>;

export default function ToolboxView() {
  const [cidr, setCidr] = useState('192.168.1.0/24');
  const [hashInput, setHashInput] = useState('');
  const [hashes, setHashes] = useState<Hashes | null>(null);
  const [encIn, setEncIn] = useState('');
  const [encOut, setEncOut] = useState('');
  const [encMode, setEncMode] = useState('base64');
  const [encError, setEncError] = useState<string | null>(null);
  const [portFilter, setPortFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!hashInput) {
        setHashes(null);
        return;
      }
      void window.planner
        .hashText(hashInput)
        .then((result) => {
          if (!cancelled) setHashes(result);
        })
        .catch(() => {
          if (!cancelled) setHashes(null);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hashInput]);

  const runEncode = (decode: boolean): void => {
    setEncError(null);
    try {
      if (encMode === 'base64') {
        if (decode) {
          const bytes = Uint8Array.from(atob(encIn), (c) => c.charCodeAt(0));
          setEncOut(new TextDecoder().decode(bytes));
        } else {
          const bytes = new TextEncoder().encode(encIn);
          let binary = '';
          for (const b of bytes) binary += String.fromCharCode(b);
          setEncOut(btoa(binary));
        }
      } else if (encMode === 'hex') {
        setEncOut(decode ? hexToText(encIn) : textToHex(encIn));
      } else if (encMode === 'url') {
        setEncOut(decode ? decodeURIComponent(encIn) : encodeURIComponent(encIn));
      } else {
        setEncOut(ROT13(encIn));
      }
    } catch (err) {
      setEncOut('');
      setEncError(err instanceof Error ? err.message : String(err));
    }
  };

  const info = cidrInfo(cidr);
  const ports = PORTS.filter(([port, proto, name]) => {
    const q = portFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      String(port).includes(q) ||
      proto.toLowerCase().includes(q) ||
      name.toLowerCase().includes(q)
    );
  });

  return (
    <main className="toolbox" id="toolbox">
      <div className="vuln-head">
        <div className="vuln-title-wrap">
          <span className="week-kicker">Security toolkit</span>
          <h1 className="view-title">Toolbox</h1>
          <p className="view-sub">
            Subnet math, encoding conversions, hash lookups and port references — instant,
            deterministic and fully offline. No requests ever leave this device.
          </p>
        </div>
      </div>

      <div className="tool-grid">
        {/* ---- CIDR calculator ---- */}
        <section className="dash-panel tool-card" id="tool-cidr">
          <h2>🔒 CIDR / subnet calculator</h2>
          <input
            id="cidr-input"
            className="input"
            placeholder="e.g. 10.0.0.0/24 or 172.16.5.9"
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
          />
          {'error' in info ? (
            <div className="form-error">{info.error}</div>
          ) : (
            <dl className="cidr-out" id="cidr-out">
              <div>
                <dt>Network</dt>
                <dd>
                  {info.network}/{info.prefix}
                </dd>
              </div>
              <div>
                <dt>Netmask</dt>
                <dd>{info.netmask}</dd>
              </div>
              <div>
                <dt>Wildcard</dt>
                <dd>{info.wildcard}</dd>
              </div>
              <div>
                <dt>Broadcast</dt>
                <dd>{info.broadcast}</dd>
              </div>
              <div>
                <dt>Host range</dt>
                <dd>
                  {info.first} – {info.last}
                </dd>
              </div>
              <div>
                <dt>Hosts</dt>
                <dd>
                  {info.usable} usable / {info.total.toLocaleString()} total
                </dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{info.scope}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* ---- Hash generator ---- */}
        <section className="dash-panel tool-card" id="tool-hash">
          <h2># Hash generator (MD5 / SHA)</h2>
          <textarea
            id="hash-input"
            className="textarea"
            rows={3}
            placeholder="Text to hash…"
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
          />
          <div className="hash-out" id="hash-out">
            {!hashInput ? (
              <span className="muted">Enter text — hashes update automatically.</span>
            ) : !hashes ? (
              <span className="muted">Computing…</span>
            ) : (
              Object.entries(hashes).map(([alg, value]) => (
                <div className="hash-row" key={alg}>
                  <span className="hash-alg">{alg.toUpperCase()}</span>
                  <code title={value}>{value}</code>
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Copy"
                    onClick={() => void window.planner.copyText(value)}
                  >
                    ⧉
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ---- Encode / decode ---- */}
        <section className="dash-panel tool-card" id="tool-encode">
          <h2>🔁 Encode / decode</h2>
          <div className="field-row">
            <select
              id="enc-mode"
              className="select"
              value={encMode}
              onChange={(e) => setEncMode(e.target.value)}
            >
              <option value="base64">Base64</option>
              <option value="hex">Hex</option>
              <option value="url">URL encoding</option>
              <option value="rot13">ROT13</option>
            </select>
            <div className="row-actions">
              <button className="btn btn-yellow" id="enc-encode" onClick={() => runEncode(false)}>
                Encode →
              </button>
              <button className="btn" id="enc-decode" onClick={() => runEncode(true)}>
                ← Decode
              </button>
            </div>
          </div>
          <textarea
            id="enc-in"
            className="textarea"
            rows={3}
            placeholder="Input…"
            value={encIn}
            onChange={(e) => setEncIn(e.target.value)}
          />
          <textarea
            id="enc-out"
            className="textarea"
            rows={3}
            placeholder="Result…"
            readOnly
            value={encOut}
          />
          {encError && <div className="form-error">{encError}</div>}
        </section>

        {/* ---- Common ports ---- */}
        <section className="dash-panel tool-card tool-ports" id="tool-ports">
          <h2>🌐 Common ports reference</h2>
          <input
            id="ports-filter"
            className="input"
            placeholder="Filter: port, protocol or service…"
            value={portFilter}
            onChange={(e) => setPortFilter(e.target.value)}
          />
          <div className="ports-list" id="ports-list">
            {ports.map(([port, proto, name]) => (
              <div className="port-row" key={port}>
                <b>{port}</b>
                <span className="port-proto">{proto}</span>
                <span>{name}</span>
              </div>
            ))}
            {ports.length === 0 && <span className="muted">No matching ports.</span>}
          </div>
        </section>
      </div>
    </main>
  );
}
