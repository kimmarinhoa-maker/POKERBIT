import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { cacheGet, cacheSet } from '@/lib/server/cache';
import { CASH_MODALITIES, TOURNAMENT_MODALITIES } from '@/components/dashboard/modalityColors';

// ── Types ──────────────────────────────────────────────────────────
interface RakeBreakdown {
  rake?: Record<string, number>;
  winnings?: Record<string, number>;
  hands?: Record<string, number>;
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

// ── Helpers ─────────────────────────────────────────────────────────

function addToMap(map: Record<string, number>, key: string, value: number) {
  map[key] = (map[key] || 0) + value;
}

function sumModalities(map: Record<string, number>, mods: readonly string[]): number {
  return mods.reduce((sum, m) => sum + (map[m] || 0), 0);
}

function countPlayersWithModality(
  rows: Array<{ rb: RakeBreakdown }>,
  mods: readonly string[],
): number {
  const set = new Set(mods);
  return rows.filter((r) => {
    const rake = r.rb.rake || {};
    return Object.keys(rake).some((k) => set.has(k) && rake[k] > 0);
  }).length;
}

function sumHandsForModalities(map: Record<string, number>, mods: readonly string[]): number {
  return mods.reduce((sum, m) => sum + (map[m] || 0), 0);
}

// ── Route Handler ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const settlementId = url.searchParams.get('settlement_id');

      if (!settlementId) {
        return NextResponse.json(
          { success: false, error: 'settlement_id obrigatorio' },
          { status: 400 },
        );
      }

      // Cache check
      const cacheKey = `modalities:${ctx.tenantId}:${settlementId}`;
      const cached = cacheGet<ModalityResponse>(cacheKey);
      if (cached) {
        return NextResponse.json({ success: true, data: cached });
      }

      // 1. Fetch current settlement's player metrics with rake_breakdown
      const { data: rows, error } = await supabaseAdmin
        .from('player_week_metrics')
        .select('nickname, rake_total_brl, rake_breakdown, hands')
        .eq('settlement_id', settlementId)
        .eq('tenant_id', ctx.tenantId)
        .neq('rake_breakdown', '{}');

      if (error) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(error) },
          { status: 500 },
        );
      }

      if (!rows || rows.length === 0) {
        return NextResponse.json({ success: true, data: null });
      }

      // 2. Aggregate JSONB data
      const rakeByModality: Record<string, number> = {};
      const winningsByModality: Record<string, number> = {};
      const handsByModality: Record<string, number> = {};

      const parsedRows: Array<{
        nickname: string;
        rakeTotal: number;
        rb: RakeBreakdown;
        totalHands: number;
      }> = [];

      for (const row of rows) {
        const rb: RakeBreakdown =
          typeof row.rake_breakdown === 'string'
            ? JSON.parse(row.rake_breakdown)
            : row.rake_breakdown || {};

        const rakeMap = rb.rake || {};
        const winMap = rb.winnings || {};
        const handsMap = rb.hands || {};

        for (const [mod, val] of Object.entries(rakeMap)) {
          addToMap(rakeByModality, mod, val);
        }
        for (const [mod, val] of Object.entries(winMap)) {
          addToMap(winningsByModality, mod, val);
        }
        for (const [mod, val] of Object.entries(handsMap)) {
          addToMap(handsByModality, mod, val);
        }

        parsedRows.push({
          nickname: row.nickname,
          rakeTotal: Number(row.rake_total_brl || 0),
          rb,
          totalHands: Number(row.hands || 0),
        });
      }

      // 3. Top 10 players by rake
      const topPlayersByRake = parsedRows
        .sort((a, b) => b.rakeTotal - a.rakeTotal)
        .slice(0, 10)
        .map((p) => {
          // Find main modality (highest rake)
          const rakeMap = p.rb.rake || {};
          let mainMod = '';
          let maxRake = 0;
          for (const [mod, val] of Object.entries(rakeMap)) {
            if (val > maxRake) {
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
      const cashPlayers = countPlayersWithModality(
        parsedRows.map((r) => ({ rb: r.rb })),
        CASH_MODALITIES,
      );
      const tournamentPlayers = countPlayersWithModality(
        parsedRows.map((r) => ({ rb: r.rb })),
        TOURNAMENT_MODALITIES,
      );
      const cashHands = sumHandsForModalities(handsByModality, CASH_MODALITIES);
      const tournamentHands = sumHandsForModalities(handsByModality, TOURNAMENT_MODALITIES);

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
      const thisWeekCount = rows.length;

      // Find current settlement's week_start
      const { data: currentSettlement } = await supabaseAdmin
        .from('settlements')
        .select('week_start')
        .eq('id', settlementId)
        .single();

      let lastWeekCount: number | null = null;
      let newPlayersCount: number | null = null;

      if (currentSettlement) {
        // Find previous settlement
        const { data: prevSettlements } = await supabaseAdmin
          .from('settlements')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .lt('week_start', currentSettlement.week_start)
          .order('week_start', { ascending: false })
          .limit(1);

        if (prevSettlements && prevSettlements.length > 0) {
          const prevId = prevSettlements[0].id;

          // Count players in previous week
          const { count: prevCount } = await supabaseAdmin
            .from('player_week_metrics')
            .select('id', { count: 'exact', head: true })
            .eq('settlement_id', prevId)
            .eq('tenant_id', ctx.tenantId);

          lastWeekCount = prevCount ?? null;

          // Count NEW players (in current but not in previous)
          const { data: prevNicknames } = await supabaseAdmin
            .from('player_week_metrics')
            .select('nickname')
            .eq('settlement_id', prevId)
            .eq('tenant_id', ctx.tenantId);

          if (prevNicknames) {
            const prevSet = new Set(prevNicknames.map((p) => p.nickname));
            newPlayersCount = rows.filter((r) => !prevSet.has(r.nickname)).length;
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
        // Reverse to chronological order
        const ordered = [...recentSettlements].reverse();

        for (const s of ordered) {
          const { data: weekRows } = await supabaseAdmin
            .from('player_week_metrics')
            .select('rake_breakdown')
            .eq('settlement_id', s.id)
            .eq('tenant_id', ctx.tenantId)
            .neq('rake_breakdown', '{}');

          const weekRake: Record<string, number> = {};
          for (const wr of weekRows || []) {
            const rb: RakeBreakdown =
              typeof wr.rake_breakdown === 'string'
                ? JSON.parse(wr.rake_breakdown)
                : wr.rake_breakdown || {};
            for (const [mod, val] of Object.entries(rb.rake || {})) {
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

      // Build result
      const result: ModalityResponse = {
        rakeByModality,
        winningsByModality,
        handsByModality,
        topPlayersByRake,
        cashVsTournament,
        activePlayers,
        modalityEvolution,
      };

      // Cache for 2 minutes
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
