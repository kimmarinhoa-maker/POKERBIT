// ══════════════════════════════════════════════════════════════════════
//  Rotas de Carry-Forward — Saldo anterior entre semanas
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth';
import { carryForwardService } from '../services/carry-forward.service';

const router = Router();

// ─── GET /api/carry-forward — Ler carry-forward ─────────────────────
// Query params:
//   week_start (required): YYYY-MM-DD
//   club_id    (required): UUID do clube
//   entity_id  (optional): se fornecido, retorna só esse agente
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const weekStart = req.query.week_start as string;
    const clubId = req.query.club_id as string;
    const entityId = req.query.entity_id as string | undefined;

    if (!weekStart || !clubId) {
      res.status(400).json({
        success: false,
        error: 'Query params week_start e club_id obrigatórios',
      });
      return;
    }

    if (entityId) {
      const amount = await carryForwardService.getCarryForEntity(tenantId, clubId, weekStart, entityId);
      res.json({ success: true, data: { entity_id: entityId, amount } });
    } else {
      const map = await carryForwardService.getCarryMap(tenantId, clubId, weekStart);
      res.json({ success: true, data: map });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/carry-forward/close-week — Fechar semana ─────────────
// Body: { settlement_id: string }
// Computa saldoFinal de cada agente e grava carry para próxima semana
router.post('/close-week', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { settlement_id } = req.body;

    if (!settlement_id) {
      res.status(400).json({
        success: false,
        error: 'settlement_id obrigatório',
      });
      return;
    }

    const result = await carryForwardService.computeAndPersist(tenantId, settlement_id);

    // Audit log
    const { supabaseAdmin } = await import('../config/supabase');
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: req.userId!,
      action: 'CLOSE_WEEK',
      entity_type: 'carry_forward',
      entity_id: settlement_id,
      new_data: {
        week_closed: result.week_closed,
        next_week: result.next_week,
        count: result.count,
      },
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
