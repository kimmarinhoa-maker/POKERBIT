// ══════════════════════════════════════════════════════════════════════
//  ChipPix Routes — Import XLSX, list, link, apply
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { chipPixService } from '../services/chippix.service';
import { safeErrorMessage } from '../utils/apiError';
import { logAudit } from '../utils/audit';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── POST /api/chippix/upload — Upload + parse XLSX ChipPix ──────
router.post('/upload', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('tab:conciliacao'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({ success: false, error: 'Arquivo XLSX obrigatório' });
      return;
    }

    const weekStart = req.body.week_start as string | undefined;
    const clubId = req.body.club_id as string | undefined;

    const result = await chipPixService.uploadChipPix(
      tenantId,
      file.buffer,
      file.originalname,
      weekStart || '',
      clubId,
    );

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/chippix/import-extrato — Import direto → ledger ───
router.post(
  '/import-extrato',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN', 'FINANCEIRO'),
  requirePermission('tab:conciliacao'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const file = (req as any).file;

      if (!file) {
        res.status(400).json({ success: false, error: 'Arquivo XLSX obrigatório' });
        return;
      }

      const result = await chipPixService.importExtrato(tenantId, file.buffer, userId);

      res.json({ success: true, data: result });
    } catch (err: unknown) {
      const msg = safeErrorMessage(err);
      const status = msg.includes('Semana incorreta') ? 400 : 500;
      res.status(status).json({ success: false, error: msg });
    }
  },
);

// ─── GET /api/chippix/summary — Ledger summary para verificador ──
router.get('/summary', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const weekStart = req.query.week_start as string | undefined;

    if (!weekStart) {
      res.status(400).json({ success: false, error: 'week_start obrigatório' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      res.status(400).json({ success: false, error: 'Formato de data invalido (YYYY-MM-DD)' });
      return;
    }

    const data = await chipPixService.getLedgerSummary(tenantId, weekStart);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/chippix — Listar transações ChipPix ────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const weekStart = req.query.week_start as string | undefined;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      res.status(400).json({ success: false, error: 'Formato de data invalido (YYYY-MM-DD)' });
      return;
    }

    const { data, total } = await chipPixService.listTransactions(tenantId, weekStart, status, page, limit);

    res.json({
      success: true,
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PATCH /api/chippix/:id/link — Vincular a entidade ───────────
router.patch('/:id/link', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('tab:conciliacao'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { entity_id, entity_name } = req.body;

    if (!entity_id || !entity_name) {
      res.status(400).json({ success: false, error: 'entity_id e entity_name obrigatórios' });
      return;
    }

    const data = await chipPixService.linkTransaction(tenantId, req.params.id, entity_id, entity_name);

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PATCH /api/chippix/:id/unlink — Desvincular ─────────────────
router.patch('/:id/unlink', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('tab:conciliacao'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const data = await chipPixService.unlinkTransaction(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PATCH /api/chippix/:id/ignore — Ignorar/restaurar ───────────
router.patch('/:id/ignore', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('tab:conciliacao'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { ignore } = req.body;
    const data = await chipPixService.ignoreTransaction(tenantId, req.params.id, ignore !== false);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/chippix/apply — Aplicar vinculadas → ledger ───────
router.post('/apply', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('tab:conciliacao'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { week_start } = req.body;

    if (!week_start) {
      res.status(400).json({ success: false, error: 'week_start obrigatório' });
      return;
    }

    const data = await chipPixService.applyLinked(tenantId, week_start, req.userId!);
    logAudit(req, 'CREATE', 'ledger', tenantId, undefined, { source: 'chippix', week_start });
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── DELETE /api/chippix/:id — Deletar transação ─────────────────
router.delete('/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('tab:conciliacao'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const data = await chipPixService.deleteTransaction(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

export default router;
