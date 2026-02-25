// ══════════════════════════════════════════════════════════════════════
//  Rotas de Organizations — Clubs, Subclubes, Agentes
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth, requireTenant } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo nao permitido. Use PNG, JPEG, WebP ou SVG.'));
    }
  },
});

// ─── GET /api/organizations — Listar todas ─────────────────────────
router.get('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const type = req.query.type as string | undefined;

    let query = supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (type) {
      query = query.eq('type', type.toUpperCase());
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/organizations/tree — Árvore hierárquica ──────────────
router.get('/tree', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    // Montar árvore: CLUB → SUBCLUB → AGENT
    const tree = (orgs || [])
      .filter((o) => o.type === 'CLUB')
      .map((club) => ({
        ...club,
        subclubes: (orgs || [])
          .filter((o) => o.type === 'SUBCLUB' && o.parent_id === club.id)
          .map((sub) => ({
            ...sub,
            agents: (orgs || []).filter((o) => o.type === 'AGENT' && o.parent_id === sub.id),
          })),
      }));

    res.json({ success: true, data: tree });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/organizations/prefix-rules — Regras de prefixo ──────
router.get('/prefix-rules', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('agent_prefix_map')
      .select(
        `
          id, prefix, priority, is_active,
          organizations!inner(id, name)
        `,
      )
      .eq('tenant_id', tenantId)
      .order('priority', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/organizations/prefix-rules — Criar regra ───────────
const prefixRuleSchema = z.object({
  prefix: z.string().min(1).max(20),
  subclub_id: z.string().uuid(),
  priority: z.number().int().default(0),
});

router.post('/prefix-rules', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const parsed = prefixRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const tenantId = req.tenantId!;

    const { data, error } = await supabaseAdmin
      .from('agent_prefix_map')
      .insert({
        tenant_id: tenantId,
        prefix: parsed.data.prefix.toUpperCase(),
        subclub_id: parsed.data.subclub_id,
        priority: parsed.data.priority,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: 'Prefixo já existe para este tenant' });
        return;
      }
      throw error;
    }

    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/organizations/:id/logo — Upload logo ─────────────
router.post('/:id/logo', requireAuth, requireTenant, logoUpload.single('logo'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const orgId = req.params.id;
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
      return;
    }

    // Validar que org pertence ao tenant
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, type, metadata')
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .single();

    if (!org) {
      res.status(404).json({ success: false, error: 'Organizacao nao encontrada' });
      return;
    }

    // Determinar extensao
    const extMap: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    const ext = extMap[file.mimetype] || '.png';
    const storagePath = `${tenantId}/${orgId}${ext}`;

    // Upload para Supabase Storage (upsert)
    const { error: uploadError } = await supabaseAdmin.storage.from('club-logos').upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

    if (uploadError) throw uploadError;

    // Gerar public URL com cache-buster para evitar cache do browser/CDN
    const { data: urlData } = supabaseAdmin.storage.from('club-logos').getPublicUrl(storagePath);

    const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    // Atualizar metadata da org
    const newMetadata = { ...(org.metadata || {}), logo_url: logoUrl };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ metadata: newMetadata })
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, logo_url: logoUrl, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/organizations/:id/logo — Remover logo ──────────
router.delete('/:id/logo', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const orgId = req.params.id;

    // Buscar org
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, metadata')
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .single();

    if (!org) {
      res.status(404).json({ success: false, error: 'Organizacao nao encontrada' });
      return;
    }

    // Tentar remover arquivos do storage (todas extensoes possiveis)
    const extensions = ['.png', '.jpg', '.webp', '.svg'];
    const paths = extensions.map((ext) => `${tenantId}/${orgId}${ext}`);
    await supabaseAdmin.storage.from('club-logos').remove(paths);

    // Remover logo_url do metadata
    const newMetadata = { ...(org.metadata || {}) };
    delete newMetadata.logo_url;

    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ metadata: newMetadata })
      .eq('id', orgId)
      .eq('tenant_id', tenantId);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/organizations — Criar subclube ──────────────────────
const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  parent_id: z.string().uuid(),
  type: z.literal('SUBCLUB'),
  external_id: z.string().optional(),
});

router.post('/', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const parsed = createOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Dados invalidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const tenantId = req.tenantId!;

    // Validar que parent existe e e tipo CLUB
    const { data: parent } = await supabaseAdmin
      .from('organizations')
      .select('id, type')
      .eq('id', parsed.data.parent_id)
      .eq('tenant_id', tenantId)
      .single();

    if (!parent || parent.type !== 'CLUB') {
      res.status(400).json({ success: false, error: 'Parent deve ser um CLUB valido' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .insert({
        tenant_id: tenantId,
        parent_id: parsed.data.parent_id,
        type: 'SUBCLUB',
        name: parsed.data.name.trim(),
        external_id: parsed.data.external_id?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: 'Subclube com este nome ja existe' });
        return;
      }
      throw error;
    }

    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/organizations/:id — Editar subclube ──────────────────
const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  external_id: z.string().optional(),
  is_active: z.boolean().optional(),
});

router.put('/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const parsed = updateOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Dados invalidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const tenantId = req.tenantId!;
    const orgId = req.params.id;

    // Validar que org pertence ao tenant e e SUBCLUB
    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id, type')
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) {
      res.status(404).json({ success: false, error: 'Organizacao nao encontrada' });
      return;
    }
    if (existing.type !== 'SUBCLUB') {
      res.status(400).json({ success: false, error: 'Apenas subclubes podem ser editados' });
      return;
    }

    const updates: any = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
    if (parsed.data.external_id !== undefined) updates.external_id = parsed.data.external_id.trim() || null;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/organizations/:id — Deletar subclube ───────────────
router.delete('/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const orgId = req.params.id;

    // Validar que org pertence ao tenant e e SUBCLUB
    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id, type')
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) {
      res.status(404).json({ success: false, error: 'Organizacao nao encontrada' });
      return;
    }
    if (existing.type !== 'SUBCLUB') {
      res.status(400).json({ success: false, error: 'Apenas subclubes podem ser deletados' });
      return;
    }

    // Verificar se possui filhos (agentes)
    const { count } = await supabaseAdmin
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', orgId)
      .eq('tenant_id', tenantId);

    if (count && count > 0) {
      res.status(409).json({
        success: false,
        error: `Subclube possui ${count} agente(s) vinculado(s). Desative em vez de deletar.`,
      });
      return;
    }

    const { error } = await supabaseAdmin.from('organizations').delete().eq('id', orgId).eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/organizations/prefix-rules/:id — Atualizar regra ─────
const updatePrefixSchema = z.object({
  prefix: z.string().min(1).max(20).optional(),
  subclub_id: z.string().uuid().optional(),
  priority: z.number().int().optional(),
});

router.put('/prefix-rules/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const parsed = updatePrefixSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Dados invalidos',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const tenantId = req.tenantId!;
    const ruleId = req.params.id;

    const updates: any = {};
    if (parsed.data.prefix !== undefined) updates.prefix = parsed.data.prefix.trim().toUpperCase();
    if (parsed.data.subclub_id !== undefined) updates.subclub_id = parsed.data.subclub_id;
    if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;

    const { data, error } = await supabaseAdmin
      .from('agent_prefix_map')
      .update(updates)
      .eq('id', ruleId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: 'Prefixo ja existe' });
        return;
      }
      throw error;
    }

    if (!data) {
      res.status(404).json({ success: false, error: 'Regra nao encontrada' });
      return;
    }

    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/organizations/prefix-rules/:id — Deletar regra ────
router.delete('/prefix-rules/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const ruleId = req.params.id;

    const { error } = await supabaseAdmin.from('agent_prefix_map').delete().eq('id', ruleId).eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/organizations/agent-rates — Rates dos agentes ───────
router.get('/agent-rates', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('agent_rb_rates')
      .select(
        `
          id, rate, effective_from, effective_to,
          organizations!inner(id, name, type)
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

// ─── PUT /api/organizations/:id/rate — Atualizar rate de agente ────
router.put('/:id/rate', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const agentId = req.params.id;
    const { rate, effective_from } = req.body;

    if (rate == null || rate < 0 || rate > 100) {
      res.status(400).json({ success: false, error: 'Rate deve ser entre 0 e 100' });
      return;
    }

    // Validar que org é AGENT e pertence ao tenant
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, type')
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .single();

    if (!org) {
      res.status(404).json({ success: false, error: 'Agente nao encontrado' });
      return;
    }
    if (org.type !== 'AGENT') {
      res.status(400).json({ success: false, error: 'Apenas agentes possuem rates' });
      return;
    }

    const dateFrom = effective_from || new Date().toISOString().split('T')[0];

    // Fechar rate anterior
    await supabaseAdmin
      .from('agent_rb_rates')
      .update({ effective_to: dateFrom })
      .eq('tenant_id', tenantId)
      .eq('agent_id', agentId)
      .is('effective_to', null);

    // Criar nova rate
    const { data, error } = await supabaseAdmin
      .from('agent_rb_rates')
      .insert({
        tenant_id: tenantId,
        agent_id: agentId,
        rate,
        effective_from: dateFrom,
        created_by: req.userId!,
      })
      .select()
      .single();

    if (error) throw error;

    // Audit
    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: req.userId!,
      action: 'UPDATE',
      entity_type: 'agent_rb_rate',
      entity_id: agentId,
      new_data: { rate, effective_from: dateFrom },
    });

    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /api/organizations/:id/direct — Toggle agencia direta ───
router.patch('/:id/direct', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const orgId = req.params.id;
    const { is_direct } = req.body;

    if (typeof is_direct !== 'boolean') {
      res.status(400).json({ success: false, error: 'is_direct deve ser boolean' });
      return;
    }

    // Validar que org é AGENT e pertence ao tenant
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, type, metadata')
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .single();

    if (!org) {
      res.status(404).json({ success: false, error: 'Agente nao encontrado' });
      return;
    }
    if (org.type !== 'AGENT') {
      res.status(400).json({ success: false, error: 'Apenas agentes podem ser diretos' });
      return;
    }

    const newMetadata = { ...(org.metadata || {}), is_direct };

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update({ metadata: newMetadata })
      .eq('id', orgId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
