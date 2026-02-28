// ══════════════════════════════════════════════════════════════════════
//  Links Routes — Vinculação de jogadores/agentes a subclubes
//
//  Endpoints:
//    GET  /api/links/unlinked       — Jogadores não vinculados do último import
//    GET  /api/links/agents         — Lista agent_manual_links
//    POST /api/links/agent          — Vincula agente (por nome) a subclube
//    GET  /api/links/players        — Lista player_links
//    POST /api/links/player         — Vincula jogador individual a subclube
//    DELETE /api/links/agent/:id    — Remove vínculo de agente
//    DELETE /api/links/player/:id   — Remove vínculo de jogador
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { safeErrorMessage } from '../utils/apiError';

const router = Router();

// ─── GET /api/links/unlinked — Jogadores '?' do settlement mais recente ───
router.get('/unlinked', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const settlementId = req.query.settlement_id as string;

    // Se não passar settlement_id, pega o mais recente
    let settId = settlementId;
    if (!settId) {
      const { data: latestSett } = await supabaseAdmin
        .from('settlements')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestSett) {
        res.json({ success: true, data: { unlinked: [], total: 0 } });
        return;
      }
      settId = latestSett.id;
    }

    // Buscar jogadores com subclub_name = '?' ou NULL
    const { data: unlinkedPlayers, error } = await supabaseAdmin
      .from('player_week_metrics')
      .select('id, player_id, external_player_id, nickname, agent_name, agent_id, subclub_name')
      .eq('tenant_id', tenantId)
      .eq('settlement_id', settId)
      .or('subclub_name.eq.?,subclub_name.is.null');

    if (error) throw error;

    // Agrupar por agent_name para facilitar vinculação em lote
    const byAgent: Record<string, any[]> = {};
    (unlinkedPlayers || []).forEach((p: any) => {
      const agentKey = p.agent_name || 'SEM AGENTE';
      if (!byAgent[agentKey]) byAgent[agentKey] = [];
      byAgent[agentKey].push({
        id: p.id,
        playerId: p.player_id,
        externalId: p.external_player_id,
        nickname: p.nickname,
        agentName: p.agent_name,
        agentId: p.agent_id,
      });
    });

    // Buscar subclubes disponíveis para o dropdown
    const { data: subclubs } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('type', 'SUBCLUB')
      .order('name');

    // Buscar links existentes para mostrar o que já está configurado
    const { data: existingAgentLinks } = await supabaseAdmin
      .from('agent_manual_links')
      .select('id, agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tenantId);

    const { data: existingPlayerLinks } = await supabaseAdmin
      .from('player_links')
      .select('id, external_player_id, agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tenantId);

    res.json({
      success: true,
      data: {
        settlementId: settId,
        total: (unlinkedPlayers || []).length,
        byAgent,
        subclubs: subclubs || [],
        existingAgentLinks: existingAgentLinks || [],
        existingPlayerLinks: existingPlayerLinks || [],
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/links/agents — Lista agent_manual_links ──────────────────────
router.get('/agents', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('agent_manual_links')
      .select('*, organizations!inner(name)')
      .eq('tenant_id', tenantId)
      .order('agent_name');

    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/links/agent — Vincular agente a subclube ─────────────────────
const agentLinkSchema = z.object({
  agent_name: z.string().min(1),
  subclub_id: z.string().uuid(),
});

router.post('/agent', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const parsed = agentLinkSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { agent_name, subclub_id } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('agent_manual_links')
      .upsert(
        {
          tenant_id: tenantId,
          agent_name: agent_name.toUpperCase().trim(),
          subclub_id,
        },
        {
          onConflict: 'tenant_id,agent_name',
        },
      )
      .select('*, organizations!inner(name)')
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/links/player — Vincular jogador individual ───────────────────
const playerLinkSchema = z.object({
  external_player_id: z.string().min(1),
  subclub_id: z.string().uuid(),
  agent_external_id: z.string().optional(),
  agent_name: z.string().optional(),
});

router.post('/player', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const parsed = playerLinkSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { external_player_id, subclub_id, agent_external_id, agent_name } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('player_links')
      .upsert(
        {
          tenant_id: tenantId,
          external_player_id,
          subclub_id,
          agent_external_id: agent_external_id || null,
          agent_name: agent_name || null,
        },
        {
          onConflict: 'tenant_id,external_player_id',
        },
      )
      .select('*, organizations!inner(name)')
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/links/bulk-players — Vincular vários jogadores de uma vez ────
const bulkPlayerLinkSchema = z.object({
  players: z.array(
    z.object({
      external_player_id: z.string().min(1),
      subclub_id: z.string().uuid(),
      agent_external_id: z.string().optional(),
      agent_name: z.string().optional(),
    }),
  ),
});

router.post('/bulk-players', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const parsed = bulkPlayerLinkSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const rows = parsed.data.players.map((p) => ({
      tenant_id: tenantId,
      external_player_id: p.external_player_id,
      subclub_id: p.subclub_id,
      agent_external_id: p.agent_external_id || null,
      agent_name: p.agent_name || null,
    }));

    const { data, error } = await supabaseAdmin
      .from('player_links')
      .upsert(rows, {
        onConflict: 'tenant_id,external_player_id',
      })
      .select('*, organizations!inner(name)');

    if (error) throw error;
    res.json({ success: true, data, count: (data || []).length });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── DELETE /api/links/agent/:id — Remove vínculo de agente ────────────────
router.delete('/agent/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { error } = await supabaseAdmin
      .from('agent_manual_links')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── DELETE /api/links/player/:id — Remove vínculo de jogador ──────────────
router.delete('/player/:id', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { error } = await supabaseAdmin
      .from('player_links')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

export default router;
