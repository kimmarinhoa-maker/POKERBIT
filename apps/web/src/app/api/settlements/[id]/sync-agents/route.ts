// ══════════════════════════════════════════════════════════════════════
//  POST /api/settlements/:id/sync-agents — Auto-cria orgs AGENT
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { normName } from '@/lib/server/normName';
import { batchExecute } from '@/lib/server/batch';

const uuidParam = z.string().uuid();

/** Calcula rb_value_brl e resultado_brl de um jogador a partir de winnings, rake e rbRate */
function calcPlayerResultado(winnings: number, rake: number, rbRate: number) {
  const rbValue = Math.round(((rake * rbRate) / 100 + Number.EPSILON) * 100) / 100;
  const resultado = Math.round(((winnings + rbValue) + Number.EPSILON) * 100) / 100;
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

        // Buscar settlement + club_id
        const { data: settlement, error: sErr } = await supabaseAdmin
          .from('settlements')
          .select('id, club_id')
          .eq('id', settlementId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (sErr || !settlement) {
          return NextResponse.json(
            { success: false, error: 'Settlement nao encontrado' },
            { status: 404 },
          );
        }

        // Buscar TODOS agent_week_metrics deste settlement (inclui subclub_name)
        const { data: allMetrics, error: mErr } = await supabaseAdmin
          .from('agent_week_metrics')
          .select('id, agent_name, agent_id, subclub_name')
          .eq('settlement_id', settlementId);

        if (mErr) throw mErr;
        if (!allMetrics || allMetrics.length === 0) {
          return NextResponse.json({
            success: true,
            data: { created: 0, fixed: 0, linked: 0, message: 'Nenhum metric encontrado' },
          });
        }

        // Buscar orgs SUBCLUB do tenant para mapear nome -> id
        const { data: subclubOrgs } = await supabaseAdmin
          .from('organizations')
          .select('id, name')
          .eq('tenant_id', ctx.tenantId)
          .eq('type', 'SUBCLUB')
          .eq('is_active', true);

        const subclubNameMap = new Map<string, string>();
        for (const sc of subclubOrgs || []) {
          subclubNameMap.set(normName(sc.name), sc.id);
        }

        // Buscar orgs AGENT existentes do tenant
        const { data: existingOrgs } = await supabaseAdmin
          .from('organizations')
          .select('id, name, parent_id')
          .eq('tenant_id', ctx.tenantId)
          .eq('type', 'AGENT')
          .eq('is_active', true);

        // Key: normName(name) + '|' + parent_id -> org.id (scoped to subclub)
        const orgNameParentMap = new Map<string, string>();
        // Fallback: normName(name) -> org.id (first found)
        const orgNameMap = new Map<string, string>();
        const orgParentMap = new Map<string, string>(); // orgId -> current parent_id
        for (const org of existingOrgs || []) {
          orgNameParentMap.set(normName(org.name) + '|' + org.parent_id, org.id);
          if (!orgNameMap.has(normName(org.name))) {
            orgNameMap.set(normName(org.name), org.id);
          }
          orgParentMap.set(org.id, org.parent_id);
        }

        // Mapear agente -> subclub_name (pegar do primeiro metric encontrado)
        const agentSubclubMap = new Map<string, string>();
        for (const m of allMetrics) {
          if (m.subclub_name && !agentSubclubMap.has(m.agent_name)) {
            agentSubclubMap.set(m.agent_name, m.subclub_name);
          }
        }

        let created = 0;
        let fixed = 0;
        let linked = 0;
        const uniqueNames = [...new Set(allMetrics.map((m) => m.agent_name))];

        // -- Fase 1: Classificar agentes em "existentes" vs "a criar" --
        const toCreate: { agentName: string; correctParentId: string }[] = [];
        const toFixParent: { orgId: string; correctParentId: string }[] = [];
        const resolvedOrgMap = new Map<string, string>();

        for (const agentName of uniqueNames) {
          const subclubName = agentSubclubMap.get(agentName);
          const correctParentId =
            (subclubName && subclubNameMap.get(normName(subclubName))) || settlement.club_id;

          const orgId =
            orgNameParentMap.get(normName(agentName) + '|' + correctParentId) ||
            orgNameMap.get(normName(agentName));

          if (orgId) {
            resolvedOrgMap.set(agentName, orgId);
            const currentParent = orgParentMap.get(orgId);
            if (
              currentParent &&
              currentParent !== correctParentId &&
              correctParentId !== settlement.club_id
            ) {
              toFixParent.push({ orgId, correctParentId });
            }
          } else {
            toCreate.push({ agentName, correctParentId });
          }
        }

        // -- Fase 2: Batch insert novas orgs AGENT --
        if (toCreate.length > 0) {
          const insertRows = toCreate.map(({ agentName, correctParentId }) => ({
            tenant_id: ctx.tenantId,
            parent_id: correctParentId,
            type: 'AGENT' as const,
            name: agentName,
          }));

          const { data: newOrgs, error: batchErr } = await supabaseAdmin
            .from('organizations')
            .insert(insertRows)
            .select('id, name');

          if (batchErr) {
            // Batch insert falhou — fallback individual
            const { data: refreshedOrgs } = await supabaseAdmin
              .from('organizations')
              .select('id, name')
              .eq('tenant_id', ctx.tenantId)
              .eq('type', 'AGENT')
              .eq('is_active', true);

            const refreshedMap = new Map<string, string>();
            for (const org of refreshedOrgs || []) {
              refreshedMap.set(normName(org.name), org.id);
            }

            for (const { agentName, correctParentId } of toCreate) {
              let orgId = refreshedMap.get(normName(agentName));
              if (orgId) {
                resolvedOrgMap.set(agentName, orgId);
                continue;
              }
              const { data: newOrg, error: cErr } = await supabaseAdmin
                .from('organizations')
                .insert({
                  tenant_id: ctx.tenantId,
                  parent_id: correctParentId,
                  type: 'AGENT',
                  name: agentName,
                })
                .select('id')
                .single();

              if (cErr) {
                const { data: found } = await supabaseAdmin
                  .from('organizations')
                  .select('id')
                  .eq('tenant_id', ctx.tenantId)
                  .eq('name', agentName)
                  .eq('type', 'AGENT')
                  .maybeSingle();
                orgId = found?.id;
                if (!orgId) {
                  console.warn(
                    `[sync-agents] Falha ao criar/encontrar org para agente "${agentName}": ${cErr.message}`,
                  );
                } else {
                  resolvedOrgMap.set(agentName, orgId);
                }
              } else {
                resolvedOrgMap.set(agentName, newOrg.id);
                created++;
              }
            }
          } else {
            for (const org of newOrgs || []) {
              resolvedOrgMap.set(org.name, org.id);
            }
            created = newOrgs?.length || 0;
          }
        }

        // -- Fase 3: Batch fix parent_id (paralelo) --
        if (toFixParent.length > 0) {
          const results = await Promise.allSettled(
            toFixParent.map(({ orgId, correctParentId }) =>
              supabaseAdmin
                .from('organizations')
                .update({ parent_id: correctParentId })
                .eq('id', orgId),
            ),
          );
          fixed = results.filter((r) => r.status === 'fulfilled').length;
          const failures = results.filter((r) => r.status === 'rejected');
          if (failures.length > 0) {
            console.warn(
              `[sync-agents] Phase 3: ${failures.length}/${toFixParent.length} parent_id updates failed`,
            );
          }
        }

        // -- Fase 4: Batch link metrics + fix subclub_id (paralelo) --
        const allPromises: Promise<any>[] = [];
        const processedSubclubNames = new Set<string>();

        for (const agentName of uniqueNames) {
          const orgId = resolvedOrgMap.get(agentName);
          const subclubName = agentSubclubMap.get(agentName);
          const correctParentId =
            (subclubName && subclubNameMap.get(normName(subclubName))) || settlement.club_id;

          if (orgId) {
            allPromises.push(
              Promise.resolve(
                supabaseAdmin
                  .from('agent_week_metrics')
                  .update({ agent_id: orgId })
                  .eq('settlement_id', settlementId)
                  .eq('agent_name', agentName)
                  .is('agent_id', null)
                  .select('id'),
              ).then(({ data: updated }) => {
                linked += updated?.length || 0;
              }),
            );
          }

          if (correctParentId !== settlement.club_id) {
            allPromises.push(
              Promise.resolve(
                supabaseAdmin
                  .from('agent_week_metrics')
                  .update({ subclub_id: correctParentId })
                  .eq('settlement_id', settlementId)
                  .eq('agent_name', agentName)
                  .is('subclub_id', null),
              ),
            );
            if (subclubName && !processedSubclubNames.has(subclubName)) {
              processedSubclubNames.add(subclubName);
              allPromises.push(
                Promise.resolve(
                  supabaseAdmin
                    .from('player_week_metrics')
                    .update({ subclub_id: correctParentId })
                    .eq('settlement_id', settlementId)
                    .eq('subclub_name', subclubName)
                    .is('subclub_id', null),
                ),
              );
            }
          }
        }

        let phase4Errors = 0;
        const checked = allPromises.map((p) =>
          p
            .then((result: any) => {
              if (result?.error) {
                phase4Errors++;
                console.warn('[sync-agents] Phase 4 error:', result.error);
              }
            })
            .catch((err: any) => {
              phase4Errors++;
              console.warn('[sync-agents] Phase 4 exception:', err);
            }),
        );
        await Promise.all(checked);

        // -- Fase 5: Auto-populate rates from global defaults --
        let ratesPopulated = 0;
        try {
          const today = new Date().toISOString().split('T')[0];

          // 5a: Agent rates
          const { data: defaultAgentRates } = await supabaseAdmin
            .from('agent_rb_rates')
            .select('agent_id, rate')
            .eq('tenant_id', ctx.tenantId)
            .lte('effective_from', today)
            .or(`effective_to.is.null,effective_to.gte.${today}`);

          if (defaultAgentRates && defaultAgentRates.length > 0) {
            const agentRateMap = new Map<string, number>();
            for (const r of defaultAgentRates) {
              agentRateMap.set(r.agent_id, r.rate);
            }

            const { data: metricsToUpdate } = await supabaseAdmin
              .from('agent_week_metrics')
              .select('id, agent_id, rake_total_brl, rb_rate')
              .eq('settlement_id', settlementId)
              .not('agent_id', 'is', null);

            if (metricsToUpdate) {
              const agentUpdates = metricsToUpdate
                .filter((m) => !(m.rb_rate && Number(m.rb_rate) > 0))
                .filter((m) => {
                  const defaultRate = agentRateMap.get(m.agent_id);
                  return defaultRate != null && defaultRate > 0;
                })
                .map((m) => ({ m, defaultRate: agentRateMap.get(m.agent_id)! }));

              const { ok } = await batchExecute(agentUpdates, async ({ m, defaultRate }) => {
                const rakeTotal = Number(m.rake_total_brl) || 0;
                const commission =
                  Math.round(((rakeTotal * defaultRate) / 100 + Number.EPSILON) * 100) / 100;
                await supabaseAdmin
                  .from('agent_week_metrics')
                  .update({ rb_rate: defaultRate, commission_brl: commission })
                  .eq('id', m.id)
                  .eq('tenant_id', ctx.tenantId);
              });
              ratesPopulated += ok;
            }
          }

          // 5b: Player rates
          const { data: defaultPlayerRates } = await supabaseAdmin
            .from('player_rb_rates')
            .select('player_id, rate')
            .eq('tenant_id', ctx.tenantId)
            .lte('effective_from', today)
            .or(`effective_to.is.null,effective_to.gte.${today}`);

          if (defaultPlayerRates && defaultPlayerRates.length > 0) {
            const playerRateMap = new Map<string, number>();
            for (const r of defaultPlayerRates) {
              playerRateMap.set(r.player_id, r.rate);
            }

            const { data: playerMetrics } = await supabaseAdmin
              .from('player_week_metrics')
              .select('id, player_id, rake_total_brl, winnings_brl, rb_rate')
              .eq('settlement_id', settlementId);

            if (playerMetrics) {
              const playerUpdates = playerMetrics
                .filter((pm) => !(pm.rb_rate && Number(pm.rb_rate) > 0))
                .filter((pm) => {
                  const defaultRate = playerRateMap.get(pm.player_id);
                  return defaultRate != null && defaultRate > 0;
                })
                .map((pm) => ({ pm, defaultRate: playerRateMap.get(pm.player_id)! }));

              const { ok } = await batchExecute(playerUpdates, async ({ pm, defaultRate }) => {
                const rake = Number(pm.rake_total_brl) || 0;
                const winnings = Number(pm.winnings_brl) || 0;
                const { rbValue, resultado } = calcPlayerResultado(winnings, rake, defaultRate);
                await supabaseAdmin
                  .from('player_week_metrics')
                  .update({
                    rb_rate: defaultRate,
                    rb_value_brl: rbValue,
                    resultado_brl: resultado,
                  })
                  .eq('id', pm.id)
                  .eq('tenant_id', ctx.tenantId);
              });
              ratesPopulated += ok;
            }
          }

          // 5c: Propagate agent rates to players without individual rate
          const { data: agentMetricsForRates } = await supabaseAdmin
            .from('agent_week_metrics')
            .select('agent_id, agent_name, rb_rate')
            .eq('settlement_id', settlementId)
            .gt('rb_rate', 0);

          if (agentMetricsForRates && agentMetricsForRates.length > 0) {
            const agentNameRateMap = new Map<string, number>();
            const agentIdRateMap = new Map<string, number>();
            for (const am of agentMetricsForRates) {
              if (am.agent_name) agentNameRateMap.set(am.agent_name, Number(am.rb_rate));
              if (am.agent_id) agentIdRateMap.set(am.agent_id, Number(am.rb_rate));
            }

            const { data: playersNoRate } = await supabaseAdmin
              .from('player_week_metrics')
              .select('id, agent_id, agent_name, rake_total_brl, winnings_brl, rb_rate')
              .eq('settlement_id', settlementId)
              .or('rb_rate.eq.0,rb_rate.is.null');

            if (playersNoRate) {
              const propagateItems = playersNoRate
                .map((pm) => {
                  const agentRate =
                    (pm.agent_id && agentIdRateMap.get(pm.agent_id)) ||
                    agentNameRateMap.get(pm.agent_name || '') ||
                    0;
                  return { pm, agentRate };
                })
                .filter(({ agentRate }) => agentRate > 0);

              const { ok } = await batchExecute(propagateItems, async ({ pm, agentRate }) => {
                const rake = Number(pm.rake_total_brl) || 0;
                const winnings = Number(pm.winnings_brl) || 0;
                const { rbValue, resultado } = calcPlayerResultado(winnings, rake, agentRate);
                await supabaseAdmin
                  .from('player_week_metrics')
                  .update({
                    rb_rate: agentRate,
                    rb_value_brl: rbValue,
                    resultado_brl: resultado,
                  })
                  .eq('id', pm.id)
                  .eq('tenant_id', ctx.tenantId);
              });
              ratesPopulated += ok;
            }
          }
        } catch (rateErr) {
          console.warn('[sync-agents] Phase 5 (rate auto-populate) error:', rateErr);
        }

        return NextResponse.json({
          success: true,
          data: { created, fixed, linked, ratesPopulated, phase4Errors },
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['page:overview'] },
  );
}
