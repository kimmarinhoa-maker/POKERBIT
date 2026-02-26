// ══════════════════════════════════════════════════════════════════════
//  Config Routes — Fees, Adjustments, Payment Methods, Bank Accounts
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { safeErrorMessage } from '../utils/apiError';

const router = Router();

// ─── GET /api/config/fees — Lista taxas do tenant ────────────────────
router.get('/fees', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin.from('fee_config').select('*').eq('tenant_id', tenantId).order('name');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/config/fees — Atualiza taxas ───────────────────────────
router.put('/fees', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { fees } = req.body;

    if (!fees || !Array.isArray(fees)) {
      res.status(400).json({ success: false, error: 'Campo "fees" (array) obrigatório' });
      return;
    }

    // Atualizar cada fee
    for (const fee of fees) {
      if (!fee.name || fee.rate === undefined) continue;

      await supabaseAdmin.from('fee_config').upsert(
        {
          tenant_id: tenantId,
          name: fee.name,
          rate: Number(fee.rate),
          base: fee.base || 'rake',
          is_active: fee.is_active !== false,
        },
        {
          onConflict: 'tenant_id,name',
        },
      );
    }

    // Retornar estado atualizado
    const { data } = await supabaseAdmin.from('fee_config').select('*').eq('tenant_id', tenantId).order('name');

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/config/adjustments — Busca lançamentos ─────────────────
router.get('/adjustments', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const weekStart = req.query.week_start as string;
    const subclubId = req.query.subclub_id as string;

    if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      res.status(400).json({ success: false, error: 'Formato de data invalido (YYYY-MM-DD)' });
      return;
    }

    let query = supabaseAdmin.from('club_adjustments').select('*, organizations!inner(name)').eq('tenant_id', tenantId);

    if (weekStart) query = query.eq('week_start', weekStart);
    if (subclubId) query = query.eq('subclub_id', subclubId);

    const { data, error } = await query.order('created_at');
    if (error) throw error;

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/config/adjustments — Upsert lançamentos ────────────────
router.put('/adjustments', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { subclub_id, week_start, overlay, compras, security, outros, obs } = req.body;

    if (!subclub_id || !week_start) {
      res.status(400).json({
        success: false,
        error: 'Campos "subclub_id" e "week_start" obrigatórios',
      });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('club_adjustments')
      .upsert(
        {
          tenant_id: tenantId,
          subclub_id,
          week_start,
          overlay: Number(overlay || 0),
          compras: Number(compras || 0),
          security: Number(security || 0),
          outros: Number(outros || 0),
          obs: obs || null,
        },
        {
          onConflict: 'tenant_id,subclub_id,week_start',
        },
      )
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ═════════════════════════════════════════════════════════════════════
//  Payment Methods CRUD
// ═════════════════════════════════════════════════════════════════════

// ─── GET /api/config/payment-methods — Listar métodos de pagamento ──
router.get('/payment-methods', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('payment_methods')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order')
      .order('name');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/config/payment-methods — Criar método de pagamento ───
router.post('/payment-methods', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { name, is_default, sort_order } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'Campo "name" obrigatório' });
      return;
    }

    // If setting as default, remove default from others
    if (is_default) {
      await supabaseAdmin.from('payment_methods').update({ is_default: false }).eq('tenant_id', tenantId);
    }

    const { data, error } = await supabaseAdmin
      .from('payment_methods')
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        is_default: !!is_default,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/config/payment-methods/:id — Atualizar ────────────────
router.put('/payment-methods/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const { name, is_default, is_active, sort_order } = req.body;

    // If setting as default, remove default from others
    if (is_default) {
      await supabaseAdmin.from('payment_methods').update({ is_default: false }).eq('tenant_id', tenantId);
    }

    const update: Record<string, any> = {};
    if (name !== undefined) update.name = name.trim();
    if (is_default !== undefined) update.is_default = is_default;
    if (is_active !== undefined) update.is_active = is_active;
    if (sort_order !== undefined) update.sort_order = sort_order;

    const { data, error } = await supabaseAdmin
      .from('payment_methods')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, error: 'Método não encontrado' });
      return;
    }
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── DELETE /api/config/payment-methods/:id — Deletar ───────────────
router.delete('/payment-methods/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin.from('payment_methods').delete().eq('id', id).eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ success: true, data: { deleted: true } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ═════════════════════════════════════════════════════════════════════
//  Bank Accounts CRUD
// ═════════════════════════════════════════════════════════════════════

// ─── GET /api/config/bank-accounts — Listar contas bancárias ────────
router.get('/bank-accounts', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('bank_accounts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/config/bank-accounts — Criar conta bancária ──────────
router.post('/bank-accounts', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { name, bank_code, agency, account_nr, is_default } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'Campo "name" obrigatório' });
      return;
    }

    if (is_default) {
      await supabaseAdmin.from('bank_accounts').update({ is_default: false }).eq('tenant_id', tenantId);
    }

    const { data, error } = await supabaseAdmin
      .from('bank_accounts')
      .insert({
        tenant_id: tenantId,
        name: name.trim(),
        bank_code: bank_code || null,
        agency: agency || null,
        account_nr: account_nr || null,
        is_default: !!is_default,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/config/bank-accounts/:id — Atualizar ──────────────────
router.put('/bank-accounts/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const { name, bank_code, agency, account_nr, is_default, is_active } = req.body;

    if (is_default) {
      await supabaseAdmin.from('bank_accounts').update({ is_default: false }).eq('tenant_id', tenantId);
    }

    const update: Record<string, any> = {};
    if (name !== undefined) update.name = name.trim();
    if (bank_code !== undefined) update.bank_code = bank_code || null;
    if (agency !== undefined) update.agency = agency || null;
    if (account_nr !== undefined) update.account_nr = account_nr || null;
    if (is_default !== undefined) update.is_default = is_default;
    if (is_active !== undefined) update.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('bank_accounts')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ success: false, error: 'Conta não encontrada' });
      return;
    }
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── DELETE /api/config/bank-accounts/:id — Deletar ─────────────────
router.delete('/bank-accounts/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { id } = req.params;

    const { error } = await supabaseAdmin.from('bank_accounts').delete().eq('id', id).eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ success: true, data: { deleted: true } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ═════════════════════════════════════════════════════════════════════
//  Rakeback Defaults (por subclube)
// ═════════════════════════════════════════════════════════════════════

// ─── GET /api/config/rakeback-defaults — Listar RB defaults ─────────
router.get('/rakeback-defaults', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('rb_defaults')
      .select('*, organizations!inner(name)')
      .eq('tenant_id', tenantId)
      .order('created_at');

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/config/rakeback-defaults — Upsert RB defaults ────────
router.put('/rakeback-defaults', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { defaults } = req.body;

    if (!defaults || !Array.isArray(defaults)) {
      res.status(400).json({ success: false, error: 'Campo "defaults" (array) obrigatorio' });
      return;
    }

    for (const item of defaults) {
      if (!item.subclub_id) continue;

      await supabaseAdmin.from('rb_defaults').upsert(
        {
          tenant_id: tenantId,
          subclub_id: item.subclub_id,
          agent_rb_default: Number(item.agent_rb_default) || 0,
          player_rb_default: Number(item.player_rb_default) || 0,
        },
        {
          onConflict: 'tenant_id,subclub_id',
        },
      );
    }

    // Retornar estado atualizado
    const { data } = await supabaseAdmin
      .from('rb_defaults')
      .select('*, organizations!inner(name)')
      .eq('tenant_id', tenantId)
      .order('created_at');

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/config/whatsapp — Config Evolution API ──────────────
router.get('/whatsapp', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, data: data || { api_url: '', api_key: '', instance_name: '', is_active: false } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/config/whatsapp — Upsert config Evolution API ──────
router.put('/whatsapp', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { api_url, api_key, instance_name, is_active } = req.body;

    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .upsert(
        {
          tenant_id: tenantId,
          api_url: api_url || '',
          api_key: api_key || '',
          instance_name: instance_name || '',
          is_active: is_active ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' },
      )
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

export default router;
