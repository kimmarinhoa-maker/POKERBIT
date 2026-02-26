// ══════════════════════════════════════════════════════════════════════
//  Rotas de Settlement — Consulta, finalização, void
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { settlementService } from '../services/settlement.service';
import { supabaseAdmin } from '../config/supabase';
import { normName } from '../utils/normName';

const router = Router();

// ─── GET /api/settlements — Listar semanas ─────────────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const clubId = req.query.club_id as string | undefined;
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const data = await settlementService.listWeeks(tenantId, clubId, startDate, endDate);
    const total = data.length;
    const paged = data.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: paged,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
  } catch (err: any) {
    console.error('[settlement/full]', err);
    res.status(500).json({ success: false, error: err.message });
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
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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
    } catch (err: any) {
      const status = err.message.includes('não pode') ? 422 : 500;
      res.status(status).json({ success: false, error: err.message });
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
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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

      for (const agentName of uniqueNames) {
        let orgId = orgNameMap.get(normName(agentName));

        // Determinar parent_id correto (SUBCLUB, fallback CLUB)
        const subclubName = agentSubclubMap.get(agentName);
        const correctParentId = (subclubName && subclubNameMap.get(normName(subclubName))) || settlement.club_id;

        // Criar org AGENT se nao existe (upsert seguro contra race condition)
        if (!orgId) {
          // Primeiro tenta buscar (pode ter sido criado por request concorrente)
          const { data: existing } = await supabaseAdmin
            .from('organizations')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('name', agentName)
            .eq('type', 'AGENT')
            .maybeSingle();

          if (existing) {
            orgId = existing.id;
          } else {
            const { data: newOrg, error: cErr } = await supabaseAdmin
              .from('organizations')
              .insert({
                tenant_id: tenantId,
                parent_id: correctParentId,
                type: 'AGENT',
                name: agentName,
              })
              .select('id')
              .single();

            if (cErr) {
              // Race condition: criado entre o select e o insert — buscar novamente
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
              }
            } else {
              orgId = newOrg.id;
              created++;
            }
          }
        } else {
          // Agente ja existe — corrigir parent_id se estiver apontando errado
          const currentParent = orgParentMap.get(orgId);
          if (currentParent && currentParent !== correctParentId && correctParentId !== settlement.club_id) {
            await supabaseAdmin.from('organizations').update({ parent_id: correctParentId }).eq('id', orgId);
            fixed++;
          }
        }

        // Vincular metrics sem agent_id
        if (orgId) {
          const { data: updated } = await supabaseAdmin
            .from('agent_week_metrics')
            .update({ agent_id: orgId })
            .eq('settlement_id', settlementId)
            .eq('agent_name', agentName)
            .is('agent_id', null)
            .select('id');
          linked += updated?.length || 0;
        }

        // Corrigir subclub_id em agent_week_metrics que tem subclub_name mas nao tem subclub_id
        if (correctParentId !== settlement.club_id) {
          await supabaseAdmin
            .from('agent_week_metrics')
            .update({ subclub_id: correctParentId })
            .eq('settlement_id', settlementId)
            .eq('agent_name', agentName)
            .is('subclub_id', null);
          // Tambem corrigir player_week_metrics com mesmo subclub_name
          if (subclubName) {
            await supabaseAdmin
              .from('player_week_metrics')
              .update({ subclub_id: correctParentId })
              .eq('settlement_id', settlementId)
              .eq('subclub_name', subclubName)
              .is('subclub_id', null);
          }
        }
      }

      res.json({ success: true, data: { created, fixed, linked } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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
        .select('id, rake_total_brl')
        .eq('settlement_id', settlementId)
        .eq('id', agentId)
        .single();

      if (mErr || !metric) {
        res.status(404).json({ success: false, error: 'Agente não encontrado neste settlement' });
        return;
      }

      const rakeTotal = Number(metric.rake_total_brl) || 0;
      const commission_brl = Math.round(((rakeTotal * rb_rate) / 100 + Number.EPSILON) * 100) / 100;

      // Atualizar rb_rate e commission_brl
      const { data, error } = await supabaseAdmin
        .from('agent_week_metrics')
        .update({ rb_rate, commission_brl })
        .eq('id', agentId)
        .eq('settlement_id', settlementId)
        .select()
        .single();

      if (error) throw error;

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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
    } catch (err: any) {
      const status = err.message.includes('Apenas') ? 422 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  },
);

export default router;
