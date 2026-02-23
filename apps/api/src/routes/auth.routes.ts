// ══════════════════════════════════════════════════════════════════════
//  Rotas de Auth — Login, signup, me
//
//  O Auth é gerenciado pelo Supabase Auth.
//  Essas rotas são proxies para simplificar o frontend.
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// ─── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Email e senha obrigatórios' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      res.status(401).json({ success: false, error: 'Credenciais inválidas' });
      return;
    }

    const FULL_ACCESS_ROLES = ['OWNER', 'ADMIN'];

    // Buscar tenants do usuário
    const { data: tenants } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id, role, tenants!inner(id, name, slug)')
      .eq('user_id', data.user.id)
      .eq('is_active', true);

    // Buscar org_access (subclubs permitidos)
    const { data: orgAccess } = await supabaseAdmin
      .from('user_org_access')
      .select('tenant_id, org_id, organizations!inner(id, name)')
      .eq('user_id', data.user.id);

    const orgAccessByTenant = new Map<string, { id: string; name: string }[]>();
    for (const oa of orgAccess || []) {
      const tid = oa.tenant_id;
      if (!orgAccessByTenant.has(tid)) orgAccessByTenant.set(tid, []);
      orgAccessByTenant.get(tid)!.push({
        id: (oa as any).organizations.id,
        name: (oa as any).organizations.name,
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
        tenants: (tenants || []).map(t => ({
          id: (t as any).tenants.id,
          name: (t as any).tenants.name,
          slug: (t as any).tenants.slug,
          role: t.role,
          allowed_subclubs: FULL_ACCESS_ROLES.includes(t.role)
            ? null
            : orgAccessByTenant.get(t.tenant_id) || [],
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/auth/refresh ────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ success: false, error: 'refresh_token obrigatório' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      res.status(401).json({ success: false, error: 'Token expirado ou inválido' });
      return;
    }

    res.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/auth/me — Dados do usuário logado + RBAC ──────────────
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const FULL_ACCESS_ROLES = ['OWNER', 'ADMIN'];

    // Buscar profile
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', req.userId!)
      .single();

    // Buscar tenants
    const { data: tenants } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id, role, tenants!inner(id, name, slug)')
      .eq('user_id', req.userId!)
      .eq('is_active', true);

    // Buscar org_access para cada tenant (subclubs permitidos)
    const { data: orgAccess } = await supabaseAdmin
      .from('user_org_access')
      .select('tenant_id, org_id, organizations!inner(id, name)')
      .eq('user_id', req.userId!);

    // Mapa: tenant_id → array de subclubs
    const orgAccessByTenant = new Map<string, { id: string; name: string }[]>();
    for (const oa of orgAccess || []) {
      const tid = oa.tenant_id;
      if (!orgAccessByTenant.has(tid)) orgAccessByTenant.set(tid, []);
      orgAccessByTenant.get(tid)!.push({
        id: (oa as any).organizations.id,
        name: (oa as any).organizations.name,
      });
    }

    res.json({
      success: true,
      data: {
        id: req.userId,
        email: req.userEmail,
        profile: profile || null,
        tenants: (tenants || []).map(t => ({
          id: (t as any).tenants.id,
          name: (t as any).tenants.name,
          slug: (t as any).tenants.slug,
          role: t.role,
          allowed_subclubs: FULL_ACCESS_ROLES.includes(t.role)
            ? null  // null = acesso total
            : orgAccessByTenant.get(t.tenant_id) || [],
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
