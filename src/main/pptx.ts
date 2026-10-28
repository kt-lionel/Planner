import PptxGenJS from 'pptxgenjs';
import type {
  DailyPayload,
  Finding,
  RiskFactor,
  Task,
  WeeklyPayload
} from '../shared/types';
import { findingBreached, findingIsOpen } from '../shared/types';
import { addDays, isoDate } from '../shared/date';
import { fmtLong, fmtShort, parseIsoDate, statusLabel } from './report';

type Slide = PptxGenJS.Slide;

/** Department slide styling — mirrors the IS weekly report template. */
const BLUE = '0070C0';
const RED = 'C00000';
const HEAD_FILL = 'DCE6F1';
const BODY_FILL = 'FFFFFF';
const BORDER = { pt: 0.5, color: '7F7F7F' } as const;

const SIZE_OPS = 8.5;
const SIZE_SECTION = 9.5;
const SIZE_ITEM = 8.5;

interface Run {
  text: string;
  bold?: boolean;
  color?: string;
  size?: number;
}

/** One paragraph of the "Activities" cell. */
type Line = Run[];

function taskLines(task: Task): Line[] {
  const date = fmtLong(parseIsoDate(task.date));
  const due =
    task.recurrence === 'none' && task.dueDate
      ? ` · due ${fmtLong(parseIsoDate(task.dueDate))}`
      : '';
  const line: Line = [{ text: '◦ ', bold: true, size: SIZE_ITEM }];
  line.push({ text: task.title, bold: true, size: SIZE_ITEM });
  if (task.notes) line.push({ text: `: ${task.notes} `, size: SIZE_ITEM });
  else line.push({ text: ' ', size: SIZE_ITEM });
  if (due) line.push({ text: due, size: SIZE_ITEM });
  line.push({ text: ` – ${date}. `, size: SIZE_ITEM });
  line.push({ text: '→ ', bold: true, size: SIZE_ITEM });
  line.push({ text: statusLabel(task), bold: true, size: SIZE_ITEM });
  return [line];
}

function section(title: string): Line {
  return [{ text: title, bold: true, size: SIZE_SECTION }];
}

function blank(): Line {
  return [{ text: '', size: SIZE_ITEM }];
}

function activityCell(payload: WeeklyPayload): Line[] {
  const end = parseIsoDate(payload.weekEnd);
  const byDate = (a: Task, b: Task): number =>
    a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');

  const weekTasks = payload.tasks
    .filter((t) => t.date >= payload.weekStart && t.date <= payload.weekEnd)
    .sort(byDate);
  const blocked = weekTasks.filter((t) => t.status === 'blocked');
  const recurring = weekTasks.filter((t) => t.recurrence !== 'none');
  const nextEndIso = isoDate(addDays(end, 7));
  const nextTasks = payload.tasks
    .filter((t) => t.date > payload.weekEnd && t.date <= nextEndIso)
    .sort(byDate);

  const lines: Line[] = [];
  lines.push([
    { text: '☐ INFORMATION SECURITY OPERATIONS.', bold: true, color: BLUE, size: SIZE_OPS }
  ]);
  lines.push(blank());
  lines.push(section('✦ Activities(This week)'));
  if (weekTasks.length) for (const task of weekTasks) lines.push(...taskLines(task));
  else lines.push([{ text: '◦ No activities recorded this week.', size: SIZE_ITEM }]);
  lines.push(blank());
  lines.push(section('✦ Challenges'));
  if (blocked.length) {
    for (const task of blocked) {
      lines.push([{ text: `◦ ${task.title}`, bold: true, size: SIZE_ITEM }]);
    }
  } else {
    lines.push([{ text: 'No challenge faced', size: SIZE_ITEM }]);
  }
  lines.push(blank());
  lines.push(section('✦ Activities(Next week)'));
  if (nextTasks.length) {
    for (const task of nextTasks) {
      lines.push([
        { text: `◦ ${task.title}`, bold: true, size: SIZE_ITEM },
        { text: ` – ${fmtLong(parseIsoDate(task.date))}.`, size: SIZE_ITEM }
      ]);
    }
  } else if (recurring.length) {
    for (const task of recurring) {
      const repeats = task.recurrence === 'monthly' ? '(repeats monthly)' : '(repeats weekly)';
      lines.push([
        { text: `◦ ${task.title}`, bold: true, size: SIZE_ITEM },
        { text: ` ${repeats}`, size: SIZE_ITEM }
      ]);
    }
  } else {
    lines.push([{ text: '◦ No activities planned yet.', size: SIZE_ITEM }]);
  }

  // Section break keeps the trailing paragraph tidy in PowerPoint.
  lines.push(blank());
  return lines;
}

function toRuns(lines: Line[]): Array<{ text: string; options?: Record<string, unknown> }> {
  const runs: Array<{ text: string; options?: Record<string, unknown> }> = [];
  lines.forEach((line) => {
    line.forEach((run, runIndex) => {
      const isLastRun = runIndex === line.length - 1;
      runs.push({
        text: run.text,
        options: {
          bold: run.bold ?? false,
          color: run.color ?? '000000',
          fontSize: run.size ?? SIZE_ITEM,
          fontFace: 'Calibri',
          breakLine: isLastRun
        }
      });
    });
  });
  return runs;
}

/** Department banner row — identical on the weekly and daily decks. */
function addBanner(slide: Slide, label: string): void {
  slide.addText(label, {
    x: 0.45,
    y: 0.38,
    w: 4.2,
    h: 0.42,
    fontFace: 'Calibri',
    fontSize: 9,
    bold: true,
    color: BLUE,
    align: 'left',
    valign: 'middle'
  });
  slide.addText('Information Security Department', {
    x: 4.65,
    y: 0.35,
    w: 4.0,
    h: 0.48,
    fontFace: 'Calibri',
    fontSize: 14,
    bold: true,
    color: '000000',
    align: 'center',
    valign: 'middle'
  });
  slide.addText('For Internal Use Only', {
    x: 9.68,
    y: 0.38,
    w: 3.2,
    h: 0.42,
    fontFace: 'Calibri',
    fontSize: 9.5,
    bold: true,
    color: RED,
    align: 'right',
    valign: 'middle'
  });
}

const COVER_BG = '1F3864';
const COVER_ACCENT = 'FACC15';
const COVER_MUTED = 'AFC6E8';

/** Professional cover slide — navy background, accent rule, big period title. */
function addCover(
  pptx: PptxGenJS,
  kicker: string,
  period: string,
  subtitle: string
): Slide {
  const slide = pptx.addSlide();
  slide.background = { color: COVER_BG };
  slide.addText('Information Security Department', {
    x: 0.9,
    y: 0.55,
    w: 7.5,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 13,
    bold: true,
    color: 'FFFFFF'
  });
  slide.addText('For Internal Use Only', {
    x: 9.4,
    y: 0.55,
    w: 3,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 11,
    bold: true,
    color: 'FF9B9B',
    align: 'right'
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.9,
    y: 2.52,
    w: 1.5,
    h: 0.07,
    fill: { color: COVER_ACCENT }
  });
  slide.addText(kicker, {
    x: 0.9,
    y: 2.78,
    w: 11.5,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 15,
    bold: true,
    color: COVER_ACCENT,
    charSpacing: 2.5
  });
  slide.addText(period, {
    x: 0.9,
    y: 3.16,
    w: 11.5,
    h: 0.95,
    fontFace: 'Calibri',
    fontSize: 40,
    bold: true,
    color: 'FFFFFF'
  });
  slide.addText(subtitle, {
    x: 0.9,
    y: 4.2,
    w: 11.5,
    h: 0.5,
    fontFace: 'Calibri',
    fontSize: 16,
    color: COVER_MUTED
  });
  slide.addText('Generated offline by ANZIKA — data never leaves this device.', {
    x: 0.9,
    y: 6.7,
    w: 11.5,
    h: 0.3,
    fontFace: 'Calibri',
    fontSize: 10,
    italic: true,
    color: '8FA9CF'
  });
  return slide;
}

/** Small footer on content slides: confidentiality note + page number. */
function addFooter(slide: Slide, page: number): void {
  slide.addText('ANZIKA — For Internal Use Only', {
    x: 0.45,
    y: 7.19,
    w: 6,
    h: 0.25,
    fontFace: 'Calibri',
    fontSize: 8,
    italic: true,
    color: '808080'
  });
  slide.addText(String(page), {
    x: 12.4,
    y: 7.19,
    w: 0.48,
    h: 0.25,
    fontFace: 'Calibri',
    fontSize: 8,
    color: '808080',
    align: 'right'
  });
}

function headCell(text: string): { text: string; options: Record<string, unknown> } {
  return {
    text,
    options: {
      fill: { color: HEAD_FILL },
      bold: true,
      fontSize: SIZE_SECTION,
      fontFace: 'Calibri',
      align: 'center',
      valign: 'middle'
    }
  };
}

function bodyCell(lines: Line[]): { text: ReturnType<typeof toRuns>; options: Record<string, unknown> } {
  return {
    text: toRuns(lines),
    options: {
      fill: { color: BODY_FILL },
      fontSize: SIZE_ITEM,
      fontFace: 'Calibri',
      align: 'left',
      valign: 'top',
      margin: 4
    }
  };
}

export async function buildWeeklyPptx(payload: WeeklyPayload, outFile: string): Promise<void> {
  const start = parseIsoDate(payload.weekStart);
  const end = parseIsoDate(payload.weekEnd);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'DEPARTMENT', width: 13.333, height: 7.5 });
  pptx.layout = 'DEPARTMENT';
  pptx.author = 'ANZIKA';
  pptx.title = `Weekly Report ${payload.weekStart}`;

  addCover(
    pptx,
    'WEEKLY REPORT',
    `${fmtShort(start)} – ${fmtShort(end)} ${end.getFullYear()}`,
    'Weekly information security operations summary'
  );

  const slide = pptx.addSlide();
  addBanner(slide, `Week: ${fmtShort(start)} – ${fmtShort(end)} ${end.getFullYear()}`);
  addFooter(slide, 2);

  slide.addTable(
    [
      [headCell('Activity'), headCell('Activities')],
      [headCell('General Summary'), bodyCell(activityCell(payload))]
    ],
    {
      x: 0.45,
      y: 1.02,
      w: 12.43,
      colW: [1.49, 10.94],
      rowH: [0.38, 5.72],
      border: BORDER,
      fontFace: 'Calibri'
    }
  );

  const findings = payload.findings ?? [];
  if (findings.length || (payload.risk?.length ?? 0) >= 2) {
    addRiskSlide(pptx, payload, findings, start, end);
  }

  await pptx.writeFile({ fileName: outFile });
}

/* ------------------------------------------------------------------ */
/* Exec slide: risk trend + severity table + compliance coverage        */
/* ------------------------------------------------------------------ */

const SEVERITY_FILL: Record<RiskFactor, string> = {
  Critical: 'F4CCCC',
  High: 'FCE4E4',
  Medium: 'FFF2CC',
  Low: 'E2EFDA',
  Info: 'EDEDED'
};

function addRiskSlide(
  pptx: PptxGenJS,
  payload: WeeklyPayload,
  findings: Finding[],
  start: Date,
  end: Date
): void {
  const slide = pptx.addSlide();
  addBanner(slide, `Week: ${fmtShort(start)} – ${fmtShort(end)} ${end.getFullYear()}`);

  slide.addText('Risk & compliance summary', {
    x: 0.45,
    y: 1.0,
    w: 12.43,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 16,
    bold: true,
    color: '000000'
  });

  const open = findings.filter((f) => findingIsOpen(f));
  const breached = findings.filter((f) => findingBreached(f));

  // --- severity table (left) ---
  const sevRows: Array<Array<{ text: string; options: Record<string, unknown> }>> = [
    [
      { text: 'Severity', options: { fill: { color: HEAD_FILL }, bold: true, fontSize: 10, fontFace: 'Calibri', align: 'center' } },
      { text: 'Open', options: { fill: { color: HEAD_FILL }, bold: true, fontSize: 10, fontFace: 'Calibri', align: 'center' } }
    ],
    ...(['Critical', 'High', 'Medium', 'Low', 'Info'] as RiskFactor[]).map((sev) => [
      {
        text: sev,
        options: { fill: { color: SEVERITY_FILL[sev] }, bold: true, fontSize: 10, fontFace: 'Calibri', align: 'left', margin: 4 }
      },
      {
        text: String(open.filter((f) => f.risk === sev).length),
        options: { fill: { color: 'FFFFFF' }, fontSize: 10, fontFace: 'Calibri', align: 'center' }
      }
    ])
  ];
  slide.addTable(sevRows, {
    x: 0.45,
    y: 1.55,
    w: 3.1,
    colW: [1.9, 1.2],
    rowH: [0.32, 0.3, 0.3, 0.3, 0.3, 0.3],
    border: BORDER,
    fontFace: 'Calibri'
  });

  slide.addText(
    [
      { text: 'SLA status', options: { bold: true, fontSize: 11, breakLine: true } },
      {
        text: `Open: ${open.length}   Breached: ${breached.length}`,
        options: { fontSize: 10.5, breakLine: true },
      },
      { text: 'Targets: Critical 14d · High 30d · Medium 60d · Low 90d', options: { fontSize: 9.5, color: '666666' } }
    ],
    {
      x: 0.45,
      y: 3.65,
      w: 3.1,
      h: 1.1,
      fontFace: 'Calibri',
      valign: 'top'
    }
  );

  // --- trend bars (middle) ---
  const trend = (payload.risk ?? []).slice(-7);
  slide.addText('Open findings — daily trend', {
    x: 4.0,
    y: 1.55,
    w: 4.9,
    h: 0.3,
    fontFace: 'Calibri',
    fontSize: 11,
    bold: true
  });
  if (trend.length >= 2) {
    const max = Math.max(1, ...trend.map((s) => s.open));
    const baseY = 5.0;
    const maxH = 2.6;
    const barW = 0.52;
    const gap = 0.16;
    const totalW = trend.length * barW + (trend.length - 1) * gap;
    let x = 4.0 + Math.max(0, (4.9 - totalW) / 2);
    slide.addShape(pptx.ShapeType.line, {
      x: 4.0,
      y: baseY,
      w: 4.9,
      h: 0,
      line: { color: 'BFBFBF', width: 1 }
    });
    for (const snap of trend) {
      const h = Math.max(0.06, (snap.open / max) * maxH);
      slide.addShape(pptx.ShapeType.rect, {
        x,
        y: baseY - h,
        w: barW,
        h,
        fill: { color: snap.critical ? 'C00000' : snap.high ? 'ED7D31' : '4472C4' },
        line: { color: 'FFFFFF', width: 0.5 }
      });
      slide.addText(String(snap.open), {
        x: x - 0.1,
        y: baseY - h - 0.26,
        w: barW + 0.2,
        h: 0.24,
        fontFace: 'Calibri',
        fontSize: 9,
        bold: true,
        align: 'center'
      });
      slide.addText(snap.date.slice(5), {
        x: x - 0.1,
        y: baseY + 0.05,
        w: barW + 0.2,
        h: 0.22,
        fontFace: 'Calibri',
        fontSize: 8,
        color: '666666',
        align: 'center'
      });
      x += barW + gap;
    }
  } else {
    slide.addText('Not enough snapshots yet — the trend appears after two days of use.', {
      x: 4.0,
      y: 2.4,
      w: 4.9,
      h: 0.6,
      fontFace: 'Calibri',
      fontSize: 10,
      color: '666666'
    });
  }

  // --- compliance coverage (right) ---
  const controlCounts = new Map<string, number>();
  for (const f of findings) {
    for (const c of f.controls ?? []) controlCounts.set(c, (controlCounts.get(c) ?? 0) + 1);
  }
  const controls = [...controlCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9);
  const coverageRuns: Array<{ text: string; options: Record<string, unknown> }> = [
    { text: 'Compliance coverage', options: { bold: true, fontSize: 11, breakLine: true } }
  ];
  if (controls.length) {
    for (const [id, n] of controls) {
      coverageRuns.push({
        text: `${id} — ${n} finding${n === 1 ? '' : 's'}`,
        options: { fontSize: 10, breakLine: true }
      });
    }
  } else {
    coverageRuns.push({
      text: 'No findings tagged with controls yet.\nTag them in the finding dialog (CWE / controls).',
      options: { fontSize: 10, color: '666666' }
    });
  }
  slide.addText(coverageRuns, {
    x: 9.3,
    y: 1.55,
    w: 3.55,
    h: 3.3,
    fontFace: 'Calibri',
    valign: 'top'
  });

  slide.addText('Generated offline by ANZIKA — data never leaves this device.', {
    x: 0.45,
    y: 6.7,
    w: 12.43,
    h: 0.3,
    fontFace: 'Calibri',
    fontSize: 8.5,
    italic: true,
    color: '808080'
  });
  addFooter(slide, 3);
}

/* ------------------------------------------------------------------ */
/* Daily deck — single day, same department slide                      */
/* ------------------------------------------------------------------ */

function dayTaskLines(task: Task): Line[] {
  const lines = taskLines(task);
  if (!task.time) return lines;
  return [[{ text: `${task.time} · `, bold: true, size: SIZE_ITEM }, ...lines[0]]];
}

function dayLogLines(payload: DailyPayload): Line[] {
  const dayLog = payload.log
    .filter((e) => e.date === payload.date)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!dayLog.length) return [[{ text: '◦ No activity recorded on this day.', size: SIZE_ITEM }]];
  return dayLog.map((entry) => {
    const time = new Date(entry.at).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
    const title = `"${entry.taskTitle}"`;
    const detail =
      entry.action === 'status'
        ? `Status: ${title} → ${entry.to ?? ''}`
        : entry.action === 'moved'
          ? `Moved ${title}: ${entry.from} → ${entry.to}`
          : `${entry.action.charAt(0).toUpperCase()}${entry.action.slice(1)} ${title}`;
    return [
      { text: '◦ ', bold: true, size: SIZE_ITEM },
      { text: `${time} — `, bold: true, size: SIZE_ITEM },
      { text: detail, size: SIZE_ITEM }
    ];
  });
}

export async function buildDailyPptx(payload: DailyPayload, outFile: string): Promise<void> {
  const day = parseIsoDate(payload.date);
  const dayTasks = payload.tasks
    .filter((t) => t.date === payload.date)
    .sort(
      (a, b) =>
        (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.title.localeCompare(b.title)
    );

  const scheduled: Line[] = [];
  if (dayTasks.length) for (const task of dayTasks) scheduled.push(...dayTaskLines(task));
  else scheduled.push([{ text: '◦ No activities scheduled for this day.', size: SIZE_ITEM }]);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'DEPARTMENT', width: 13.333, height: 7.5 });
  pptx.layout = 'DEPARTMENT';
  pptx.author = 'ANZIKA';
  pptx.title = `Daily Activity ${payload.date}`;

  addCover(
    pptx,
    'DAILY ACTIVITY REPORT',
    `${fmtLong(day)} ${day.getFullYear()}`,
    'Scheduled activities and activity log for the day'
  );

  const slide = pptx.addSlide();
  addBanner(slide, `Day: ${fmtShort(day)} ${day.getFullYear()}`);
  addFooter(slide, 2);

  slide.addTable(
    [
      [headCell('Activity'), headCell('Activities')],
      [headCell('Scheduled activities'), bodyCell(scheduled)],
      [headCell('Activity log'), bodyCell(dayLogLines(payload))]
    ],
    {
      x: 0.45,
      y: 1.02,
      w: 12.43,
      colW: [1.49, 10.94],
      rowH: [0.38, 2.87, 2.87],
      border: BORDER,
      fontFace: 'Calibri'
    }
  );

  await pptx.writeFile({ fileName: outFile });
}
