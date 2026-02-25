// ══════════════════════════════════════════════════════════════════════
//  Rotas de Players — Consulta e gestão de jogadores
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// ─── GET /api/players — Listar jogadores do tenant ─────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const search = req.query.search as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('players')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('nickname', { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`nickname.ilike.%${search}%,external_id.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/players/:id/history — Histórico do player ────────────
router.get('/:id/history', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    // Buscar métricas semanais do player
    const { data, error } = await supabaseAdmin
      .from('player_week_metrics')
      .select(
        `
          *,
          settlements!inner(week_start, status, club_id,
            organizations!inner(name)
          )
        `,
      )
      .eq('tenant_id', tenantId)
      .eq('player_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(52); // Último ano

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/players/rates — Rates vigentes ───────────────────────
router.get('/rates/current', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('player_rb_rates')
      .select(
        `
          id, rate, effective_from, effective_to,
          players!inner(id, external_id, nickname)
        `,
      )
      .eq('tenant_id', tenantId)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order('effective_from', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/players/:id/rate — Atualizar rate do player ──────────
router.put('/:id/rate', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { rate, effective_from } = req.body;

    if (rate == null || typeof rate !== 'number' || isNaN(rate) || rate < 0 || rate > 100) {
      res.status(400).json({ success: false, error: 'Rate deve ser um numero entre 0 e 100' });
      return;
    }

    const dateFrom = effective_from || new Date().toISOString().split('T')[0];

    // Fechar rate anterior
    await supabaseAdmin
      .from('player_rb_rates')
      .update({ effective_to: dateFrom })
      .eq('tenant_id', tenantId)
      .eq('player_id', req.params.id)
      .is('effective_to', null);

    // Criar nova rate
    const { data, error } = await supabaseAdmin
      .from('player_rb_rates')
      .insert({
        tenant_id: tenantId,
        player_id: req.params.id,
        rate,
        effective_from: dateFrom,
        created_by: req.userId,
      })
      .select()
      .single();

    if (error) throw error;

    // Audit
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: req.userId,
      action: 'UPDATE',
      entity_type: 'player_rb_rate',
      entity_id: req.params.id,
      new_data: { rate, effective_from: dateFrom },
    });

    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
