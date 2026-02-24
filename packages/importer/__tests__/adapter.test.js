import { describe, it, expect } from 'vitest';
import {
  parseNum,
  findHeaderRow,
  mapCols,
  resolveClubeInterno,
  adapterImportResume,
  parseStatisticsBreakdown,
} from '../adapter.js';
import { makeResumeRows, makeStatsRows } from './fixtures.js';

// ─── parseNum ────────────────────────────────────────────────────────
describe('parseNum', () => {
  it('null retorna 0', () => {
    expect(parseNum(null)).toBe(0);
  });

  it('undefined retorna 0', () => {
    expect(parseNum(undefined)).toBe(0);
  });

  it('string vazia retorna 0', () => {
    expect(parseNum('')).toBe(0);
  });

  it('"--" retorna 0', () => {
    expect(parseNum('--')).toBe(0);
  });

  it('"none" retorna 0', () => {
    expect(parseNum('none')).toBe(0);
  });

  it('numero direto retorna o numero', () => {
    expect(parseNum(42)).toBe(42);
  });

  it('NaN retorna 0', () => {
    expect(parseNum(NaN)).toBe(0);
  });

  it('string numerica simples', () => {
    expect(parseNum('123.45')).toBeCloseTo(123.45);
  });

  it('parenteses indicam negativo: "(100)" → -100', () => {
    expect(parseNum('(100)')).toBe(-100);
  });

  it('formato BR: "1.234,56" → 1234.56', () => {
    expect(parseNum('1.234,56')).toBeCloseTo(1234.56);
  });

  it('formato US: "1,234.56" → 1234.56', () => {
    expect(parseNum('1,234.56')).toBeCloseTo(1234.56);
  });

  it('"abc" retorna 0', () => {
    expect(parseNum('abc')).toBe(0);
  });
});

// ─── findHeaderRow ───────────────────────────────────────────────────
describe('findHeaderRow', () => {
  it('header na primeira linha (idx 0)', () => {
    const rows = [['Player ID', 'nickName', 'Winnings']];
    expect(findHeaderRow(rows)).toBe(0);
  });

  it('header na terceira linha (idx 2)', () => {
    const rows = [[], ['Titulo'], ['Player ID', 'nickName']];
    expect(findHeaderRow(rows)).toBe(2);
  });

  it('header ausente retorna -1', () => {
    const rows = [['Name', 'Value'], ['A', 1]];
    expect(findHeaderRow(rows)).toBe(-1);
  });

  it('array vazio retorna -1', () => {
    expect(findHeaderRow([])).toBe(-1);
  });

  it('busca ate no maximo 15 linhas', () => {
    const rows = Array(20).fill(['other']);
    rows[14] = ['Player ID'];
    expect(findHeaderRow(rows)).toBe(14);
  });

  it('nao encontra apos 15 linhas', () => {
    const rows = Array(20).fill(['other']);
    rows[16] = ['Player ID'];
    expect(findHeaderRow(rows)).toBe(-1);
  });
});

// ─── mapCols ─────────────────────────────────────────────────────────
describe('mapCols', () => {
  it('mapeia colunas por nome', () => {
    const header = ['Player ID', 'nickName', 'Winnings'];
    const map = mapCols(header);
    expect(map['Player ID']).toBe(0);
    expect(map['nickName']).toBe(1);
    expect(map['Winnings']).toBe(2);
  });

  it('ignora celulas vazias', () => {
    const header = ['Player ID', '', 'Winnings'];
    const map = mapCols(header);
    expect(map['']).toBeUndefined();
    expect(Object.keys(map).length).toBe(2);
  });

  it('trim de espacos', () => {
    const header = ['  Player ID  ', 'nickName '];
    const map = mapCols(header);
    expect(map['Player ID']).toBe(0);
    expect(map['nickName']).toBe(1);
  });

  it('duplicatas recebem sufixo :idx', () => {
    const header = ['Player ID', 'Value', 'Value'];
    const map = mapCols(header);
    expect(map['Value']).toBe(1);
    expect(map['Value:2']).toBe(2);
  });

  it('null/undefined tratados', () => {
    const map = mapCols(null);
    expect(map).toEqual({});
  });
});

// ─── resolveClubeInterno ─────────────────────────────────────────────
describe('resolveClubeInterno', () => {
  it('AMS → IMPERIO', () => {
    expect(resolveClubeInterno('AMS Test')).toBe('IMPERIO');
  });

  it('TW → IMPERIO', () => {
    expect(resolveClubeInterno('TW Agent')).toBe('IMPERIO');
  });

  it('BB → IMPERIO', () => {
    expect(resolveClubeInterno('BB Agent')).toBe('IMPERIO');
  });

  it('TGP → TGP', () => {
    expect(resolveClubeInterno('TGP Agent')).toBe('TGP');
  });

  it('CONFRA → CONFRARIA', () => {
    expect(resolveClubeInterno('CONFRA something')).toBe('CONFRARIA');
  });

  it('3BET → 3BET', () => {
    expect(resolveClubeInterno('3BET test')).toBe('3BET');
  });

  it('CH → CH', () => {
    expect(resolveClubeInterno('CH agent')).toBe('CH');
  });

  it('null → OUTROS', () => {
    expect(resolveClubeInterno(null)).toBe('OUTROS');
  });

  it('"" → OUTROS', () => {
    expect(resolveClubeInterno('')).toBe('OUTROS');
  });

  it('"NONE" → OUTROS', () => {
    expect(resolveClubeInterno('NONE')).toBe('OUTROS');
  });

  it('nome com "AG. " prefix → strip + resolve', () => {
    expect(resolveClubeInterno('AG. AMS Test')).toBe('IMPERIO');
  });

  it('contem TGP no meio → TGP (fallback)', () => {
    expect(resolveClubeInterno('Random TGP Agent')).toBe('TGP');
  });

  it('nome desconhecido → OUTROS', () => {
    expect(resolveClubeInterno('Unknown Agent')).toBe('OUTROS');
  });
});

// ─── adapterImportResume ─────────────────────────────────────────────
describe('adapterImportResume', () => {
  it('parse basico: 1 jogador', () => {
    const rows = makeResumeRows([{
      'Player ID': '1001',
      'nickName': 'Hero',
      'Agent Name': 'AMS Test',
      'Winnings': 100,
      'Total Fee': 50,
    }]);
    const result = adapterImportResume(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1001');
    expect(result[0].nick).toBe('Hero');
    expect(result[0].ganhos).toBeCloseTo(500);  // 100 * 5 (GU_TO_BRL)
    expect(result[0].rakeGerado).toBeCloseTo(250); // 50 * 5
    expect(result[0].clubeInterno).toBe('IMPERIO');
  });

  it('multiplica valores por GU_TO_BRL (5)', () => {
    const rows = makeResumeRows([{
      'Winnings': 200,
      'Total Fee': 100,
      'RODEO Total Profit': 40,
    }]);
    const result = adapterImportResume(rows);
    expect(result[0].ganhos).toBeCloseTo(1000);
    expect(result[0].rakeGerado).toBeCloseTo(500);
    expect(result[0].ggr).toBeCloseTo(200);
  });

  it('rows null retorna []', () => {
    expect(adapterImportResume(null)).toEqual([]);
  });

  it('menos de 2 rows retorna []', () => {
    expect(adapterImportResume([['Player ID']])).toEqual([]);
  });

  it('pula linhas com Player ID vazio ou "none"', () => {
    const rows = makeResumeRows([
      { 'Player ID': '' },
      { 'Player ID': 'none' },
      { 'Player ID': '1001' },
    ]);
    const result = adapterImportResume(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1001');
  });

  it('multiplos jogadores', () => {
    const rows = makeResumeRows([
      { 'Player ID': '1001', 'Agent Name': 'AMS X' },
      { 'Player ID': '1002', 'Agent Name': 'TGP Y' },
      { 'Player ID': '1003', 'Agent Name': 'Unknown' },
    ]);
    const result = adapterImportResume(rows);
    expect(result).toHaveLength(3);
    expect(result[0].clubeInterno).toBe('IMPERIO');
    expect(result[1].clubeInterno).toBe('TGP');
    expect(result[2].clubeInterno).toBe('OUTROS');
  });

  it('header com offset (linhas em branco antes)', () => {
    const rows = makeResumeRows([{ 'Player ID': '1001' }], 3);
    const result = adapterImportResume(rows);
    expect(result).toHaveLength(1);
  });

  it('sem header "Player ID" retorna []', () => {
    const rows = [['Name', 'Value'], ['A', 1]];
    expect(adapterImportResume(rows)).toEqual([]);
  });
});

// ─── parseStatisticsBreakdown ────────────────────────────────────────
describe('parseStatisticsBreakdown', () => {
  it('parse basico retorna map por Player ID', () => {
    const rows = makeStatsRows([{
      'Player ID': '1001',
      'Ring Game Total(Local)': 30,
      'MTT Total(Local)': 10,
      'SNG Total(Local)': 5,
      'SPIN Total(Local)': 3,
      'TLT Total(Local)': 2,
    }]);
    const map = parseStatisticsBreakdown(rows);
    expect(map['1001']).toBeDefined();
    expect(map['1001'].ringGame).toBe(30);
    expect(map['1001'].mtt).toBe(10);
    expect(map['1001'].total).toBe(50);
  });

  it('total = soma de todos campos', () => {
    const rows = makeStatsRows([{
      'Player ID': '2002',
      'Ring Game Total(Local)': 10,
      'MTT Total(Local)': 20,
      'SNG Total(Local)': 30,
      'SPIN Total(Local)': 40,
      'TLT Total(Local)': 50,
    }]);
    const map = parseStatisticsBreakdown(rows);
    expect(map['2002'].total).toBe(150);
  });

  it('null/vazio retorna {}', () => {
    expect(parseStatisticsBreakdown(null)).toEqual({});
    expect(parseStatisticsBreakdown([])).toEqual({});
  });

  it('sem header retorna {}', () => {
    expect(parseStatisticsBreakdown([['Name', 'Value']])).toEqual({});
  });

  it('pula Player ID "none"', () => {
    const rows = makeStatsRows([{ 'Player ID': 'none' }, { 'Player ID': '1001' }]);
    const map = parseStatisticsBreakdown(rows);
    expect(map['none']).toBeUndefined();
    expect(map['1001']).toBeDefined();
  });

  it('multiplos jogadores', () => {
    const rows = makeStatsRows([
      { 'Player ID': '1001', 'Ring Game Total(Local)': 10 },
      { 'Player ID': '1002', 'Ring Game Total(Local)': 20 },
    ]);
    const map = parseStatisticsBreakdown(rows);
    expect(Object.keys(map)).toHaveLength(2);
  });
});
