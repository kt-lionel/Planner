import { BrowserWindow } from 'electron';
import { writeFile } from 'fs/promises';
import type { Engagement } from '../shared/types';
import { newWorkbook, polishSheet } from './report';

const FONT = { name: 'Calibri', size: 11 } as const;
const GREY_FILL = 'FFD9D9D9';
const BLUE = 'FF2E74B5';
const RED = 'FFFF0000';

const LINE_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
  left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
  right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
};

function textHeight(text: string, chars: number): number {
  const plain = text || ' ';
  const lines = Math.max(
    1,
    Math.ceil(plain.length / chars),
    ...plain.split('\n').map((part) => Math.ceil(part.length / chars))
  );
  return Math.max(16, lines * 14.5 + 4);
}

/** Scope + RoE + phase checklist as a styled Excel workbook. */
export async function buildScopeXlsx(engagement: Engagement, outPath: string): Promise<void> {
  const workbook = newWorkbook();
  const ws = workbook.addWorksheet('Scope Report');
  ws.columns = [{ width: 30 }, { width: 78 }, { width: 18 }, { width: 30 }];

  // --- banner row -------------------------------------------------------
  ws.mergeCells('B1:C1');
  const banner = ws.getCell('A1');
  banner.value = `Engagement: ${engagement.name || 'Untitled'}`;
  banner.font = { ...FONT, size: 12, bold: true, color: { argb: BLUE } };
  banner.alignment = { vertical: 'middle', horizontal: 'left' };
  const dept = ws.getCell('B1');
  dept.value = 'Information Security Department';
  dept.font = { ...FONT, size: 13, bold: true };
  dept.alignment = { vertical: 'middle', horizontal: 'center' };
  const internal = ws.getCell('D1');
  internal.value = 'For Internal Use Only';
  internal.font = { ...FONT, size: 11, color: { argb: RED } };
  internal.alignment = { vertical: 'middle', horizontal: 'right' };
  ws.getRow(1).height = 27;

  // --- header row -------------------------------------------------------
  ws.mergeCells('B2:D2');
  const labelHead = ws.getCell('A2');
  labelHead.value = 'Field';
  labelHead.font = FONT;
  labelHead.alignment = { vertical: 'middle', horizontal: 'center' };
  labelHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_FILL } };
  labelHead.border = LINE_BORDER;
  const contentHead = ws.getCell('B2');
  contentHead.value = 'Details';
  contentHead.font = FONT;
  contentHead.alignment = { vertical: 'middle', horizontal: 'center' };
  contentHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_FILL } };
  for (let col = 2; col <= 4; col += 1) ws.getCell(2, col).border = LINE_BORDER;
  ws.getRow(2).height = 21;

  // --- scope fields -----------------------------------------------------
  const fields: Array<[string, string]> = [
    ['Client / requester', engagement.client],
    ['Scope in', engagement.scopeIn],
    ['Scope out of bounds', engagement.scopeOut],
    ['Rules of engagement', engagement.roe]
  ];
  fields.forEach(([label, value], index) => {
    const rowNo = 3 + index;
    ws.mergeCells(rowNo, 2, rowNo, 4);
    const labelCell = ws.getCell(rowNo, 1);
    labelCell.value = label;
    labelCell.font = { ...FONT, bold: true };
    labelCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_FILL } };
    const cell = ws.getCell(rowNo, 2);
    cell.value = value || '—';
    cell.font = FONT;
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    for (let col = 1; col <= 4; col += 1) ws.getCell(rowNo, col).border = LINE_BORDER;
    ws.getRow(rowNo).height = textHeight(value || '—', 120);
  });

  // --- phase checklist --------------------------------------------------
  const headRow = 7;
  for (let col = 1; col <= 4; col += 1) {
    const cell = ws.getCell(headRow, col);
    cell.font = FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_FILL } };
    cell.border = LINE_BORDER;
  }
  ws.getCell(headRow, 1).value = 'Phase';
  ws.getCell(headRow, 2).value = 'Status';
  ws.getRow(headRow).height = 21;

  const phases = engagement.phases.length
    ? engagement.phases
    : [{ id: '', name: '— no phases defined —', done: false }];
  phases.forEach((phase, index) => {
    const rowNo = headRow + 1 + index;
    const nameCell = ws.getCell(rowNo, 1);
    nameCell.value = phase.name;
    nameCell.font = FONT;
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    const statusCell = ws.getCell(rowNo, 2);
    statusCell.value = phase.done ? '✓ Completed' : '○ Pending';
    statusCell.font = { ...FONT, bold: phase.done, color: { argb: phase.done ? 'FF1F7A33' : 'FFA16207' } };
    statusCell.alignment = { vertical: 'middle', horizontal: 'left' };
    for (let col = 1; col <= 4; col += 1) ws.getCell(rowNo, col).border = LINE_BORDER;
    ws.getRow(rowNo).height = Math.max(17, textHeight(phase.name, 36));
  });

  polishSheet(ws, 2);
  await workbook.xlsx.writeFile(outPath);
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bulletList(text: string): string {
  const items = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!items.length) return '<p class="muted">— not specified —</p>';
  return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function paragraphs(text: string): string {
  const items = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!items.length) return '<p class="muted">— not specified —</p>';
  return items.map((item) => `<p>${esc(item)}</p>`).join('');
}

function scopeHtml(engagement: Engagement): string {
  const date = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const phaseRows = engagement.phases.length
    ? engagement.phases
        .map(
          (phase) =>
            `<tr><td>${esc(phase.name)}</td><td class="${
              phase.done ? 'ok' : 'pending'
            }">${phase.done ? '✓ Completed' : '○ Pending'}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="2" class="muted">— no phases defined —</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Scope Report — ${esc(engagement.name || 'Engagement')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0f172a; font-size: 12.5px; line-height: 1.5; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0a1020; padding-bottom: 8px; margin-bottom: 16px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 3px; color: #0a1020; }
  .brand span { color: #16a34a; }
  .kicker { font-size: 10.5px; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; }
  h1 { font-size: 21px; margin: 0 0 4px; color: #0a1020; }
  .meta { color: #475569; font-size: 12px; margin-bottom: 14px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #1d4ed8; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin: 18px 0 8px; }
  ul { margin: 4px 0 4px 18px; padding: 0; }
  li { margin: 2px 0; }
  p { margin: 4px 0; }
  .muted { color: #94a3b8; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #0a1020; color: #eaf1ff; font-size: 11.5px; letter-spacing: .5px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .ok { color: #15803d; font-weight: 700; }
  .pending { color: #a16207; }
  .footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 10.5px; color: #64748b; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">ANZI<span>KA</span></div>
      <div class="kicker">Scope &amp; rules of engagement report</div>
    </div>
    <div class="kicker">For internal use only</div>
  </div>
  <h1>${esc(engagement.name || 'Untitled engagement')}</h1>
  <div class="meta">Client / requester: <b>${esc(engagement.client || '—')}</b> &nbsp;·&nbsp; Generated ${date}</div>

  <h2>Scope — in</h2>
  ${bulletList(engagement.scopeIn)}

  <h2>Scope — out of bounds</h2>
  ${bulletList(engagement.scopeOut)}

  <h2>Rules of engagement</h2>
  ${paragraphs(engagement.roe)}

  <h2>Methodology phases</h2>
  <table>
    <thead><tr><th style="width:65%">Phase</th><th>Status</th></tr></thead>
    <tbody>${phaseRows}</tbody>
  </table>

  <div class="footer">
    <span>Generated by ANZIKA — weekly-planner scope report</span>
    <span>${date}</span>
  </div>
</body>
</html>`;
}

/** Scope + RoE + phase checklist as a print-ready PDF (rendered offscreen). */
export async function buildScopePdf(engagement: Engagement, outPath: string): Promise<void> {
  const win = new BrowserWindow({ show: false });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(scopeHtml(engagement)));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.55, bottom: 0.55, left: 0.5, right: 0.5 }
    });
    await writeFile(outPath, pdf);
  } finally {
    win.destroy();
  }
}
