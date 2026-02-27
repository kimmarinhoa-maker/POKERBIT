// ══════════════════════════════════════════════════════════════════════
//  Rotas de Ledger — Movimentações financeiras (pagamentos IN/OUT)
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { ledgerService } from '../services/ledger.service';
import { safeErrorMessage } from '../utils/apiError';
import { logAudit } from '../utils/audit';

const router = Router();

const createEntrySchema = z.object({
  entity_id: z.string().min(1),
  entity_name: z.string().optional(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dir: z.enum(['IN', 'OUT']),
  amount: z.number().positive(),
  method: z.string().optional(),
  description: z.string().optional(),
});

// ─── POST /api/ledger — Criar movimentação ─────────────────────────
router.post(
  '/',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  requirePermission('tab:extrato'),
  async (req: Request, res: Response) => {
    try {
      const parsed = createEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const tenantId = req.tenantId!;
      const data = await ledgerService.createEntry(tenantId, parsed.data, req.userId!);

      logAudit(req, 'CREATE', 'ledger_entry', data?.id || '', undefined, parsed.data);
      res.status(201).json({ success: true, data });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── GET /api/ledger — Listar movimentações ────────────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const weekStart = req.query.week_start as string;
    const entityId = req.query.entity_id as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    if (!weekStart) {
      res.status(400).json({ success: false, error: 'Query param week_start obrigatório' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      res.status(400).json({ success: false, error: 'Formato de data invalido (YYYY-MM-DD)' });
      return;
    }

    const { data: paged, total } = await ledgerService.listEntries(tenantId, weekStart, entityId, page, limit);

    res.json({
      success: true,
      data: paged,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/ledger/net — Calcular net de uma entidade ────────────
router.get('/net', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const weekStart = req.query.week_start as string;
    const entityId = req.query.entity_id as string;

    if (!weekStart || !entityId) {
      res.status(400).json({
        success: false,
        error: 'Query params week_start e entity_id obrigatórios',
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      res.status(400).json({ success: false, error: 'Formato de data invalido (YYYY-MM-DD)' });
      return;
    }

    const data = await ledgerService.calcEntityLedgerNet(tenantId, weekStart, entityId);

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── DELETE /api/ledger/:id — Deletar movimentação ─────────────────
router.delete(
  '/:id',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  requirePermission('tab:extrato'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const data = await ledgerService.deleteEntry(tenantId, req.params.id, req.userId!);

      logAudit(req, 'DELETE', 'ledger_entry', req.params.id);
      res.json({ success: true, data });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── PATCH /api/ledger/:id/reconcile — Toggle conciliação ───────────
router.patch(
  '/:id/reconcile',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  requirePermission('tab:extrato'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const entryId = req.params.id;
      const { is_reconciled } = req.body;

      if (typeof is_reconciled !== 'boolean') {
        res.status(400).json({ success: false, error: 'is_reconciled deve ser boolean' });
        return;
      }

      const data = await ledgerService.toggleReconciled(tenantId, entryId, is_reconciled);

      logAudit(req, 'UPDATE', 'ledger_entry', entryId, undefined, { is_reconciled });
      res.json({ success: true, data });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

export default router;
