import { describe, it, expect } from 'vitest';
import { resolveSubclube, parseWorkbook, validateReadiness } from '../coreSuprema.js';
import { makeWorkbook, makeConfig } from './fixtures.js';

// ─── resolveSubclube ─────────────────────────────────────────────────
describe('resolveSubclube', () => {
  const emptyConfig = makeConfig();

  // Priority 1: Override por agentId
  it('override por agentId tem prioridade maxima', () => {
    const config = makeConfig({
      agentOverrides: { 'AG01': { subclube: 'OVERRIDE_CLUB' } },
      manualLinks: { 'AMS TEST': 'MANUAL_CLUB' },
    });
    expect(resolveSubclube('AMS Test', 'AG01', config)).toBe('OVERRIDE_CLUB');
  });

  // Priority 2: Manual links
  it('manual link por agentName (uppercase)', () => {
    const config = makeConfig({
      manualLinks: { 'CUSTOM AGENT': 'CUSTOM_CLUB' },
    });
    expect(resolveSubclube('Custom Agent', 'AG99', config)).toBe('CUSTOM_CLUB');
  });

  // Priority 3: Prefix rules (default)
  it('AMS → IMPERIO (default prefix)', () => {
    expect(resolveSubclube('AMS Test', 'AG01', emptyConfig)).toBe('IMPERIO');
  });

  it('TW → IMPERIO (default prefix)', () => {
    expect(resolveSubclube('TW Agent', 'AG02', emptyConfig)).toBe('IMPERIO');
  });

  it('BB → IMPERIO (default prefix)', () => {
    expect(resolveSubclube('BB Player', 'AG03', emptyConfig)).toBe('IMPERIO');
  });

  it('TGP → TGP (default prefix)', () => {
    expect(resolveSubclube('TGP Agent', 'AG04', emptyConfig)).toBe('TGP');
  });

  it('CONFRA → CONFRARIA (default prefix)', () => {
    expect(resolveSubclube('CONFRA test', 'AG05', emptyConfig)).toBe('CONFRARIA');
  });

  it('3BET → 3BET (default prefix)', () => {
    expect(resolveSubclube('3BET agent', 'AG06', emptyConfig)).toBe('3BET');
  });

  it('CH → CH (default prefix)', () => {
    expect(resolveSubclube('CH agent', 'AG07', emptyConfig)).toBe('CH');
  });

  // Custom prefix rules
  it('custom prefixRules override defaults', () => {
    const config = makeConfig({
      prefixRules: [{ prefixes: ['XYZ'], clube: 'NEW_CLUB' }],
    });
    // AMS NAO bate mais (custom rules substituem defaults)
    expect(resolveSubclube('AMS Test', 'AG01', config)).not.toBe('IMPERIO');
    expect(resolveSubclube('XYZ Test', 'AG01', config)).toBe('NEW_CLUB');
  });

  // Priority 4: Fallback TGP search
  it('nome com TGP no meio → TGP (fallback)', () => {
    expect(resolveSubclube('Random TGP Agent', 'AG08', emptyConfig)).toBe('TGP');
  });

  // Priority 5: Unknown
  it('nome desconhecido → "?"', () => {
    expect(resolveSubclube('Unknown Agent', 'AG09', emptyConfig)).toBe('?');
  });

  it('null/vazio → "?"', () => {
    expect(resolveSubclube(null, 'AG10', emptyConfig)).toBe('?');
    expect(resolveSubclube('', 'AG11', emptyConfig)).toBe('?');
  });

  it('"NONE" → "?"', () => {
    expect(resolveSubclube('NONE', 'AG12', emptyConfig)).toBe('?');
  });

  it('strip "AG. " prefix before matching', () => {
    expect(resolveSubclube('AG. AMS Test', 'AG13', emptyConfig)).toBe('IMPERIO');
  });
});

// ─── parseWorkbook ───────────────────────────────────────────────────
describe('parseWorkbook', () => {
  it('parse basico: 1 jogador ok', () => {
    const wb = makeWorkbook([{
      'Player ID': '1001',
      'nickName': 'Hero',
      'Agent ID': 'AG01',
      'Agent Name': 'AMS Test',
      'Winnings': 100,
      'Total Fee': 50,
    }]);
    const result = parseWorkbook(wb);
    expect(result.error).toBeUndefined();
    expect(result.all).toHaveLength(1);
    expect(result.ok).toHaveLength(1);
    expect(result.ok[0].clube).toBe('IMPERIO');
    expect(result.ok[0].ganhos).toBeCloseTo(500);  // 100*5
    expect(result.ok[0].rake).toBeCloseTo(250);     // 50*5
  });

  it('sheet Resume faltando → error', () => {
    const wb = { SheetNames: ['Other'], Sheets: { Other: {} } };
    const result = parseWorkbook(wb);
    expect(result.error).toContain('Resume');
  });

  it('players com agente ignorado → status ignored', () => {
    const wb = makeWorkbook([{
      'Player ID': '1001',
      'Agent ID': 'IGNORE_ME',
      'Agent Name': 'AMS Test',
    }]);
    const config = makeConfig({ ignoredAgents: { 'IGNORE_ME': true } });
    const result = parseWorkbook(wb, config);
    expect(result.ignored).toHaveLength(1);
    expect(result.all).toHaveLength(0); // ignored nao entra em all
  });

  it('agente sem ID/nome → missing_agency', () => {
    const wb = makeWorkbook([{
      'Player ID': '1001',
      'Agent ID': '',
      'Agent Name': '',
    }]);
    const result = parseWorkbook(wb);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]._status).toBe('missing_agency');
  });

  it('playerLinks resolve missing_agency → auto_resolved', () => {
    const wb = makeWorkbook([{
      'Player ID': '1001',
      'Agent ID': '',
      'Agent Name': '',
    }]);
    const config = makeConfig({
      playerLinks: {
        '1001': { agentId: 'AG99', agentName: 'Linked Agent', subclube: 'TGP' },
      },
    });
    const result = parseWorkbook(wb, config);
    expect(result.autoResolved).toHaveLength(1);
    expect(result.autoResolved[0].clube).toBe('TGP');
  });

  it('agente desconhecido → unknown_subclub', () => {
    const wb = makeWorkbook([{
      'Player ID': '1001',
      'Agent ID': 'AG01',
      'Agent Name': 'Random Agent XYZ',
    }]);
    const result = parseWorkbook(wb);
    expect(result.unknown).toHaveLength(1);
    expect(result.unknown[0]._status).toBe('unknown_subclub');
  });

  it('duplicatas sao mergeadas', () => {
    const wb = makeWorkbook([
      { 'Player ID': '1001', 'Agent Name': 'AMS A', 'Agent ID': 'AG01', 'Winnings': 100, 'Total Fee': 50 },
      { 'Player ID': '1001', 'Agent Name': 'AMS A', 'Agent ID': 'AG01', 'Winnings': 200, 'Total Fee': 30 },
    ]);
    const result = parseWorkbook(wb);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].count).toBe(2);
    // Valores mergeados: (100+200)*5=1500
    expect(result.all).toHaveLength(1);
    expect(result.all[0].ganhos).toBeCloseTo(1500);
  });

  it('meta contém informacoes do parse', () => {
    const wb = makeWorkbook([{ 'Player ID': '1001', 'Agent Name': 'AMS X', 'Agent ID': 'AG01' }]);
    const result = parseWorkbook(wb);
    expect(result.meta).toBeDefined();
    expect(result.meta.parsed).toBe(1);
    expect(result.meta.sheets).toContain('Grand Union Member Resume');
  });

  it('Statistics sheet enriquece com rakeBreakdown', () => {
    const wb = makeWorkbook(
      [{ 'Player ID': '1001', 'Agent Name': 'AMS X', 'Agent ID': 'AG01' }],
      [{ 'Player ID': '1001', 'Ring Game Total(Local)': 30, 'MTT Total(Local)': 10 }],
    );
    const result = parseWorkbook(wb);
    expect(result.ok[0].rakeBreakdown).toBeDefined();
    expect(result.ok[0].rakeBreakdown.ringGame).toBe(30);
    expect(result.ok[0].rakeBreakdown.mtt).toBe(10);
    expect(result.meta.hasStatistics).toBe(true);
  });

  it('sem Statistics sheet: rakeBreakdown zerado', () => {
    const wb = makeWorkbook([{ 'Player ID': '1001', 'Agent Name': 'AMS X', 'Agent ID': 'AG01' }]);
    const result = parseWorkbook(wb);
    expect(result.ok[0].rakeBreakdown.total).toBe(0);
    expect(result.meta.hasStatistics).toBe(false);
  });

  it('guToBrl custom (ex: 1)', () => {
    const wb = makeWorkbook([{
      'Player ID': '1001',
      'Agent Name': 'AMS X',
      'Agent ID': 'AG01',
      'Winnings': 100,
      'Total Fee': 50,
    }]);
    const config = makeConfig({ guToBrl: 1 });
    const result = parseWorkbook(wb, config);
    expect(result.ok[0].ganhos).toBeCloseTo(100); // sem multiplicador
    expect(result.ok[0].rake).toBeCloseTo(50);
  });
});

// ─── validateReadiness ───────────────────────────────────────────────
describe('validateReadiness', () => {
  it('tudo ok → ready=true, sem blockers', () => {
    const importResult = {
      all: [{ _status: 'ok' }],
      ok: [{ _status: 'ok' }],
      missing: [],
      unknown: [],
      ignored: [],
      autoResolved: [],
    };
    const v = validateReadiness(importResult);
    expect(v.ready).toBe(true);
    expect(v.blockers).toHaveLength(0);
  });

  it('com error no parse → blocker', () => {
    const v = validateReadiness({ error: 'Aba nao encontrada' });
    expect(v.ready).toBe(false);
    expect(v.blockers[0]).toContain('Erro no parse');
  });

  it('jogadores missing → blocker', () => {
    const importResult = {
      all: [{ _status: 'missing_agency' }],
      ok: [],
      missing: [{ _status: 'missing_agency' }],
      unknown: [],
      ignored: [],
      autoResolved: [],
    };
    const v = validateReadiness(importResult);
    expect(v.ready).toBe(false);
    expect(v.blockers.some(b => b.includes('sem agência'))).toBe(true);
  });

  it('agentes unknown → blocker', () => {
    const importResult = {
      all: [{ _status: 'unknown_subclub' }],
      ok: [],
      missing: [],
      unknown: [{ _status: 'unknown_subclub' }],
      ignored: [],
      autoResolved: [],
    };
    const v = validateReadiness(importResult);
    expect(v.ready).toBe(false);
    expect(v.blockers.some(b => b.includes('subclube desconhecido'))).toBe(true);
  });

  it('summary contém contagens corretas', () => {
    const importResult = {
      all: [{}, {}],
      ok: [{}],
      missing: [],
      unknown: [],
      ignored: [{}],
      autoResolved: [{}],
    };
    const v = validateReadiness(importResult);
    expect(v.summary.total).toBe(2);
    expect(v.summary.ok).toBe(1);
    expect(v.summary.autoResolved).toBe(1);
    expect(v.summary.ignored).toBe(1);
  });
});
