// ══════════════════════════════════════════════════════════════════════
//  OFX Routes — Import, list, link, apply bank transactions
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, requireTenant } from '../middleware/auth';
import { ofxService } from '../services/ofx.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── POST /api/ofx/upload — Upload + parse OFX file ────────────────
router.post('/upload', requireAuth, requireTenant, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({ success: false, error: 'Arquivo OFX obrigatório' });
      return;
    }

    const raw = file.buffer.toString('utf-8');
    const weekStart = req.body.week_start as string | undefined;

    const result = await ofxService.uploadOFX(tenantId, raw, file.originalname, weekStart);

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/ofx — Listar transações ───────────────────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const weekStart = req.query.week_start as string | undefined;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    const all = await ofxService.listTransactions(tenantId, weekStart, status);
    const total = all.length;
    const paged = all.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: paged,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/ofx/:id/link — Vincular a entidade ──────────────────
router.patch('/:id/link', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { entity_id, entity_name, category } = req.body;

    if (!entity_id || !entity_name) {
      res.status(400).json({ success: false, error: 'entity_id e entity_name obrigatórios' });
      return;
    }

    const data = await ofxService.linkTransaction(tenantId, req.params.id, entity_id, entity_name, category);

    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/ofx/:id/unlink — Desvincular ────────────────────────
router.patch('/:id/unlink', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const data = await ofxService.unlinkTransaction(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/ofx/:id/ignore — Ignorar/restaurar ──────────────────
router.patch('/:id/ignore', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { ignore } = req.body;
    const data = await ofxService.ignoreTransaction(tenantId, req.params.id, ignore !== false);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/ofx/auto-match — Auto-classificar transações ─────────
router.post('/auto-match', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { week_start } = req.body;

    if (!week_start) {
      res.status(400).json({ success: false, error: 'week_start obrigatório' });
      return;
    }

    const suggestions = await ofxService.autoMatch(tenantId, week_start);
    res.json({ success: true, data: suggestions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/ofx/apply — Aplicar vinculadas → criar ledger ────────
router.post('/apply', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { week_start } = req.body;

    if (!week_start) {
      res.status(400).json({ success: false, error: 'week_start obrigatório' });
      return;
    }

    const data = await ofxService.applyLinked(tenantId, week_start, req.userId!);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/ofx/:id — Deletar transação ─────────────────────────
router.delete('/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const data = await ofxService.deleteTransaction(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
