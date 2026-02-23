// ══════════════════════════════════════════════════════════════════════
//  ChipPix Routes — Import XLSX, list, link, apply
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, requireTenant } from '../middleware/auth';
import { chipPixService } from '../services/chippix.service';
import { ofxService } from '../services/ofx.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── POST /api/chippix/upload — Upload + parse XLSX ChipPix ──────
router.post(
  '/upload',
  requireAuth,
  requireTenant,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
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
        clubId
      );

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── GET /api/chippix — Listar transações ChipPix ────────────────
router.get(
  '/',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const weekStart = req.query.week_start as string | undefined;
      const status = req.query.status as string | undefined;

      const data = await chipPixService.listTransactions(tenantId, weekStart, status);

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/chippix/:id/link — Vincular a entidade ───────────
router.patch(
  '/:id/link',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { entity_id, entity_name, category } = req.body;

      if (!entity_id || !entity_name) {
        res.status(400).json({ success: false, error: 'entity_id e entity_name obrigatórios' });
        return;
      }

      // Reuse OFX service for link (same bank_transactions table)
      const data = await ofxService.linkTransaction(
        tenantId, req.params.id, entity_id, entity_name, category
      );

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/chippix/:id/unlink — Desvincular ─────────────────
router.patch(
  '/:id/unlink',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const data = await ofxService.unlinkTransaction(tenantId, req.params.id);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/chippix/:id/ignore — Ignorar/restaurar ───────────
router.patch(
  '/:id/ignore',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { ignore } = req.body;
      const data = await ofxService.ignoreTransaction(tenantId, req.params.id, ignore !== false);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/chippix/apply — Aplicar vinculadas → ledger ───────
router.post(
  '/apply',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { week_start } = req.body;

      if (!week_start) {
        res.status(400).json({ success: false, error: 'week_start obrigatório' });
        return;
      }

      const data = await chipPixService.applyLinked(tenantId, week_start, (req as any).userId);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── DELETE /api/chippix/:id — Deletar transação ─────────────────
router.delete(
  '/:id',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const data = await ofxService.deleteTransaction(tenantId, req.params.id);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
