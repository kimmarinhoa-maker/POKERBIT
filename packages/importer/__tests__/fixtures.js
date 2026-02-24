/**
 * Test fixtures for importer tests.
 * Creates mock XLSX-like structures without requiring actual XLSX files.
 */
import XLSX from 'xlsx';

export const RESUME_HEADERS = [
  'Player ID', 'nickName', 'Agent ID', 'Agent Name',
  'Sub Agent ID', 'Sub Agent Name', 'Winnings', 'Total Fee',
  'RODEO Total Profit', 'Games', 'Hands', 'Role',
];

export const STATS_HEADERS = [
  'Player ID', 'Ring Game Total(Local)', 'MTT Total(Local)',
  'SNG Total(Local)', 'SPIN Total(Local)', 'TLT Total(Local)',
];

/**
 * Creates a resume row array from overrides.
 * Returns an array matching RESUME_HEADERS column order.
 */
export function makeResumeRow(overrides = {}) {
  const defaults = {
    'Player ID': '1001',
    'nickName': 'TestPlayer',
    'Agent ID': 'AG01',
    'Agent Name': 'AMS TestAgent',
    'Sub Agent ID': '',
    'Sub Agent Name': '',
    'Winnings': 100,
    'Total Fee': 50,
    'RODEO Total Profit': 20,
    'Games': 10,
    'Hands': 500,
    'Role': 'Member',
  };

  const merged = { ...defaults, ...overrides };
  return RESUME_HEADERS.map(h => merged[h]);
}

/**
 * Creates a statistics row array from overrides.
 */
export function makeStatsRow(overrides = {}) {
  const defaults = {
    'Player ID': '1001',
    'Ring Game Total(Local)': 30,
    'MTT Total(Local)': 10,
    'SNG Total(Local)': 5,
    'SPIN Total(Local)': 3,
    'TLT Total(Local)': 2,
  };

  const merged = { ...defaults, ...overrides };
  return STATS_HEADERS.map(h => merged[h]);
}

/**
 * Creates rows array (header + data rows) for Resume tab.
 * headerOffset = number of blank rows before header (default 0).
 */
export function makeResumeRows(playerOverrides = [{}], headerOffset = 0) {
  const rows = [];
  for (let i = 0; i < headerOffset; i++) rows.push([]);
  rows.push(RESUME_HEADERS);
  for (const ovr of playerOverrides) {
    rows.push(makeResumeRow(ovr));
  }
  return rows;
}

/**
 * Creates rows array for Statistics tab.
 */
export function makeStatsRows(playerOverrides = [{}], headerOffset = 0) {
  const rows = [];
  for (let i = 0; i < headerOffset; i++) rows.push([]);
  rows.push(STATS_HEADERS);
  for (const ovr of playerOverrides) {
    rows.push(makeStatsRow(ovr));
  }
  return rows;
}

/**
 * Creates a mock workbook object compatible with coreSuprema.parseWorkbook.
 * Uses XLSX.utils.aoa_to_sheet internally.
 */
export function makeWorkbook(resumePlayerOverrides = [{}], statsPlayerOverrides = null) {
  const resumeRows = makeResumeRows(resumePlayerOverrides);
  const resumeSheet = XLSX.utils.aoa_to_sheet(resumeRows);

  const wb = {
    SheetNames: ['Grand Union Member Resume'],
    Sheets: {
      'Grand Union Member Resume': resumeSheet,
    },
  };

  if (statsPlayerOverrides) {
    const statsRows = makeStatsRows(statsPlayerOverrides);
    wb.SheetNames.push('Grand Union Member Statistics');
    wb.Sheets['Grand Union Member Statistics'] = XLSX.utils.aoa_to_sheet(statsRows);
  }

  return wb;
}

/**
 * Creates a config object for coreSuprema.parseWorkbook.
 */
export function makeConfig(overrides = {}) {
  return {
    playerLinks: {},
    agentOverrides: {},
    ignoredAgents: {},
    manualLinks: {},
    prefixRules: [],
    guToBrl: 5,
    ...overrides,
  };
}
