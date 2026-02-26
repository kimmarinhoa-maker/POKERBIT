// ══════════════════════════════════════════════════════════════════════
//  Rotas de Settlement — Consulta, finalização, void
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { settlementService } from '../services/settlement.service';
import { supabaseAdmin } from '../config/supabase';
import { normName } from '../utils/normName';
import { safeErrorMessage, AppError } from '../utils/apiError';

const router = Router();

/** Calcula rb_value_brl e resultado_brl de um jogador a partir de winnings, rake e rbRate */
function calcPlayerResultado(winnings: number, rake: number, rbRate: number) {
  const rbValue = Math.round(((rake * rbRate) / 100 + Number.EPSILON) * 100) / 100;
  const resultado = Math.round(((winnings + rbValue) + Number.EPSILON) * 100) / 100;
  return { rbValue, resultado };
}

// ─── GET /api/settlements — Listar semanas ─────────────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const clubId = req.query.club_id as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if ((startDate && !dateRe.test(startDate)) || (endDate && !dateRe.test(endDate))) {
      res.status(400).json({ success: false, error: 'Formato de data invalido (YYYY-MM-DD)' });
      return;
    }

    const { data, total } = await settlementService.listWeeks(tenantId, clubId, startDate, endDate, page, limit);

    res.json({
      success: true,
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/settlements/:id — Detalhe básico (compatibilidade) ────
router.get('/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const detail = await settlementService.getSettlementDetail(tenantId, req.params.id);

    if (!detail) {
      res.status(404).json({ success: false, error: 'Settlement não encontrado' });
      return;
    }

    res.json({ success: true, data: detail });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/settlements/:id/full — Breakdown por subclube ─────────
// Coração da paridade funcional: retorna tudo agrupado por subclube
// com fees, adjustments, acertoLiga e dashboardTotals
router.get('/:id/full', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const data = await settlementService.getSettlementWithSubclubs(tenantId, req.params.id, req.allowedSubclubIds);

    if (!data) {
      res.status(404).json({ success: false, error: 'Settlement não encontrado' });
      return;
    }

    res.json({ success: true, data });
  } catch (err: unknown) {
    console.error('[settlement/full]', err);
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PATCH /api/settlements/:id/notes — Atualizar notas ─────────────
router.patch(
  '/:id/notes',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { notes } = req.body;

      if (notes !== null && typeof notes !== 'string') {
        res.status(400).json({ success: false, error: 'Campo "notes" deve ser string ou null' });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from('settlements')
        .update({ notes: notes || null })
        .eq('id', req.params.id)
        .eq('tenant_id', tenantId)
        .select('id, notes')
        .single();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ success: false, error: 'Settlement não encontrado' });
        return;
      }

      res.json({ success: true, data });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── POST /api/settlements/:id/finalize — DRAFT → FINAL ───────────
router.post(
  '/:id/finalize',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;

      const data = await settlementService.finalizeSettlement(tenantId, req.params.id, req.userId!);

      res.json({ success: true, data });
    } catch (err: unknown) {
      const status = err instanceof AppError ? err.statusCode : 500;
      const msg = safeErrorMessage(err);
      res.status(status).json({ success: false, error: msg });
    }
  },
);

// ─── PATCH /api/settlements/:id/agents/:agentId/payment-type ────────
// Altera o tipo de pagamento (fiado/avista) de um agente no settlement
router.patch(
  '/:id/agents/:agentId/payment-type',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { id: settlementId, agentId } = req.params;
      const { payment_type } = req.body;

      // Validar payment_type
      if (!payment_type || !['fiado', 'avista'].includes(payment_type)) {
        res.status(400).json({
          success: false,
          error: 'Campo "payment_type" deve ser "fiado" ou "avista"',
        });
        return;
      }

      // Verificar se settlement existe e está em DRAFT
      const { data: settlement, error: sErr } = await supabaseAdmin
        .from('settlements')
        .select('status')
        .eq('id', settlementId)
        .eq('tenant_id', tenantId)
        .single();

      if (sErr || !settlement) {
        res.status(404).json({ success: false, error: 'Settlement não encontrado' });
        return;
      }

      if (settlement.status !== 'DRAFT') {
        res.status(422).json({
          success: false,
          error: 'Apenas settlements DRAFT podem ser editados',
        });
        return;
      }

      // Atualizar payment_type no agent_week_metrics
      const { data, error } = await supabaseAdmin
        .from('agent_week_metrics')
        .update({ payment_type })
        .eq('settlement_id', settlementId)
        .eq('id', agentId)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        res.status(404).json({ success: false, error: 'Agente não encontrado neste settlement' });
        return;
      }

      res.json({ success: true, data });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── POST /api/settlements/:id/sync-agents ──────────────────────────
// Auto-cria organizacoes AGENT a partir dos agentes do settlement
router.post(
  '/:id/sync-agents',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const settlementId = req.params.id;

      // Buscar settlement + club_id
      const { data: settlement, error: sErr } = await supabaseAdmin
        .from('settlements')
        .select('id, club_id')
        .eq('id', settlementId)
        .eq('tenant_id', tenantId)
        .single();

      if (sErr || !settlement) {
        res.status(404).json({ success: false, error: 'Settlement nao encontrado' });
        return;
      }

      // Buscar TODOS agent_week_metrics deste settlement (inclui subclub_name)
      const { data: allMetrics, error: mErr } = await supabaseAdmin
        .from('agent_week_metrics')
        .select('id, agent_name, agent_id, subclub_name')
        .eq('settlement_id', settlementId);

      if (mErr) throw mErr;
      if (!allMetrics || allMetrics.length === 0) {
        res.json({ success: true, data: { created: 0, fixed: 0, linked: 0, message: 'Nenhum metric encontrado' } });
        return;
      }

      // Buscar orgs SUBCLUB do tenant para mapear nome -> id
      const { data: subclubOrgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .eq('tenant_id', tenantId)
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
        .eq('tenant_id', tenantId)
        .eq('type', 'AGENT')
        .eq('is_active', true);

      const orgNameMap = new Map<string, string>();
      const orgParentMap = new Map<string, string>(); // orgId -> current parent_id
      for (const org of existingOrgs || []) {
        orgNameMap.set(normName(org.name), org.id);
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

      // ── Fase 1: Classificar agentes em "existentes" vs "a criar" ──────
      const toCreate: { agentName: string; correctParentId: string }[] = [];
      const toFixParent: { orgId: string; correctParentId: string }[] = [];
      // agentName -> orgId (sera populado para todos)
      const resolvedOrgMap = new Map<string, string>();

      for (const agentName of uniqueNames) {
        const orgId = orgNameMap.get(normName(agentName));
        const subclubName = agentSubclubMap.get(agentName);
        const correctParentId = (subclubName && subclubNameMap.get(normName(subclubName))) || settlement.club_id;

        if (orgId) {
          resolvedOrgMap.set(agentName, orgId);
          // Verificar se parent_id precisa correcao
          const currentParent = orgParentMap.get(orgId);
          if (currentParent && currentParent !== correctParentId && correctParentId !== settlement.club_id) {
            toFixParent.push({ orgId, correctParentId });
          }
        } else {
          toCreate.push({ agentName, correctParentId });
        }
      }

      // ── Fase 2: Batch insert novas orgs AGENT ────────────────────────
      if (toCreate.length > 0) {
        const insertRows = toCreate.map(({ agentName, correctParentId }) => ({
          tenant_id: tenantId,
          parent_id: correctParentId,
          type: 'AGENT' as const,
          name: agentName,
        }));

        const { data: newOrgs, error: batchErr } = await supabaseAdmin
          .from('organizations')
          .insert(insertRows)
          .select('id, name');

        if (batchErr) {
          // Batch insert falhou (possivelmente duplicatas por race condition)
          // Fallback: buscar todos AGENT orgs novamente e resolver
          const { data: refreshedOrgs } = await supabaseAdmin
            .from('organizations')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .eq('type', 'AGENT')
            .eq('is_active', true);

          const refreshedMap = new Map<string, string>();
          for (const org of refreshedOrgs || []) {
            refreshedMap.set(normName(org.name), org.id);
          }

          // Tentar inserir individualmente apenas os que ainda nao existem
          for (const { agentName, correctParentId } of toCreate) {
            let orgId = refreshedMap.get(normName(agentName));
            if (orgId) {
              resolvedOrgMap.set(agentName, orgId);
              continue;
            }
            // Insert individual como fallback
            const { data: newOrg, error: cErr } = await supabaseAdmin
              .from('organizations')
              .insert({ tenant_id: tenantId, parent_id: correctParentId, type: 'AGENT', name: agentName })
              .select('id')
              .single();

            if (cErr) {
              const { data: found } = await supabaseAdmin
                .from('organizations')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('name', agentName)
                .eq('type', 'AGENT')
                .maybeSingle();
              orgId = found?.id;
              if (!orgId) {
                console.warn(`[sync-agents] Falha ao criar/encontrar org para agente "${agentName}": ${cErr.message}`);
              } else {
                resolvedOrgMap.set(agentName, orgId);
              }
            } else {
              resolvedOrgMap.set(agentName, newOrg.id);
              created++;
            }
          }
        } else {
          // Batch insert OK — mapear resultados
          for (const org of newOrgs || []) {
            resolvedOrgMap.set(org.name, org.id);
          }
          created = newOrgs?.length || 0;
        }
      }

      // ── Fase 3: Batch fix parent_id (paralelo) ──────────────────────
      if (toFixParent.length > 0) {
        await Promise.all(
          toFixParent.map(({ orgId, correctParentId }) =>
            supabaseAdmin.from('organizations').update({ parent_id: correctParentId }).eq('id', orgId),
          ),
        );
        fixed = toFixParent.length;
      }

      // ── Fase 4: Batch link metrics + fix subclub_id (paralelo) ──────
      const allPromises: Promise<any>[] = [];
      const processedSubclubNames = new Set<string>();

      for (const agentName of uniqueNames) {
        const orgId = resolvedOrgMap.get(agentName);
        const subclubName = agentSubclubMap.get(agentName);
        const correctParentId = (subclubName && subclubNameMap.get(normName(subclubName))) || settlement.club_id;

        // Vincular metrics sem agent_id
        if (orgId) {
          const linkP = supabaseAdmin
            .from('agent_week_metrics')
            .update({ agent_id: orgId })
            .eq('settlement_id', settlementId)
            .eq('agent_name', agentName)
            .is('agent_id', null)
            .select('id');
          allPromises.push(
            Promise.resolve(linkP).then(({ data: updated }) => {
              linked += updated?.length || 0;
            }),
          );
        }

        // Corrigir subclub_id em metrics (agent + player)
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
          // player_week_metrics: fix once per subclub_name (avoid duplicate updates)
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
        p.then((result: any) => {
          if (result?.error) {
            phase4Errors++;
            console.warn('[sync-agents] Phase 4 error:', result.error);
          }
        }).catch((err: any) => {
          phase4Errors++;
          console.warn('[sync-agents] Phase 4 exception:', err);
        }),
      );
      await Promise.all(checked);

      // ── Fase 5: Auto-populate rates from global defaults ────────────
      let ratesPopulated = 0;
      try {
        const today = new Date().toISOString().split('T')[0];

        // 5a: Agent rates — fetch default rates from agent_rb_rates
        const { data: defaultAgentRates } = await supabaseAdmin
          .from('agent_rb_rates')
          .select('agent_id, rate')
          .eq('tenant_id', tenantId)
          .lte('effective_from', today)
          .or(`effective_to.is.null,effective_to.gte.${today}`);

        if (defaultAgentRates && defaultAgentRates.length > 0) {
          const agentRateMap = new Map<string, number>();
          for (const r of defaultAgentRates) {
            agentRateMap.set(r.agent_id, r.rate);
          }

          // Fetch agent_week_metrics that have rb_rate = 0 or null AND have an agent_id
          const { data: metricsToUpdate } = await supabaseAdmin
            .from('agent_week_metrics')
            .select('id, agent_id, rake_total_brl, rb_rate')
            .eq('settlement_id', settlementId)
            .not('agent_id', 'is', null);

          if (metricsToUpdate) {
            for (const m of metricsToUpdate) {
              if (m.rb_rate && Number(m.rb_rate) > 0) continue; // Already has a rate set
              const defaultRate = agentRateMap.get(m.agent_id);
              if (defaultRate != null && defaultRate > 0) {
                const rakeTotal = Number(m.rake_total_brl) || 0;
                const commission = Math.round(((rakeTotal * defaultRate) / 100 + Number.EPSILON) * 100) / 100;
                await supabaseAdmin
                  .from('agent_week_metrics')
                  .update({ rb_rate: defaultRate, commission_brl: commission })
                  .eq('id', m.id);
                ratesPopulated++;
              }
            }
          }
        }

        // 5b: Player rates — fetch default rates from player_rb_rates
        const { data: defaultPlayerRates } = await supabaseAdmin
          .from('player_rb_rates')
          .select('player_id, rate')
          .eq('tenant_id', tenantId)
          .lte('effective_from', today)
          .or(`effective_to.is.null,effective_to.gte.${today}`);

        if (defaultPlayerRates && defaultPlayerRates.length > 0) {
          const playerRateMap = new Map<string, number>();
          for (const r of defaultPlayerRates) {
            playerRateMap.set(r.player_id, r.rate);
          }

          // Fetch player_week_metrics that have rb_rate = 0 or null
          const { data: playerMetrics } = await supabaseAdmin
            .from('player_week_metrics')
            .select('id, player_id, rake_total_brl, winnings_brl, rb_rate')
            .eq('settlement_id', settlementId);

          if (playerMetrics) {
            for (const pm of playerMetrics) {
              if (pm.rb_rate && Number(pm.rb_rate) > 0) continue; // Already has a rate
              const defaultRate = playerRateMap.get(pm.player_id);
              if (defaultRate != null && defaultRate > 0) {
                const rake = Number(pm.rake_total_brl) || 0;
                const winnings = Number(pm.winnings_brl) || 0;
                const { rbValue, resultado } = calcPlayerResultado(winnings, rake, defaultRate);
                await supabaseAdmin
                  .from('player_week_metrics')
                  .update({ rb_rate: defaultRate, rb_value_brl: rbValue, resultado_brl: resultado })
                  .eq('id', pm.id);
                ratesPopulated++;
              }
            }
          }
        }
        // 5c: Propagate agent rates to players without individual rate
        // Build agent_id -> rb_rate map from agent_week_metrics (already updated in 5a)
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

          // Fetch players that still have rb_rate = 0
          const { data: playersNoRate } = await supabaseAdmin
            .from('player_week_metrics')
            .select('id, agent_id, agent_name, rake_total_brl, winnings_brl, rb_rate')
            .eq('settlement_id', settlementId)
            .or('rb_rate.eq.0,rb_rate.is.null');

          if (playersNoRate) {
            for (const pm of playersNoRate) {
              // Try to find agent rate by agent_id first, then by agent_name
              const agentRate = (pm.agent_id && agentIdRateMap.get(pm.agent_id))
                || agentNameRateMap.get(pm.agent_name || '') || 0;
              if (agentRate > 0) {
                const rake = Number(pm.rake_total_brl) || 0;
                const winnings = Number(pm.winnings_brl) || 0;
                const { rbValue, resultado } = calcPlayerResultado(winnings, rake, agentRate);
                await supabaseAdmin
                  .from('player_week_metrics')
                  .update({ rb_rate: agentRate, rb_value_brl: rbValue, resultado_brl: resultado })
                  .eq('id', pm.id);
                ratesPopulated++;
              }
            }
          }
        }
      } catch (rateErr) {
        // Non-critical: log but don't fail the sync
        console.warn('[sync-agents] Phase 5 (rate auto-populate) error:', rateErr);
      }

      res.json({ success: true, data: { created, fixed, linked, ratesPopulated, phase4Errors } });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── PATCH /api/settlements/:id/agents/:agentId/rb-rate ─────────────
// Atualiza rb_rate diretamente no agent_week_metrics (sem exigir org)
router.patch(
  '/:id/agents/:agentId/rb-rate',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { id: settlementId, agentId } = req.params;
      const { rb_rate } = req.body;

      if (rb_rate == null || rb_rate < 0 || rb_rate > 100) {
        res.status(400).json({
          success: false,
          error: 'rb_rate deve ser entre 0 e 100',
        });
        return;
      }

      // Verificar se settlement existe e está em DRAFT
      const { data: settlement, error: sErr } = await supabaseAdmin
        .from('settlements')
        .select('status')
        .eq('id', settlementId)
        .eq('tenant_id', tenantId)
        .single();

      if (sErr || !settlement) {
        res.status(404).json({ success: false, error: 'Settlement não encontrado' });
        return;
      }

      if (settlement.status !== 'DRAFT') {
        res.status(422).json({
          success: false,
          error: 'Apenas settlements DRAFT podem ser editados',
        });
        return;
      }

      // Buscar agent metric para recalcular commission
      const { data: metric, error: mErr } = await supabaseAdmin
        .from('agent_week_metrics')
        .select('id, agent_id, agent_name, rake_total_brl')
        .eq('settlement_id', settlementId)
        .eq('id', agentId)
        .single();

      if (mErr || !metric) {
        res.status(404).json({ success: false, error: 'Agente não encontrado neste settlement' });
        return;
      }

      const rakeTotal = Number(metric.rake_total_brl) || 0;
      const commission_brl = Math.round(((rakeTotal * rb_rate) / 100 + Number.EPSILON) * 100) / 100;

      // Atualizar rb_rate e commission_brl no snapshot
      const { data, error } = await supabaseAdmin
        .from('agent_week_metrics')
        .update({ rb_rate, commission_brl })
        .eq('id', agentId)
        .eq('settlement_id', settlementId)
        .select()
        .single();

      if (error) throw error;

      // Also persist rate to agent_rb_rates (non-blocking)
      const orgId = metric.agent_id || await (async () => {
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('type', 'AGENT')
          .eq('name', metric.agent_name)
          .eq('is_active', true)
          .limit(1)
          .single();
        return org?.id || null;
      })();

      if (orgId) {
        try {
          const today = new Date().toISOString().split('T')[0];
          await supabaseAdmin
            .from('agent_rb_rates')
            .update({ effective_to: today })
            .eq('tenant_id', tenantId)
            .eq('agent_id', orgId)
            .is('effective_to', null);

          await supabaseAdmin.from('agent_rb_rates').insert({
            tenant_id: tenantId,
            agent_id: orgId,
            rate: rb_rate,
            effective_from: today,
            created_by: req.userId,
          });
        } catch (persistErr) {
          console.warn('[rb-rate] Failed to persist agent rate:', persistErr);
        }
      }

      // ── Propagate agent rate to player_week_metrics ──────────────
      let playersPropagated = 0;
      try {
        // Fetch players of this agent in this settlement
        const { data: agentPlayers } = await supabaseAdmin
          .from('player_week_metrics')
          .select('id, player_id, rake_total_brl, winnings_brl')
          .eq('settlement_id', settlementId)
          .eq('agent_name', metric.agent_name);

        if (agentPlayers && agentPlayers.length > 0) {
          // Find players with individual rates (skip those)
          const playerIds = agentPlayers.filter((p) => p.player_id).map((p) => p.player_id);
          const playerIndividualRates = new Set<string>();
          if (playerIds.length > 0) {
            const { data: individualRates } = await supabaseAdmin
              .from('player_rb_rates')
              .select('player_id')
              .eq('tenant_id', tenantId)
              .in('player_id', playerIds)
              .is('effective_to', null);
            for (const r of individualRates || []) {
              playerIndividualRates.add(r.player_id);
            }
          }

          for (const pm of agentPlayers) {
            // Skip players with individual persistent rate
            if (pm.player_id && playerIndividualRates.has(pm.player_id)) continue;

            const rake = Number(pm.rake_total_brl) || 0;
            const winnings = Number(pm.winnings_brl) || 0;
            const { rbValue, resultado } = calcPlayerResultado(winnings, rake, rb_rate);

            await supabaseAdmin
              .from('player_week_metrics')
              .update({ rb_rate, rb_value_brl: rbValue, resultado_brl: resultado })
              .eq('id', pm.id);
            playersPropagated++;
          }
        }
      } catch (propErr) {
        console.warn('[rb-rate] Failed to propagate to players:', propErr);
      }

      res.json({ success: true, data, playersPropagated });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── POST /api/settlements/:id/sync-rates — Sync persistent rates ──
// Always applies current rates from agent_rb_rates/player_rb_rates (Cadastro is source of truth)
router.post(
  '/:id/sync-rates',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const settlementId = req.params.id;

      // Only DRAFT settlements
      const { data: settlement, error: sErr } = await supabaseAdmin
        .from('settlements')
        .select('status')
        .eq('id', settlementId)
        .eq('tenant_id', tenantId)
        .single();

      if (sErr || !settlement) {
        res.status(404).json({ success: false, error: 'Settlement nao encontrado' });
        return;
      }
      if (settlement.status !== 'DRAFT') {
        res.json({ success: true, data: { agentsUpdated: 0, playersUpdated: 0 } });
        return;
      }

      let agentsUpdated = 0;
      let playersUpdated = 0;

      // ── Sync agent rates ──────────────────────────────────────────
      const { data: agentMetrics } = await supabaseAdmin
        .from('agent_week_metrics')
        .select('id, agent_id, agent_name, rb_rate, rake_total_brl')
        .eq('settlement_id', settlementId)
        .eq('tenant_id', tenantId);

      if (agentMetrics && agentMetrics.length > 0) {
        // Fetch current active agent rates (effective_to IS NULL = current rate)
        const { data: agentRates } = await supabaseAdmin
          .from('agent_rb_rates')
          .select('agent_id, rate')
          .eq('tenant_id', tenantId)
          .is('effective_to', null);

        const agentRateMap = new Map<string, number>();
        for (const r of agentRates || []) {
          agentRateMap.set(r.agent_id, Number(r.rate));
        }

        // Build name→orgId map for agents without agent_id
        const { data: agentOrgs } = await supabaseAdmin
          .from('organizations')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('type', 'AGENT')
          .eq('is_active', true);

        const nameToOrgId = new Map<string, string>();
        for (const org of agentOrgs || []) {
          nameToOrgId.set(org.name.toLowerCase(), org.id);
        }

        for (const m of agentMetrics) {
          const orgId = m.agent_id || nameToOrgId.get((m.agent_name || '').toLowerCase());
          if (!orgId) continue;
          const persistentRate = agentRateMap.get(orgId);
          if (persistentRate == null || persistentRate < 0) continue;

          // Skip if rate is already the same
          if (Number(m.rb_rate) === persistentRate) continue;

          const rake = Number(m.rake_total_brl) || 0;
          const commission = Math.round(((rake * persistentRate) / 100 + Number.EPSILON) * 100) / 100;

          await supabaseAdmin
            .from('agent_week_metrics')
            .update({ rb_rate: persistentRate, commission_brl: commission })
            .eq('id', m.id);
          agentsUpdated++;
        }
      }

      // ── Sync player rates ─────────────────────────────────────────
      const { data: playerMetrics } = await supabaseAdmin
        .from('player_week_metrics')
        .select('id, player_id, agent_id, agent_name, rb_rate, rake_total_brl, winnings_brl')
        .eq('settlement_id', settlementId)
        .eq('tenant_id', tenantId);

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
            .eq('tenant_id', tenantId)
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
          .eq('tenant_id', tenantId)
          .gt('rb_rate', 0);

        const agentIdRateMap = new Map<string, number>();
        const agentNameRateMap = new Map<string, number>();
        for (const am of syncedAgentMetrics || []) {
          if (am.agent_id) agentIdRateMap.set(am.agent_id, Number(am.rb_rate));
          if (am.agent_name) agentNameRateMap.set(am.agent_name, Number(am.rb_rate));
        }

        for (const m of playerMetrics) {
          // First try player-specific rate, then fall back to agent rate
          let targetRate: number | undefined;

          if (m.player_id && playerRateMap.has(m.player_id)) {
            targetRate = playerRateMap.get(m.player_id);
          } else {
            // Fall back to agent rate
            targetRate = (m.agent_id && agentIdRateMap.get(m.agent_id))
              || agentNameRateMap.get(m.agent_name || '') || undefined;
          }

          if (targetRate == null || targetRate < 0) continue;

          // Skip if rate is already the same
          if (Number(m.rb_rate) === targetRate) continue;

          const rake = Number(m.rake_total_brl) || 0;
          const winnings = Number(m.winnings_brl) || 0;
          const { rbValue, resultado } = calcPlayerResultado(winnings, rake, targetRate);

          await supabaseAdmin
            .from('player_week_metrics')
            .update({ rb_rate: targetRate, rb_value_brl: rbValue, resultado_brl: resultado })
            .eq('id', m.id);
          playersUpdated++;
        }
      }

      res.json({ success: true, data: { agentsUpdated, playersUpdated } });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── POST /api/settlements/:id/void — FINAL → VOID ────────────────
router.post(
  '/:id/void',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { reason } = req.body;

      if (!reason || typeof reason !== 'string') {
        res.status(400).json({ success: false, error: 'Campo "reason" obrigatório' });
        return;
      }

      const data = await settlementService.voidSettlement(tenantId, req.params.id, req.userId!, reason);

      res.json({ success: true, data });
    } catch (err: unknown) {
      const status = err instanceof AppError ? err.statusCode : 500;
      const msg = safeErrorMessage(err);
      res.status(status).json({ success: false, error: msg });
    }
  },
);

export default router;
