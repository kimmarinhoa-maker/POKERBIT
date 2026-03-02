import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { cacheGet, cacheSet } from '@/lib/server/cache';
import { CASH_MODALITIES, TOURNAMENT_MODALITIES } from '@/components/dashboard/modalityColors';

// ── Types ──────────────────────────────────────────────────────────

/** Nested format (new imports with Statistics sheet) */
interface NestedBreakdown {
  rake?: Record<string, number>;
  winnings?: Record<string, number>;
  hands?: Record<string, number>;
  // Legacy flat fields may also be present
  [key: string]: unknown;
}

interface NormalizedBreakdown {
  rake: Record<string, number>;
  winnings: Record<string, number>;
  hands: Record<string, number>;
}

interface ModalityResponse {
  rakeByModality: Record<string, number>;
  winningsByModality: Record<string, number>;
  handsByModality: Record<string, number>;
  topPlayersByRake: Array<{
    name: string;
    rake: number;
    mainModality: string;
    hands: number;
  }>;
  cashVsTournament: {
    cash: { rake: number; players: number; hands: number; pct: number };
    tournament: { rake: number; players: number; hands: number; pct: number };
  };
  activePlayers: {
    thisWeek: number;
    lastWeek: number | null;
    new: number | null;
  };
  modalityEvolution: Array<Record<string, unknown>>;
}

// ── Known modality keys (filter out legacy fields like ringGame, tlt, total) ──
const KNOWN_MODALITIES = new Set([
  'nlh', 'plo4', 'plo5', 'plo6', 'mixgame', 'ofc', 'mtt', 'sng', 'spin',
]);

// ── Helpers ─────────────────────────────────────────────────────────

function addToMap(map: Record<string, number>, key: string, value: number) {
  if (!KNOWN_MODALITIES.has(key)) return; // skip legacy keys like ringGame, tlt, total
  map[key] = (map[key] || 0) + value;
}

function sumModalities(map: Record<string, number>, mods: readonly string[]): number {
  return mods.reduce((sum, m) => sum + (map[m] || 0), 0);
}

/**
 * Normalize rake_breakdown — handles BOTH formats:
 * - Nested: { rake: { nlh: X }, winnings: { nlh: Y }, hands: { nlh: Z, total: N } }
 * - Legacy flat: { ringGame: X, mtt: Y, sng: Z, spin: W, tlt: V, total: T }
 */
function normalizeBreakdown(raw: unknown): NormalizedBreakdown {
  const obj: NestedBreakdown =
    typeof raw === 'string' ? JSON.parse(raw) : (raw as NestedBreakdown) || {};

  // Check if nested format exists (has .rake sub-object that IS an object)
  if (obj.rake && typeof obj.rake === 'object' && !Array.isArray(obj.rake)) {
    return {
      rake: obj.rake as Record<string, number>,
      winnings: (obj.winnings && typeof obj.winnings === 'object' ? obj.winnings : {}) as Record<string, number>,
      hands: (obj.hands && typeof obj.hands === 'object' ? obj.hands : {}) as Record<string, number>,
    };
  }

  // Legacy flat format: top-level numeric keys are rake values
  // Map what we can: mtt, sng, spin are directly mappable; ringGame is ambiguous
  const rake: Record<string, number> = {};
  const winnings: Record<string, number> = {};
  const hands: Record<string, number> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'number' && val > 0 && KNOWN_MODALITIES.has(key)) {
      rake[key] = val;
    }
  }

  return { rake, winnings, hands };
}

function countPlayersWithModality(
  rows: Array<{ rb: NormalizedBreakdown }>,
  mods: readonly string[],
): number {
  const set = new Set(mods);
  return rows.filter((r) => {
    return Object.keys(r.rb.rake).some((k) => set.has(k) && r.rb.rake[k] > 0);
  }).length;
}

// ── Route Handler ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const settlementId = url.searchParams.get('settlement_id');
      const subclubId = url.searchParams.get('subclub_id') || undefined;

      if (!settlementId) {
        return NextResponse.json(
          { success: false, error: 'settlement_id obrigatorio' },
          { status: 400 },
        );
      }

      // Cache check (include subclub in key)
      const cacheKey = `modalities:${ctx.tenantId}:${settlementId}:${subclubId || 'all'}`;
      const cached = cacheGet<ModalityResponse>(cacheKey);
      if (cached) {
        return NextResponse.json({ success: true, data: cached });
      }

      // 1. Fetch player metrics with rake_breakdown
      let query = supabaseAdmin
        .from('player_week_metrics')
        .select('nickname, rake_total_brl, rake_breakdown, hands')
        .eq('settlement_id', settlementId)
        .eq('tenant_id', ctx.tenantId)
        .not('rake_breakdown', 'is', null);

      if (subclubId) {
        query = query.eq('subclub_id', subclubId);
      }

      const { data: rows, error } = await query;

      if (error) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(error) },
          { status: 500 },
        );
      }

      // Filter out rows with empty breakdown
      const validRows = (rows || []).filter((r) => {
        const rb = r.rake_breakdown;
        if (!rb || (typeof rb === 'object' && Object.keys(rb).length === 0)) return false;
        return true;
      });

      if (validRows.length === 0) {
        return NextResponse.json({ success: true, data: null });
      }

      // 2. Aggregate JSONB data
      const rakeByModality: Record<string, number> = {};
      const winningsByModality: Record<string, number> = {};
      const handsByModality: Record<string, number> = {};

      const parsedRows: Array<{
        nickname: string;
        rakeTotal: number;
        rb: NormalizedBreakdown;
        totalHands: number;
      }> = [];

      for (const row of validRows) {
        const rb = normalizeBreakdown(row.rake_breakdown);

        for (const [mod, val] of Object.entries(rb.rake)) {
          addToMap(rakeByModality, mod, val);
        }
        for (const [mod, val] of Object.entries(rb.winnings)) {
          addToMap(winningsByModality, mod, val);
        }
        for (const [mod, val] of Object.entries(rb.hands)) {
          addToMap(handsByModality, mod, val);
        }

        // Hands: prefer rb.hands.total, then sum of modality hands, then top-level column
        const handsTotal =
          (rb.hands as Record<string, number>)['total'] ||
          Object.values(rb.hands).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) ||
          Number(row.hands || 0);

        parsedRows.push({
          nickname: row.nickname,
          rakeTotal: Number(row.rake_total_brl || 0),
          rb,
          totalHands: handsTotal,
        });
      }

      // Check if we actually have modality data (not all zeros)
      const hasModalityData = Object.values(rakeByModality).some((v) => v > 0);
      if (!hasModalityData) {
        return NextResponse.json({ success: true, data: null });
      }

      // 3. Top 10 players by rake
      const topPlayersByRake = parsedRows
        .sort((a, b) => b.rakeTotal - a.rakeTotal)
        .slice(0, 10)
        .map((p) => {
          // Find main modality (highest rake)
          let mainMod = '';
          let maxRake = 0;
          for (const [mod, val] of Object.entries(p.rb.rake)) {
            if (KNOWN_MODALITIES.has(mod) && val > maxRake) {
              maxRake = val;
              mainMod = mod;
            }
          }
          return {
            name: p.nickname,
            rake: p.rakeTotal,
            mainModality: mainMod,
            hands: p.totalHands,
          };
        });

      // 4. Cash vs Tournament
      const cashRake = sumModalities(rakeByModality, CASH_MODALITIES);
      const tournamentRake = sumModalities(rakeByModality, TOURNAMENT_MODALITIES);
      const totalRake = cashRake + tournamentRake;
      const cashPlayers = countPlayersWithModality(parsedRows, CASH_MODALITIES);
      const tournamentPlayers = countPlayersWithModality(parsedRows, TOURNAMENT_MODALITIES);
      const cashHands = sumModalities(handsByModality, CASH_MODALITIES);
      const tournamentHands = sumModalities(handsByModality, TOURNAMENT_MODALITIES);

      const cashVsTournament = {
        cash: {
          rake: cashRake,
          players: cashPlayers,
          hands: cashHands,
          pct: totalRake > 0 ? Math.round((cashRake / totalRake) * 100) : 0,
        },
        tournament: {
          rake: tournamentRake,
          players: tournamentPlayers,
          hands: tournamentHands,
          pct: totalRake > 0 ? Math.round((tournamentRake / totalRake) * 100) : 0,
        },
      };

      // 5. Active players — get previous settlement for comparison
      const thisWeekCount = validRows.length;

      const { data: currentSettlement } = await supabaseAdmin
        .from('settlements')
        .select('week_start')
        .eq('id', settlementId)
        .single();

      let lastWeekCount: number | null = null;
      let newPlayersCount: number | null = null;

      if (currentSettlement) {
        const { data: prevSettlements } = await supabaseAdmin
          .from('settlements')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .lt('week_start', currentSettlement.week_start)
          .order('week_start', { ascending: false })
          .limit(1);

        if (prevSettlements && prevSettlements.length > 0) {
          const prevId = prevSettlements[0].id;

          let prevQuery = supabaseAdmin
            .from('player_week_metrics')
            .select('id', { count: 'exact', head: true })
            .eq('settlement_id', prevId)
            .eq('tenant_id', ctx.tenantId);
          if (subclubId) prevQuery = prevQuery.eq('subclub_id', subclubId);

          const { count: prevCount } = await prevQuery;
          lastWeekCount = prevCount ?? null;

          let prevNickQuery = supabaseAdmin
            .from('player_week_metrics')
            .select('nickname')
            .eq('settlement_id', prevId)
            .eq('tenant_id', ctx.tenantId);
          if (subclubId) prevNickQuery = prevNickQuery.eq('subclub_id', subclubId);

          const { data: prevNicknames } = await prevNickQuery;
          if (prevNicknames) {
            const prevSet = new Set(prevNicknames.map((p) => p.nickname));
            newPlayersCount = validRows.filter((r) => !prevSet.has(r.nickname)).length;
          }
        }
      }

      const activePlayers = {
        thisWeek: thisWeekCount,
        lastWeek: lastWeekCount,
        new: newPlayersCount,
      };

      // 6. Modality evolution — last 8 settlements
      const modalityEvolution: Array<Record<string, unknown>> = [];

      const { data: recentSettlements } = await supabaseAdmin
        .from('settlements')
        .select('id, week_start')
        .eq('tenant_id', ctx.tenantId)
        .order('week_start', { ascending: false })
        .limit(8);

      if (recentSettlements && recentSettlements.length >= 2) {
        const ordered = [...recentSettlements].reverse();

        for (const s of ordered) {
          let weekQuery = supabaseAdmin
            .from('player_week_metrics')
            .select('rake_breakdown')
            .eq('settlement_id', s.id)
            .eq('tenant_id', ctx.tenantId)
            .not('rake_breakdown', 'is', null);
          if (subclubId) weekQuery = weekQuery.eq('subclub_id', subclubId);

          const { data: weekRows } = await weekQuery;

          const weekRake: Record<string, number> = {};
          for (const wr of weekRows || []) {
            const rb = normalizeBreakdown(wr.rake_breakdown);
            for (const [mod, val] of Object.entries(rb.rake)) {
              addToMap(weekRake, mod, val);
            }
          }

          const [, m, d] = s.week_start.split('-');
          modalityEvolution.push({
            weekStart: s.week_start,
            label: `${d}/${m}`,
            ...weekRake,
          });
        }
      }

      const result: ModalityResponse = {
        rakeByModality,
        winningsByModality,
        handsByModality,
        topPlayersByRake,
        cashVsTournament,
        activePlayers,
        modalityEvolution,
      };

      cacheSet(cacheKey, result, 120_000);

      return NextResponse.json({ success: true, data: result });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
