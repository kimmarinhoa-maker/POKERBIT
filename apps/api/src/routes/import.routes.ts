// ══════════════════════════════════════════════════════════════════════
//  Rotas de Import — Upload, Preview e Confirm de XLSX
//
//  Endpoints:
//    POST /api/imports/preview  — Analisa XLSX sem tocar no banco
//    POST /api/imports/confirm  — Persiste settlement + métricas (só se ready)
//    POST /api/imports          — [LEGACY] Upload + processamento direto
//    GET  /api/imports          — Listar importações
//    GET  /api/imports/:id      — Detalhe de um import
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { importService } from '../services/import.service';
import { importPreviewService } from '../services/importPreview.service';
import { importConfirmService, ConfirmError } from '../services/importConfirm.service';
import { supabaseAdmin } from '../config/supabase';
import { safeErrorMessage } from '../utils/apiError';

const router = Router();

// Multer para upload em memória (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .xlsx são aceitos'));
    }
  },
});

// ─── POST /api/imports/preview — Análise sem persistir ──────────────
//
// Recebe: XLSX (multipart file) + week_start? (opcional, override)
// Retorna: preview com summary, blockers, distribuição por subclube
// NÃO escreve nada no banco.

router.post('/preview', requireAuth, requireTenant, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Arquivo XLSX obrigatório' });
      return;
    }

    const tenantId = req.tenantId!;
    const weekStartOverride = req.body.week_start || undefined;

    const preview = await importPreviewService.preview({
      tenantId,
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      weekStartOverride,
    });

    // Também retornar subclubes do tenant para os dropdowns de vinculação
    const { data: subclubs } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('type', 'SUBCLUB')
      .eq('is_active', true)
      .order('name');

    res.json({
      success: true,
      data: {
        ...preview,
        available_subclubs: subclubs || [],
      },
    });
  } catch (err: unknown) {
    console.error('[POST /api/imports/preview]', err);
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/imports/confirm — Persiste (só se ready=true) ────────
//
// Recebe: XLSX (multipart file) + club_id + week_start (confirmado)
// Guardrail: retorna 409 se houver blockers
// Cria: import record, settlement (versioned), player/agent metrics

const confirmSchema = z.object({
  club_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post(
  '/confirm',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Arquivo XLSX obrigatório' });
        return;
      }

      const parsed = confirmSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Dados inválidos: club_id (uuid) e week_start (YYYY-MM-DD) obrigatórios',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { club_id, week_start } = parsed.data;
      const tenantId = req.tenantId!;

      // Validate club belongs to this tenant
      const { data: club } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('id', club_id)
        .eq('tenant_id', tenantId)
        .eq('type', 'CLUB')
        .single();
      if (!club) {
        res.status(400).json({ success: false, error: 'Club nao pertence a este tenant' });
        return;
      }

      const result = await importConfirmService.confirm({
        tenantId,
        clubId: club_id,
        weekStart: week_start,
        fileName: req.file.originalname,
        fileBuffer: req.file.buffer,
        uploadedBy: req.userId!,
      });

      res.status(201).json({ success: true, data: result });
    } catch (err: unknown) {
      if (err instanceof ConfirmError) {
        res.status(err.status).json({
          success: false,
          error: err.message,
        });
        return;
      }

      console.error('[POST /api/imports/confirm]', err);
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── POST /api/imports — [LEGACY] Upload + processamento direto ─────
// Mantido para compatibilidade. O wizard novo usa preview + confirm.

const uploadSchema = z.object({
  club_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post(
  '/',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Arquivo XLSX obrigatório' });
        return;
      }

      const parsed = uploadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { club_id, week_start } = parsed.data;
      const tenantId = req.tenantId!;

      // Validate club belongs to this tenant
      const { data: club } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('id', club_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!club) {
        res.status(400).json({ success: false, error: 'Clube nao encontrado neste tenant' });
        return;
      }

      const result = await importService.processImport({
        tenantId,
        clubId: club_id,
        weekStart: week_start,
        fileName: req.file.originalname,
        fileBuffer: req.file.buffer,
        uploadedBy: req.userId!,
      });

      const statusCode = result.status === 'error' ? 422 : 200;

      res.status(statusCode).json({
        success: result.status !== 'error',
        data: result,
      });
    } catch (err: unknown) {
      console.error('[POST /api/imports]', err);
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

// ─── GET /api/imports — Listar importações ──────────────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('imports')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      meta: { total: count || 0, page, limit, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/imports/:id — Detalhe de um import ────────────────────
router.get('/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('imports')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Import não encontrado' });
      return;
    }

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── DELETE /api/imports/:id — Remover um import ────────────────────
router.delete(
  '/:id',
  requireAuth,
  requireTenant,
  requireRole('OWNER', 'ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const importId = req.params.id;

      // Verify import exists and belongs to tenant
      const { data: imp, error: fetchErr } = await supabaseAdmin
        .from('imports')
        .select('id, settlement_id')
        .eq('id', importId)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchErr || !imp) {
        res.status(404).json({ success: false, error: 'Import não encontrado' });
        return;
      }

      // Cascade: clean up related data if settlement exists
      if (imp.settlement_id) {
        const sid = imp.settlement_id;

        // Guard: block deletion if settlement is finalized or voided
        const { data: settlement } = await supabaseAdmin
          .from('settlements')
          .select('status')
          .eq('id', sid)
          .single();

        if (settlement?.status === 'FINAL' || settlement?.status === 'VOID') {
          res.status(422).json({ success: false, error: 'Nao e possivel excluir: settlement ja finalizado' });
          return;
        }

        // 1) Delete player_week_metrics for this settlement
        const { error: pwmErr } = await supabaseAdmin
          .from('player_week_metrics')
          .delete()
          .eq('settlement_id', sid);
        if (pwmErr) throw pwmErr;

        // 2) Delete agent_week_metrics for this settlement
        const { error: awmErr } = await supabaseAdmin
          .from('agent_week_metrics')
          .delete()
          .eq('settlement_id', sid);
        if (awmErr) throw awmErr;

        // 3) Delete the settlement itself
        const { error: setErr } = await supabaseAdmin
          .from('settlements')
          .delete()
          .eq('id', sid);
        if (setErr) throw setErr;
      }

      // Delete import record
      const { error: delErr } = await supabaseAdmin
        .from('imports')
        .delete()
        .eq('id', importId)
        .eq('tenant_id', tenantId);

      if (delErr) throw delErr;

      res.json({ success: true });
    } catch (err: unknown) {
      console.error('[DELETE /api/imports/:id]', err);
      res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
  },
);

export default router;
