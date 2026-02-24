// ══════════════════════════════════════════════════════════════════════
//  Rotas de Ledger — Movimentações financeiras (pagamentos IN/OUT)
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { ledgerService } from '../services/ledger.service';

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

      const tenantId = (req as any).tenantId;
      const data = await ledgerService.createEntry(tenantId, parsed.data, req.userId!);

      res.status(201).json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/ledger — Listar movimentações ────────────────────────
router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const weekStart = req.query.week_start as string;
      const entityId = req.query.entity_id as string | undefined;

      if (!weekStart) {
        res.status(400).json({ success: false, error: 'Query param week_start obrigatório' });
        return;
      }

      const data = await ledgerService.listEntries(tenantId, weekStart, entityId);

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/ledger/net — Calcular net de uma entidade ────────────
router.get(
  '/net',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const weekStart = req.query.week_start as string;
      const entityId = req.query.entity_id as string;

      if (!weekStart || !entityId) {
        res.status(400).json({
          success: false,
          error: 'Query params week_start e entity_id obrigatórios',
        });
        return;
      }

      const data = await ledgerService.calcEntityLedgerNet(tenantId, weekStart, entityId);

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── DELETE /api/ledger/:id — Deletar movimentação ─────────────────
router.delete(
  '/:id',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const data = await ledgerService.deleteEntry(tenantId, req.params.id, req.userId!);

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/ledger/:id/reconcile — Toggle conciliação ───────────
router.patch(
  '/:id/reconcile',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const entryId = req.params.id;
      const { is_reconciled } = req.body;

      if (typeof is_reconciled !== 'boolean') {
        res.status(400).json({ success: false, error: 'is_reconciled deve ser boolean' });
        return;
      }

      const data = await ledgerService.toggleReconciled(tenantId, entryId, is_reconciled);

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
