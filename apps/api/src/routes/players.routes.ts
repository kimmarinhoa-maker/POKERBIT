// ══════════════════════════════════════════════════════════════════════
//  Rotas de Players — Consulta e gestão de jogadores
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { supabaseAdmin } from '../config/supabase';
import { safeErrorMessage } from '../utils/apiError';
import { logAudit } from '../utils/audit';

const router = Router();

// ─── Zod Schemas ────────────────────────────────────────────────────
const patchPlayerSchema = z.object({
  full_name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
});

const playerRateSchema = z.object({
  rate: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().min(0).max(100)),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── GET /api/players — Listar jogadores do tenant ─────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const search = req.query.search as string | undefined;
    const subclubId = req.query.subclub_id as string | undefined;
    const isDirect = req.query.is_direct as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // If subclub_id provided, filter players linked to agents of that subclub
    let playerIdFilter: string[] | null = null;
    if (subclubId) {
      const { data: agents } = await supabaseAdmin
        .from('organizations')
        .select('id, name, metadata')
        .eq('tenant_id', tenantId)
        .eq('parent_id', subclubId)
        .eq('type', 'AGENT')
        .eq('is_active', true);

      let filteredAgents = agents || [];

      // "SEM AGENTE" variants are always treated as direct (convention used across the app)
      const semAgentePattern = /^(sem agente|\(sem agente\)|none)$/i;

      // Filter by is_direct flag in metadata
      if (isDirect === 'true') {
        filteredAgents = filteredAgents.filter(
          (a) => (a.metadata as any)?.is_direct === true || semAgentePattern.test(a.name),
        );
      } else if (isDirect === 'false') {
        filteredAgents = filteredAgents.filter(
          (a) => !(a.metadata as any)?.is_direct && !semAgentePattern.test(a.name),
        );
      }

      const agentNames = filteredAgents.map((a) => a.name).filter(Boolean);

      // When filtering direct agents, always include "SEM AGENTE" variants
      // even if no org exists for them (players may have these as agent_name)
      if (isDirect === 'true') {
        const semVariants = ['SEM AGENTE', '(sem agente)', 'None', ''];
        for (const v of semVariants) {
          if (!agentNames.includes(v)) agentNames.push(v);
        }
      }

      if (agentNames.length === 0) {
        res.json({ success: true, data: [], meta: { total: 0, page, limit, pages: 0 } });
        return;
      }

      // Match via agent_name (text) — agent_id UUID is often NULL in imported data
      // Also filter by subclub_id to scope results to the selected subclub
      let metricsQuery = supabaseAdmin
        .from('player_week_metrics')
        .select('player_id')
        .eq('tenant_id', tenantId)
        .in('agent_name', agentNames);

      // Scope to subclub so "SEM AGENTE" variants don't leak across subclubs
      if (subclubId) {
        metricsQuery = metricsQuery.eq('subclub_id', subclubId);
      }

      const { data: metrics } = await metricsQuery;

      playerIdFilter = [...new Set((metrics || []).map((m) => m.player_id).filter(Boolean))];

      if (playerIdFilter.length === 0) {
        res.json({ success: true, data: [], meta: { total: 0, page, limit, pages: 0 } });
        return;
      }
    }

    let query = supabaseAdmin
      .from('players')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('nickname', { ascending: true })
      .range(offset, offset + limit - 1);

    if (playerIdFilter) {
      query = query.in('id', playerIdFilter);
    }

    if (search) {
      const escaped = search.replace(/[%_\\]/g, '\\$&').replace(/[,.()[\]]/g, '');
      query = query.or(`nickname.ilike.%${escaped}%,external_id.ilike.%${escaped}%`);
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
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
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
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
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
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PATCH /api/players/:id — Atualizar dados do player ─────────────
router.patch('/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('page:players'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const playerId = req.params.id;

    const parsed = patchPlayerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { full_name, phone, email } = parsed.data;

    // Build update object
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updates.full_name = full_name || null;

    // Store phone/email in metadata JSONB (merge with existing)
    if (phone !== undefined || email !== undefined) {
      // Fetch current metadata
      const { data: current, error: fetchErr } = await supabaseAdmin
        .from('players')
        .select('metadata')
        .eq('id', playerId)
        .eq('tenant_id', tenantId)
        .single();

      if (fetchErr) throw fetchErr;

      const meta = (current?.metadata as Record<string, any>) || {};
      if (phone !== undefined) meta.phone = phone || null;
      if (email !== undefined) meta.email = email || null;
      updates.metadata = meta;
    }

    const { data, error } = await supabaseAdmin
      .from('players')
      .update(updates)
      .eq('id', playerId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;

    logAudit(req, 'UPDATE', 'player', playerId, undefined, { full_name, phone, email });

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/players/:id/rate — Atualizar rate do player ──────────
router.put('/:id/rate', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), requirePermission('page:players'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const parsed = playerRateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Rate deve ser um numero entre 0 e 100', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const numRate = parsed.data.rate as number;
    const dateFrom = parsed.data.effective_from || new Date().toISOString().split('T')[0];

    // Check if there's already a rate for this player on this date
    const { data: existing } = await supabaseAdmin
      .from('player_rb_rates')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('player_id', req.params.id)
      .eq('effective_from', dateFrom)
      .maybeSingle();

    let data;
    if (existing) {
      // Update existing rate for same date
      const { data: updated, error } = await supabaseAdmin
        .from('player_rb_rates')
        .update({ rate: numRate, effective_to: null })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      data = updated;
    } else {
      // Fechar rate anterior
      await supabaseAdmin
        .from('player_rb_rates')
        .update({ effective_to: dateFrom })
        .eq('tenant_id', tenantId)
        .eq('player_id', req.params.id)
        .is('effective_to', null);

      // Criar nova rate
      const { data: inserted, error } = await supabaseAdmin
        .from('player_rb_rates')
        .insert({
          tenant_id: tenantId,
          player_id: req.params.id,
          rate: numRate,
          effective_from: dateFrom,
          created_by: req.userId,
        })
        .select()
        .single();
      if (error) throw error;
      data = inserted;
    }

    logAudit(req, 'UPDATE', 'player_rb_rate', req.params.id, undefined, { rate: numRate, effective_from: dateFrom });

    res.json({ success: true, data });
  } catch (err: unknown) {
    console.error('[PUT player/:id/rate] Error:', err);
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

export default router;
