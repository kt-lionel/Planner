import { Workbook } from 'exceljs';
import type { Asset } from '../shared/types';

/**
 * Write the full asset inventory to an Excel sheet. Header names intentionally
 * match the aliases in shared/asset.ts so a saved sheet can be re-imported
 * through file:openAssetSheet without any column remapping.
 */
export async function buildAssetSheet(assets: Asset[], filePath: string): Promise<void> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Assets');
  ws.columns = [
    { header: '#', key: 'ref', width: 8 },
    { header: 'Hostname', key: 'hostname', width: 30 },
    { header: 'IP Address', key: 'ip', width: 16 },
    { header: 'OS', key: 'os', width: 24 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'IP Range', key: 'range', width: 16 },
    { header: 'Source', key: 'source', width: 16 },
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Criticality', key: 'criticality', width: 14 },
    { header: 'Notes', key: 'notes', width: 40 }
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D2C4D' } };
  for (const a of assets) {
    ws.addRow({
      ref: a.ref ?? '',
      hostname: a.hostname,
      ip: a.ip ?? '',
      os: a.os ?? '',
      status: a.status ?? '',
      range: a.range ?? '',
      source: a.source ?? '',
      owner: a.owner ?? '',
      criticality: a.criticality,
      notes: a.notes ?? ''
    });
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(filePath);
}
