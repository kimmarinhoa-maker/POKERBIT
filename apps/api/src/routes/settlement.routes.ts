// ══════════════════════════════════════════════════════════════════════
//  Rotas de Settlement — Consulta, finalização, void
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { settlementService } from '../services/settlement.service';

const router = Router();

// ─── GET /api/settlements — Listar semanas ─────────────────────────
router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const clubId = req.query.club_id as string | undefined;
      const startDate = req.query.start_date as string | undefined;
      const endDate = req.query.end_date as string | undefined;

      const data = await settlementService.listWeeks(tenantId, clubId, startDate, endDate);

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/settlements/:id — Detalhe básico (compatibilidade) ────
router.get(
  '/:id',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
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
  }
);

// ─── GET /api/settlements/:id/full — Breakdown por subclube ─────────
// Coração da paridade funcional: retorna tudo agrupado por subclube
// com fees, adjustments, acertoLiga e dashboardTotals
router.get(
  '/:id/full',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const data = await settlementService.getSettlementWithSubclubs(
        tenantId,
        req.params.id,
        req.allowedSubclubIds
      );

      if (!data) {
        res.status(404).json({ success: false, error: 'Settlement não encontrado' });
        return;
      }

      res.json({ success: true, data });
    } catch (err: any) {
      console.error('[settlement/full]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/settlements/:id/notes — Atualizar notas ─────────────
router.patch(
  '/:id/notes',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { notes } = req.body;

      if (notes !== null && typeof notes !== 'string') {
        res.status(400).json({ success: false, error: 'Campo "notes" deve ser string ou null' });
        return;
      }

      const { data, error } = await (await import('../config/supabase')).supabaseAdmin
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
  }
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

      const data = await settlementService.finalizeSettlement(
        tenantId,
        req.params.id,
        req.userId!
      );

      res.json({ success: true, data });
    } catch (err: any) {
      const status = err.message.includes('não pode') ? 422 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/settlements/:id/agents/:agentId/payment-type ────────
// Altera o tipo de pagamento (fiado/avista) de um agente no settlement
router.patch(
  '/:id/agents/:agentId/payment-type',
  requireAuth,
  requireTenant,
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
      const { data: settlement, error: sErr } = await (await import('../config/supabase')).supabaseAdmin
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
      const { data, error } = await (await import('../config/supabase')).supabaseAdmin
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
  }
);

// ─── POST /api/settlements/:id/sync-agents ──────────────────────────
// Auto-cria organizacoes AGENT a partir dos agentes do settlement
router.post(
  '/:id/sync-agents',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const settlementId = req.params.id;
      const { supabaseAdmin } = await import('../config/supabase');

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

      // Buscar todos agent_week_metrics sem agent_id
      const { data: metrics, error: mErr } = await supabaseAdmin
        .from('agent_week_metrics')
        .select('id, agent_name, agent_id')
        .eq('settlement_id', settlementId)
        .is('agent_id', null);

      if (mErr) throw mErr;
      if (!metrics || metrics.length === 0) {
        res.json({ success: true, data: { created: 0, message: 'Todos agentes ja vinculados' } });
        return;
      }

      // Buscar orgs AGENT existentes do tenant
      const { data: existingOrgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('type', 'AGENT')
        .eq('is_active', true);

      const orgNameMap = new Map<string, string>();
      for (const org of (existingOrgs || [])) {
        orgNameMap.set(org.name.toLowerCase(), org.id);
      }

      let created = 0;
      const uniqueNames = [...new Set(metrics.map(m => m.agent_name))];

      for (const agentName of uniqueNames) {
        let orgId = orgNameMap.get(agentName.toLowerCase());

        // Criar org AGENT se nao existe
        if (!orgId) {
          const { data: newOrg, error: cErr } = await supabaseAdmin
            .from('organizations')
            .insert({
              tenant_id: tenantId,
              parent_id: settlement.club_id,
              type: 'AGENT',
              name: agentName,
            })
            .select('id')
            .single();

          if (cErr) {
            // Pode ser duplicata (race condition) — tentar buscar
            const { data: found } = await supabaseAdmin
              .from('organizations')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('name', agentName)
              .eq('type', 'AGENT')
              .single();
            orgId = found?.id;
          } else {
            orgId = newOrg.id;
            created++;
          }
        }

        // Vincular metrics ao org
        if (orgId) {
          await supabaseAdmin
            .from('agent_week_metrics')
            .update({ agent_id: orgId })
            .eq('settlement_id', settlementId)
            .eq('agent_name', agentName)
            .is('agent_id', null);
        }
      }

      res.json({ success: true, data: { created, linked: uniqueNames.length } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/settlements/:id/agents/:agentId/rb-rate ─────────────
// Atualiza rb_rate diretamente no agent_week_metrics (sem exigir org)
router.patch(
  '/:id/agents/:agentId/rb-rate',
  requireAuth,
  requireTenant,
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
      const { supabaseAdmin } = await import('../config/supabase');

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
      const commission_brl = Math.round((rakeTotal * rb_rate / 100 + Number.EPSILON) * 100) / 100;

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
  }
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

      const data = await settlementService.voidSettlement(
        tenantId,
        req.params.id,
        req.userId!,
        reason
      );

      res.json({ success: true, data });
    } catch (err: any) {
      const status = err.message.includes('Apenas') ? 422 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }
);

export default router;
