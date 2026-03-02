// ══════════════════════════════════════════════════════════════════════
//  POST /api/settlements/:id/sync-rates — Sync persistent rates
//
//  Always applies current rates from agent_rb_rates/player_rb_rates
//  (Cadastro is source of truth)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { normName } from '@/lib/server/normName';
import { batchExecute } from '@/lib/server/batch';
import { logAudit } from '@/lib/server/audit';

const uuidParam = z.string().uuid();

function calcPlayerResultado(winnings: number, rake: number, rbRate: number) {
  const rbValue = Math.round(((rake * rbRate) / 100 + Number.EPSILON) * 100) / 100;
  const resultado = Math.round((winnings + rbValue + Number.EPSILON) * 100) / 100;
  return { rbValue, resultado };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: settlementId } = await params;

        const idParsed = uuidParam.safeParse(settlementId);
        if (!idParsed.success) {
          return NextResponse.json(
            { success: false, error: 'ID invalido' },
            { status: 400 },
          );
        }

        // Only DRAFT settlements
        const { data: settlement, error: sErr } = await supabaseAdmin
          .from('settlements')
          .select('status')
          .eq('id', settlementId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (sErr || !settlement) {
          return NextResponse.json(
            { success: false, error: 'Settlement nao encontrado' },
            { status: 404 },
          );
        }
        if (settlement.status !== 'DRAFT') {
          return NextResponse.json({
            success: true,
            data: { agentsUpdated: 0, playersUpdated: 0 },
          });
        }

        let agentsUpdated = 0;
        let playersUpdated = 0;

        // ── Sync agent rates (batched) ─────────────────────────────────
        const { data: agentMetrics } = await supabaseAdmin
          .from('agent_week_metrics')
          .select('id, agent_id, agent_name, rb_rate, rake_total_brl')
          .eq('settlement_id', settlementId)
          .eq('tenant_id', ctx.tenantId);

        if (agentMetrics && agentMetrics.length > 0) {
          // Fetch current active agent rates (effective_to IS NULL = current rate)
          const { data: agentRates } = await supabaseAdmin
            .from('agent_rb_rates')
            .select('agent_id, rate')
            .eq('tenant_id', ctx.tenantId)
            .is('effective_to', null);

          const agentRateMap = new Map<string, number>();
          for (const r of agentRates || []) {
            agentRateMap.set(r.agent_id, Number(r.rate));
          }

          // Build name→orgId map for agents without agent_id
          const { data: agentOrgs } = await supabaseAdmin
            .from('organizations')
            .select('id, name')
            .eq('tenant_id', ctx.tenantId)
            .eq('type', 'AGENT')
            .eq('is_active', true);

          const nameToOrgId = new Map<string, string>();
          for (const org of agentOrgs || []) {
            nameToOrgId.set(normName(org.name), org.id);
          }

          // Collect items needing update
          const agentUpdates = agentMetrics
            .map((m) => {
              const orgId = m.agent_id || nameToOrgId.get(normName(m.agent_name || ''));
              if (!orgId) return null;
              const persistentRate = agentRateMap.get(orgId);
              if (persistentRate == null || persistentRate < 0) return null;
              if (Number(m.rb_rate) === persistentRate) return null;
              return { m, persistentRate };
            })
            .filter(Boolean) as { m: any; persistentRate: number }[];

          const { ok } = await batchExecute(agentUpdates, async ({ m, persistentRate }) => {
            const rake = Number(m.rake_total_brl) || 0;
            const commission = Math.round(((rake * persistentRate) / 100 + Number.EPSILON) * 100) / 100;
            await supabaseAdmin
              .from('agent_week_metrics')
              .update({ rb_rate: persistentRate, commission_brl: commission })
              .eq('id', m.id)
              .eq('tenant_id', ctx.tenantId);
          });
          agentsUpdated = ok;
        }

        // ── Sync player rates (batched) ────────────────────────────────
        const { data: playerMetrics } = await supabaseAdmin
          .from('player_week_metrics')
          .select('id, player_id, agent_id, agent_name, rb_rate, rake_total_brl, winnings_brl')
          .eq('settlement_id', settlementId)
          .eq('tenant_id', ctx.tenantId);

        if (playerMetrics && playerMetrics.length > 0) {
          const playerIds = playerMetrics
            .filter((m) => m.player_id)
            .map((m) => m.player_id);

          // Fetch current active player rates (effective_to IS NULL = current rate)
          const playerRateMap = new Map<string, number>();
          if (playerIds.length > 0) {
            const { data: playerRates } = await supabaseAdmin
              .from('player_rb_rates')
              .select('player_id, rate')
              .eq('tenant_id', ctx.tenantId)
              .in('player_id', playerIds)
              .is('effective_to', null);

            for (const r of playerRates || []) {
              if (!playerRateMap.has(r.player_id)) {
                playerRateMap.set(r.player_id, Number(r.rate));
              }
            }
          }

          // Build agent rate map from already-synced agent_week_metrics
          const { data: syncedAgentMetrics } = await supabaseAdmin
            .from('agent_week_metrics')
            .select('agent_id, agent_name, rb_rate')
            .eq('settlement_id', settlementId)
            .eq('tenant_id', ctx.tenantId)
            .gt('rb_rate', 0);

          const agentIdRateMap = new Map<string, number>();
          const agentNameRateMap = new Map<string, number>();
          for (const am of syncedAgentMetrics || []) {
            if (am.agent_id) agentIdRateMap.set(am.agent_id, Number(am.rb_rate));
            if (am.agent_name) agentNameRateMap.set(am.agent_name, Number(am.rb_rate));
          }

          // Collect items needing update
          const playerUpdates = playerMetrics
            .map((m) => {
              let targetRate: number | undefined;
              if (m.player_id && playerRateMap.has(m.player_id)) {
                targetRate = playerRateMap.get(m.player_id);
              } else {
                targetRate =
                  (m.agent_id && agentIdRateMap.get(m.agent_id)) ||
                  agentNameRateMap.get(m.agent_name || '') ||
                  undefined;
              }
              if (targetRate == null || targetRate < 0) return null;
              if (Number(m.rb_rate) === targetRate) return null;
              return { m, targetRate };
            })
            .filter(Boolean) as { m: any; targetRate: number }[];

          const { ok } = await batchExecute(playerUpdates, async ({ m, targetRate }) => {
            const rake = Number(m.rake_total_brl) || 0;
            const winnings = Number(m.winnings_brl) || 0;
            const { rbValue, resultado } = calcPlayerResultado(winnings, rake, targetRate);
            await supabaseAdmin
              .from('player_week_metrics')
              .update({ rb_rate: targetRate, rb_value_brl: rbValue, resultado_brl: resultado })
              .eq('id', m.id)
              .eq('tenant_id', ctx.tenantId);
          });
          playersUpdated = ok;
        }

        logAudit(req, ctx, 'UPDATE', 'settlement', settlementId, undefined, {
          agentsUpdated,
          playersUpdated,
        });

        return NextResponse.json({
          success: true,
          data: { agentsUpdated, playersUpdated },
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['page:overview'] },
  );
}
