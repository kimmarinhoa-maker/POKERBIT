// ══════════════════════════════════════════════════════════════════════
//  Users Routes — Gestao de membros do tenant
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// Todas as rotas exigem OWNER ou ADMIN
const adminOnly = [requireAuth, requireTenant, requireRole('OWNER', 'ADMIN')];

// ─── GET /api/users — Lista membros do tenant ──────────────────────
router.get(
  '/',
  ...adminOnly,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;

      const { data, error } = await supabaseAdmin.rpc('get_tenant_users', {
        p_tenant_id: tenantId,
      });

      // Fallback: query direta se a RPC nao existir
      if (error) {
        // Query direta nas tabelas
        const { data: users, error: queryError } = await supabaseAdmin
          .from('user_tenants')
          .select(`
            id,
            user_id,
            role,
            is_active,
            created_at
          `)
          .eq('tenant_id', tenantId)
          .order('created_at');

        if (queryError) throw queryError;

        // Buscar profiles e emails separadamente
        const userIds = (users || []).map(u => u.user_id);

        const { data: profiles } = await supabaseAdmin
          .from('user_profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(
          (profiles || []).map(p => [p.id, p])
        );

        // Buscar emails via admin auth
        const enriched = await Promise.all(
          (users || []).map(async (ut) => {
            const profile = profileMap.get(ut.user_id);
            let email = null;
            try {
              const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(ut.user_id);
              email = authUser?.user?.email || null;
            } catch {
              // silent
            }
            return {
              ...ut,
              full_name: profile?.full_name || null,
              avatar_url: profile?.avatar_url || null,
              email,
            };
          })
        );

        res.json({ success: true, data: enriched });
        return;
      }

      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── PATCH /api/users/:id/role — Alterar role de um membro ─────────
router.patch(
  '/:id/role',
  ...adminOnly,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      const { role } = req.body;

      const validRoles = ['OWNER', 'ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE'];
      if (!role || !validRoles.includes(role)) {
        res.status(400).json({
          success: false,
          error: `Role invalido. Use: ${validRoles.join(', ')}`,
        });
        return;
      }

      // Buscar o user_tenant para verificar se e o proprio usuario
      const { data: target, error: findError } = await supabaseAdmin
        .from('user_tenants')
        .select('id, user_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (findError || !target) {
        res.status(404).json({ success: false, error: 'Membro nao encontrado' });
        return;
      }

      // Impedir alterar o proprio role
      if (target.user_id === req.userId) {
        res.status(400).json({
          success: false,
          error: 'Voce nao pode alterar sua propria funcao',
        });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from('user_tenants')
        .update({ role })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── DELETE /api/users/:id — Remover membro do tenant ───────────────
router.delete(
  '/:id',
  ...adminOnly,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;

      // Buscar o user_tenant para verificar se e o proprio usuario
      const { data: target, error: findError } = await supabaseAdmin
        .from('user_tenants')
        .select('id, user_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (findError || !target) {
        res.status(404).json({ success: false, error: 'Membro nao encontrado' });
        return;
      }

      // Impedir remover a si mesmo
      if (target.user_id === req.userId) {
        res.status(400).json({
          success: false,
          error: 'Voce nao pode se remover do tenant',
        });
        return;
      }

      const { error } = await supabaseAdmin
        .from('user_tenants')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      res.json({ success: true, data: { deleted: true } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ─── POST /api/users/invite — Convidar novo membro ─────────────────
router.post(
  '/invite',
  ...adminOnly,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { email, role } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({ success: false, error: 'Email obrigatorio' });
        return;
      }

      const validRoles = ['ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE'];
      if (!role || !validRoles.includes(role)) {
        res.status(400).json({
          success: false,
          error: `Role invalido. Use: ${validRoles.join(', ')}`,
        });
        return;
      }

      // Buscar usuario por email via auth admin
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();

      if (listError) throw listError;

      const existingUser = listData.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!existingUser) {
        res.json({
          success: true,
          data: null,
          pending: true,
          message: 'Convite pendente - usuario precisa fazer signup primeiro',
        });
        return;
      }

      // Verificar se ja esta vinculado ao tenant
      const { data: existing } = await supabaseAdmin
        .from('user_tenants')
        .select('id')
        .eq('user_id', existingUser.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existing) {
        res.status(409).json({
          success: false,
          error: 'Este usuario ja e membro desta organizacao',
        });
        return;
      }

      // Criar vinculo
      const { data, error } = await supabaseAdmin
        .from('user_tenants')
        .insert({
          user_id: existingUser.id,
          tenant_id: tenantId,
          role,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        success: true,
        data,
        message: 'Membro adicionado com sucesso',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;
