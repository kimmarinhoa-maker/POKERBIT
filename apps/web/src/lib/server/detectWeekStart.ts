// ══════════════════════════════════════════════════════════════════════
//  detectWeekStart — Detecção automática da semana do XLSX
// ══════════════════════════════════════════════════════════════════════

import XLSX from 'xlsx';

export interface WeekDetectionResult {
  week_start: string;
  week_end: string;
  detected_from: 'xlsx' | 'filename' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
}

export function detectWeekStart(
  workbook: XLSX.WorkBook,
  filename: string,
  fallbackWeekStart?: string,
): WeekDetectionResult {
  const fromXlsx = detectFromXlsx(workbook);
  if (fromXlsx) return fromXlsx;

  const fromFilename = detectFromFilename(filename);
  if (fromFilename) return fromFilename;

  if (fallbackWeekStart) {
    const start = new Date(fallbackWeekStart + 'T00:00:00Z');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
      week_start: fallbackWeekStart,
      week_end: formatDate(end),
      detected_from: 'fallback',
      confidence: 'low',
    };
  }

  const lastMonday = getLastMonday();
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() + 6);
  return {
    week_start: formatDate(lastMonday),
    week_end: formatDate(lastSunday),
    detected_from: 'fallback',
    confidence: 'low',
  };
}

function detectFromXlsx(workbook: XLSX.WorkBook): WeekDetectionResult | null {
  const sheetNames = ['Grand Union Member Resume', 'Grand Union Member Statistics'];

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z10');
    const maxRow = Math.min(range.e.r, 9);

    for (let r = 0; r <= maxRow; r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, 25); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || !cell.v) continue;

        const val = String(cell.v).trim();

        const tildeMatch = val.match(/(\d{4}[-/]\d{2}[-/]\d{2})\s*[~–—-]\s*(\d{4}[-/]\d{2}[-/]\d{2})/);
        if (tildeMatch) {
          const start = tildeMatch[1].replace(/\//g, '-');
          const monday = adjustToMonday(start);
          const sunday = new Date(monday);
          sunday.setUTCDate(sunday.getUTCDate() + 6);
          return {
            week_start: formatDate(monday),
            week_end: formatDate(sunday),
            detected_from: 'xlsx',
            confidence: 'high',
          };
        }

        const compactMatch = val.match(/(\d{8})\s*[-~]\s*(\d{8})/);
        if (compactMatch) {
          const start = parseCompactDate(compactMatch[1]);
          if (start) {
            const monday = adjustToMonday(formatDate(start));
            const sunday = new Date(monday);
            sunday.setUTCDate(sunday.getUTCDate() + 6);
            return {
              week_start: formatDate(monday),
              week_end: formatDate(sunday),
              detected_from: 'xlsx',
              confidence: 'high',
            };
          }
        }
      }
    }
  }

  return null;
}

function detectFromFilename(filename: string): WeekDetectionResult | null {
  if (!filename) return null;

  const match = filename.match(/(\d{8})\s*[-_]\s*(\d{8})/);
  if (!match) return null;

  const d1 = parseCompactDate(match[1]);
  const d2 = parseCompactDate(match[2]);
  if (!d1 || !d2) return null;

  const diffDays = Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 5 || diffDays > 8) return null;

  const start = d1 < d2 ? d1 : d2;
  const monday = adjustToMonday(formatDate(start));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  return {
    week_start: formatDate(monday),
    week_end: formatDate(sunday),
    detected_from: 'filename',
    confidence: 'medium',
  };
}

function parseCompactDate(str: string): Date | null {
  if (str.length !== 8) return null;
  const y = parseInt(str.substring(0, 4), 10);
  const m = parseInt(str.substring(4, 6), 10) - 1;
  const d = parseInt(str.substring(6, 8), 10);
  const date = new Date(Date.UTC(y, m, d));
  if (isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
  return date;
}

function adjustToMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function getLastMonday(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setUTCDate(now.getUTCDate() + diff);
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
