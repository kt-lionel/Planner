/** Curated compliance control catalog for tagging findings (offline). */

export interface ControlDef {
  id: string;
  label: string;
}

export interface ControlGroup {
  group: string;
  controls: ControlDef[];
}

export const CONTROL_GROUPS: ControlGroup[] = [
  {
    group: 'CIS Controls v8',
    controls: [
      { id: 'CIS 4.1', label: 'Inventory of enterprise assets' },
      { id: 'CIS 4.8', label: 'Inventory of software assets' },
      { id: 'CIS 5.1', label: 'Secure configuration of assets' },
      { id: 'CIS 7.3', label: 'Automated OS patch management' },
      { id: 'CIS 7.4', label: 'Automated application patch management' },
      { id: 'CIS 7.5', label: 'Network infrastructure lifecycle' },
      { id: 'CIS 8.2', label: 'Audit log management' },
      { id: 'CIS 13.1', label: 'Network infrastructure security' },
      { id: 'CIS 16.1', label: 'Incident response plan' },
      { id: 'CIS 16.9', label: 'Incident response data acquisition' }
    ]
  },
  {
    group: 'ISO/IEC 27001:2022',
    controls: [
      { id: 'ISO A.5.9', label: 'Inventory of information assets' },
      { id: 'ISO A.5.10', label: 'Acceptable use of assets' },
      { id: 'ISO A.8.8', label: 'Management of technical vulnerabilities' },
      { id: 'ISO A.8.9', label: 'Configuration management' },
      { id: 'ISO A.8.16', label: 'Monitoring activities' },
      { id: 'ISO A.8.25', label: 'Secure development life cycle' },
      { id: 'ISO A.8.26', label: 'Application security requirements' },
      { id: 'ISO A.8.28', label: 'Secure coding' },
      { id: 'ISO A.8.29', label: 'Security testing in development' }
    ]
  },
  {
    group: 'NIST CSF 2.0',
    controls: [
      { id: 'CSF ID.AM-01', label: 'Physical devices inventoried' },
      { id: 'CSF ID.AM-02', label: 'Software platforms inventoried' },
      { id: 'CSF ID.RA-01', label: 'Vulnerabilities identified' },
      { id: 'CSF ID.RA-05', label: 'Threats identified' },
      { id: 'CSF PR.PS-01', label: 'Configuration management' },
      { id: 'CSF DE.CM-08', label: 'Vulnerabilities scanned' },
      { id: 'CSF GV.OC-04', label: 'Risk management objectives' }
    ]
  }
];

export const ALL_CONTROLS: ControlDef[] = CONTROL_GROUPS.flatMap((g) => g.controls);
