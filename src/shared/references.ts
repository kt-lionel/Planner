import type { ReferenceLink } from './types';

/** Categories offered when recording a new reference link. */
export const REFERENCE_CATEGORIES = [
  'Exploit & vuln DB',
  'Web security',
  'Cheat sheets',
  'Network & tools',
  'Frameworks'
];

/** Curated starter library — seeded on first load, then owned by the user. */
export const DEFAULT_REFERENCES: ReferenceLink[] = [
  {
    id: 'ref-db-exploit',
    title: 'Exploit Database',
    url: 'https://www.exploit-db.com',
    category: 'Exploit & vuln DB',
    notes: 'Searchable archive of exploits and shellcode.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-db-nvd',
    title: 'NVD — CVE Analysis',
    url: 'https://nvd.nist.gov',
    category: 'Exploit & vuln DB',
    notes: 'NIST CVE details, CVSS scores and CPE matches.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-db-kev',
    title: 'CISA Known Exploited Vulnerabilities',
    url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    category: 'Exploit & vuln DB',
    notes: 'Catalog of CVEs confirmed exploited in the wild.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-web-owasp10',
    title: 'OWASP Top 10',
    url: 'https://owasp.org/www-project-top-ten/',
    category: 'Web security',
    notes: 'The baseline web application risk list.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-web-portswigger',
    title: 'PortSwigger Web Security Academy',
    url: 'https://portswigger.net/web-security',
    category: 'Web security',
    notes: 'Free hands-on labs for every web vulnerability class.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-cheat-owasp',
    title: 'OWASP Cheat Sheet Series',
    url: 'https://cheatsheetseries.owasp.org',
    category: 'Cheat sheets',
    notes: 'Per-topic secure-development cheat sheets.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-cheat-payloads',
    title: 'PayloadAllTheThings',
    url: 'https://github.com/swisskyrepo/PayloadsAllTheThings',
    category: 'Cheat sheets',
    notes: 'Payload and technique collections per vulnerability class.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-cheat-hacktricks',
    title: 'HackTricks',
    url: 'https://book.hacktricks.xyz',
    category: 'Cheat sheets',
    notes: 'Pentest technique book with attack paths per service.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-cheat-gtfobins',
    title: 'GTFOBins',
    url: 'https://gtfobins.github.io',
    category: 'Cheat sheets',
    notes: 'Unix binaries for privilege escalation and bypasses.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-cheat-msf',
    title: 'Metasploit Unleashed',
    url: 'https://www.offsec.com/metasploit-unleashed',
    category: 'Cheat sheets',
    notes: 'Free full Metasploit course from OffSec.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-fw-attack',
    title: 'MITRE ATT&CK',
    url: 'https://attack.mitre.org',
    category: 'Frameworks',
    notes: 'Tactic and technique knowledge base.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-fw-cwe',
    title: 'MITRE CWE List',
    url: 'https://cwe.mitre.org',
    category: 'Frameworks',
    notes: 'Community catalogue of software and hardware weakness types.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-net-nmap',
    title: 'Nmap Reference Guide',
    url: 'https://nmap.org/book/man.html',
    category: 'Network & tools',
    notes: 'Full flag reference for Nmap scanning.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-net-wireshark',
    title: 'Wireshark Display Filters',
    url: 'https://wiki.wireshark.org/DisplayFilters',
    category: 'Network & tools',
    notes: 'Filter syntax reference for packet analysis.',
    createdAt: '2026-01-05T00:00:00.000Z'
  },
  {
    id: 'ref-net-shodan',
    title: 'Shodan',
    url: 'https://www.shodan.io',
    category: 'Network & tools',
    notes: 'Internet-wide device search engine.',
    createdAt: '2026-01-05T00:00:00.000Z'
  }
];
