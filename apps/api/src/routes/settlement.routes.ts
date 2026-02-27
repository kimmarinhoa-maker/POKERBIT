// ══════════════════════════════════════════════════════════════════════
//  Rotas de Settlement — Consulta, finalização, void
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { settlementService } from '../services/settlement.service';
import { supabaseAdmin } from '../config/supabase';
import { normName } from '../utils/normName';
import { safeErrorMessage, AppError } from '../utils/apiError';
import { batchExecute } from '../utils/batch';
import { logAudit } from '../utils/audit';
import { cacheGet, cacheSet, cacheInvalidate } from '../utils/cache';

const router = Router();

// ─── Zod Schemas ────────────────────────────────────────────────────
const uuidParam = z.string().uuid();
const notesSchema = z.object({ notes: z.string().nullable() });
const rbRateSchema = z.object({
  rb_rate: z.number().min(0).max(100),
});

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

// ─── POST /api/settlements/batch-summary — Dashboard batch (lightweight) ──
// Returns only dashboardTotals for multiple settlements. Used by dashboard
// charts to avoid 12× individual /full calls.
router.post('/batch-summary', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 20) {
      res.status(400).json({ success: false, error: 'ids deve ser um array de 1-20 UUIDs' });
      return;
    }

    const data = await settlementService.getDashboardBatch(tenantId, ids);
    res.json({ success: true, data });
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
// Cache: finalized settlements are cached for 5 min
router.get('/:id/full', requireAuth, requireTenant, requirePermission('page:overview'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const settlementId = req.params.id;
    const cacheKey = `settlement:${settlementId}`;

    // Try cache first
    const cached = cacheGet<any>(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const data = await settlementService.getSettlementWithSubclubs(tenantId, settlementId, req.allowedSubclubIds);

    if (!data) {
      res.status(404).json({ success: false, error: 'Settlement não encontrado' });
      return;
    }

    // Cache only finalized settlements (5 min)
    if (data.settlement?.status === 'FINAL') {
      cacheSet(cacheKey, data, 300_000);
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
  requirePermission('page:overview'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const idParsed = uuidParam.safeParse(req.params.id);
      if (!idParsed.success) {
        res.status(400).json({ success: false, error: 'ID invalido' });
        return;
      }

      const parsed = notesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'Campo "notes" deve ser string ou null', details: parsed.error.flatten().fieldErrors });
        return;
      }

      const { notes } = parsed.data;

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

      logAudit(req, 'UPDATE', 'settlement', req.params.id, undefined, { notes });
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
      const idParsed = uuidParam.safeParse(req.params.id);
      if (!idParsed.success) {
        res.status(400).json({ success: false, error: 'ID invalido' });
        return;
      }

      const data = await settlementService.finalizeSettlement(tenantId, req.params.id, req.userId!);

      logAudit(req, 'FINALIZE', 'settlement', req.params.id);
      // Invalidate cache since status changed
      cacheInvalidate(`settlement:${req.params.id}`);
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
        .eq('tenant_id', tenantId)
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
  requirePermission('page:overview'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const settlementId = req.params.id;
      const idParsed = uuidParam.safeParse(settlementId);
      if (!idParsed.success) {
        res.status(400).json({ success: false, error: 'ID invalido' });
        return;
      }

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

      // Key: normName(name) + '|' + parent_id -> org.id (scoped to subclub)
      const orgNameParentMap = new Map<string, string>();
      // Fallback: normName(name) -> org.id (first found, for agents without clear parent)
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

      // ── Fase 1: Classificar agentes em "existentes" vs "a criar" ──────
      const toCreate: { agentName: string; correctParentId: string }[] = [];
      const toFixParent: { orgId: string; correctParentId: string }[] = [];
      // agentName -> orgId (sera populado para todos)
      const resolvedOrgMap = new Map<string, string>();

      for (const agentName of uniqueNames) {
        const subclubName = agentSubclubMap.get(agentName);
        const correctParentId = (subclubName && subclubNameMap.get(normName(subclubName))) || settlement.club_id;

        // Try exact match (name + parent) first, then fallback to name-only
        const orgId = orgNameParentMap.get(normName(agentName) + '|' + correctParentId)
          || orgNameMap.get(normName(agentName));

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
        const results = await Promise.allSettled(
          toFixParent.map(({ orgId, correctParentId }) =>
            supabaseAdmin.from('organizations').update({ parent_id: correctParentId }).eq('id', orgId),
          ),
        );
        fixed = results.filter((r) => r.status === 'fulfilled').length;
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
          console.warn(`[sync-agents] Phase 3: ${failures.length}/${toFixParent.length} parent_id updates failed`);
        }
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
            // Collect items to batch update (Phase 5a)
            const agentUpdates = metricsToUpdate
              .filter((m) => !(m.rb_rate && Number(m.rb_rate) > 0))
              .filter((m) => {
                const defaultRate = agentRateMap.get(m.agent_id);
                return defaultRate != null && defaultRate > 0;
              })
              .map((m) => ({ m, defaultRate: agentRateMap.get(m.agent_id)! }));

            const { ok } = await batchExecute(agentUpdates, async ({ m, defaultRate }) => {
              const rakeTotal = Number(m.rake_total_brl) || 0;
              const commission = Math.round(((rakeTotal * defaultRate) / 100 + Number.EPSILON) * 100) / 100;
              await supabaseAdmin
                .from('agent_week_metrics')
                .update({ rb_rate: defaultRate, commission_brl: commission })
                .eq('id', m.id)
                .eq('tenant_id', tenantId);
            });
            ratesPopulated += ok;
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
                .update({ rb_rate: defaultRate, rb_value_brl: rbValue, resultado_brl: resultado })
                .eq('id', pm.id)
                .eq('tenant_id', tenantId);
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

          // Fetch players that still have rb_rate = 0
          const { data: playersNoRate } = await supabaseAdmin
            .from('player_week_metrics')
            .select('id, agent_id, agent_name, rake_total_brl, winnings_brl, rb_rate')
            .eq('settlement_id', settlementId)
            .or('rb_rate.eq.0,rb_rate.is.null');

          if (playersNoRate) {
            const propagateItems = playersNoRate
              .map((pm) => {
                const agentRate = (pm.agent_id && agentIdRateMap.get(pm.agent_id))
                  || agentNameRateMap.get(pm.agent_name || '') || 0;
                return { pm, agentRate };
              })
              .filter(({ agentRate }) => agentRate > 0);

            const { ok } = await batchExecute(propagateItems, async ({ pm, agentRate }) => {
              const rake = Number(pm.rake_total_brl) || 0;
              const winnings = Number(pm.winnings_brl) || 0;
              const { rbValue, resultado } = calcPlayerResultado(winnings, rake, agentRate);
              await supabaseAdmin
                .from('player_week_metrics')
                .update({ rb_rate: agentRate, rb_value_brl: rbValue, resultado_brl: resultado })
                .eq('id', pm.id)
                .eq('tenant_id', tenantId);
            });
            ratesPopulated += ok;
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
  requirePermission('page:overview'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { id: settlementId, agentId } = req.params;

      const parsed = rbRateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'rb_rate deve ser entre 0 e 100', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const { rb_rate } = parsed.data;

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
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

      logAudit(req, 'UPDATE', 'agent_week_metrics', agentId, undefined, { rb_rate, commission_brl });

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

      // ── Propagate agent rate to player_week_metrics (batched) ──────
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

          const toPropagate = agentPlayers.filter(
            (pm) => !(pm.player_id && playerIndividualRates.has(pm.player_id)),
          );

          const { ok } = await batchExecute(toPropagate, async (pm) => {
            const rake = Number(pm.rake_total_brl) || 0;
            const winnings = Number(pm.winnings_brl) || 0;
            const { rbValue, resultado } = calcPlayerResultado(winnings, rake, rb_rate);
            await supabaseAdmin
              .from('player_week_metrics')
              .update({ rb_rate, rb_value_brl: rbValue, resultado_brl: resultado })
              .eq('id', pm.id)
              .eq('tenant_id', tenantId);
          });
          playersPropagated = ok;
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
  requirePermission('page:overview'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const settlementId = req.params.id;
      const idParsed = uuidParam.safeParse(settlementId);
      if (!idParsed.success) {
        res.status(400).json({ success: false, error: 'ID invalido' });
        return;
      }

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

      // ── Sync agent rates (batched) ─────────────────────────────────
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
            .eq('tenant_id', tenantId);
        });
        agentsUpdated = ok;
      }

      // ── Sync player rates (batched) ────────────────────────────────
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

        // Collect items needing update
        const playerUpdates = playerMetrics
          .map((m) => {
            let targetRate: number | undefined;
            if (m.player_id && playerRateMap.has(m.player_id)) {
              targetRate = playerRateMap.get(m.player_id);
            } else {
              targetRate = (m.agent_id && agentIdRateMap.get(m.agent_id))
                || agentNameRateMap.get(m.agent_name || '') || undefined;
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
            .eq('tenant_id', tenantId);
        });
        playersUpdated = ok;
      }

      logAudit(req, 'UPDATE', 'settlement', settlementId, undefined, { agentsUpdated, playersUpdated });
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

      logAudit(req, 'VOID', 'settlement', req.params.id, undefined, { reason });
      // Invalidate cache since status changed
      cacheInvalidate(`settlement:${req.params.id}`);
      res.json({ success: true, data });
    } catch (err: unknown) {
      const status = err instanceof AppError ? err.statusCode : 500;
      const msg = safeErrorMessage(err);
      res.status(status).json({ success: false, error: msg });
    }
  },
);

export default router;
