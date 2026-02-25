// ══════════════════════════════════════════════════════════════════════
//  detectWeekStart — Detecção automática da semana do XLSX
//
//  Prioridade:
//    1. Conteúdo do XLSX (aba Statistics/Resume, se tiver campo de período)
//    2. Regex no filename (ex: "106-343122-20260209-20260215.xlsx")
//    3. Fallback: última segunda-feira
//
//  Retorna:
//    { week_start, week_end, detected_from, confidence }
// ══════════════════════════════════════════════════════════════════════

import XLSX from 'xlsx';

export interface WeekDetectionResult {
  week_start: string; // YYYY-MM-DD (segunda-feira)
  week_end: string; // YYYY-MM-DD (domingo)
  detected_from: 'xlsx' | 'filename' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detecta a semana a partir do XLSX, filename, ou fallback.
 */
export function detectWeekStart(
  workbook: XLSX.WorkBook,
  filename: string,
  fallbackWeekStart?: string,
): WeekDetectionResult {
  // 1) Tentar extrair do conteúdo do XLSX
  const fromXlsx = detectFromXlsx(workbook);
  if (fromXlsx) return fromXlsx;

  // 2) Tentar extrair do filename
  const fromFilename = detectFromFilename(filename);
  if (fromFilename) return fromFilename;

  // 3) Fallback: week_start fornecido ou última segunda-feira
  if (fallbackWeekStart) {
    const start = new Date(fallbackWeekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      week_start: fallbackWeekStart,
      week_end: formatDate(end),
      detected_from: 'fallback',
      confidence: 'low',
    };
  }

  // Último recurso: última segunda-feira
  const lastMonday = getLastMonday();
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastSunday.getDate() + 6);
  return {
    week_start: formatDate(lastMonday),
    week_end: formatDate(lastSunday),
    detected_from: 'fallback',
    confidence: 'low',
  };
}

// ─── Detectar do conteúdo XLSX ──────────────────────────────────────

function detectFromXlsx(workbook: XLSX.WorkBook): WeekDetectionResult | null {
  // Tentar ler a aba "Grand Union Member Resume"
  // Algumas planilhas Suprema têm o período no header (linhas 1-5)
  const sheetNames = ['Grand Union Member Resume', 'Grand Union Member Statistics'];

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    // Ler primeiras 10 linhas como texto bruto para encontrar datas
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z10');
    const maxRow = Math.min(range.e.r, 9);

    for (let r = 0; r <= maxRow; r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, 25); c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || !cell.v) continue;

        const val = String(cell.v).trim();

        // Padrão 1: "2026-02-09 ~ 2026-02-15" ou "2026/02/09 ~ 2026/02/15"
        const tildeMatch = val.match(/(\d{4}[-/]\d{2}[-/]\d{2})\s*[~–—-]\s*(\d{4}[-/]\d{2}[-/]\d{2})/);
        if (tildeMatch) {
          const start = tildeMatch[1].replace(/\//g, '-');
          const end = tildeMatch[2].replace(/\//g, '-');
          // Garantir que é segunda-feira
          const monday = adjustToMonday(start);
          const sunday = new Date(monday);
          sunday.setDate(sunday.getDate() + 6);
          return {
            week_start: formatDate(monday),
            week_end: formatDate(sunday),
            detected_from: 'xlsx',
            confidence: 'high',
          };
        }

        // Padrão 2: "20260209-20260215" (compacto)
        const compactMatch = val.match(/(\d{8})\s*[-~]\s*(\d{8})/);
        if (compactMatch) {
          const start = parseCompactDate(compactMatch[1]);
          if (start) {
            const monday = adjustToMonday(formatDate(start));
            const sunday = new Date(monday);
            sunday.setDate(sunday.getDate() + 6);
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

// ─── Detectar do filename ───────────────────────────────────────────

function detectFromFilename(filename: string): WeekDetectionResult | null {
  if (!filename) return null;

  // Padrão: "106-343122-20260209-20260215 (1).xlsx"
  // Captura os dois blocos de 8 dígitos que parecem datas
  const match = filename.match(/(\d{8})\s*[-_]\s*(\d{8})/);
  if (!match) return null;

  const d1 = parseCompactDate(match[1]);
  const d2 = parseCompactDate(match[2]);

  if (!d1 || !d2) return null;

  // Verificar que são datas válidas e a diferença é 6-7 dias
  const diffDays = Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 5 || diffDays > 8) return null;

  // A menor data é o início da semana
  const start = d1 < d2 ? d1 : d2;
  const monday = adjustToMonday(formatDate(start));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return {
    week_start: formatDate(monday),
    week_end: formatDate(sunday),
    detected_from: 'filename',
    confidence: 'medium',
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function parseCompactDate(str: string): Date | null {
  // "20260209" → 2026-02-09
  if (str.length !== 8) return null;
  const y = parseInt(str.substring(0, 4), 10);
  const m = parseInt(str.substring(4, 6), 10) - 1;
  const d = parseInt(str.substring(6, 8), 10);

  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function adjustToMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=domingo, 1=segunda
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getLastMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return now;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
