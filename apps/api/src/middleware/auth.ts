// ══════════════════════════════════════════════════════════════════════
//  Middleware de Autenticação — valida JWT do Supabase + RBAC
// ══════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

// Roles com acesso total (não precisam de user_org_access)
const FULL_ACCESS_ROLES = ['OWNER', 'ADMIN'];

// Extende o Request do Express com dados do usuário
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      accessToken?: string;
      tenantIds?: string[];
      tenantId?: string;
      tenantRoles?: Record<string, string>;
      userRole?: string;
      allowedSubclubIds?: string[] | null; // null = full access
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Valida o JWT via Supabase Auth
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Token inválido ou expirado' });
      return;
    }

    // Busca os tenants do usuário COM role
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', data.user.id)
      .eq('is_active', true);

    if (tenantError) {
      console.error('[auth] Erro ao buscar tenants:', tenantError);
      res.status(500).json({ error: 'Erro interno de autenticação' });
      return;
    }

    // Injeta dados no request
    req.userId = data.user.id;
    req.userEmail = data.user.email;
    req.accessToken = token;
    req.tenantIds = (tenants || []).map((t) => t.tenant_id);
    req.tenantRoles = {};
    for (const t of tenants || []) {
      req.tenantRoles[t.tenant_id] = t.role;
    }

    if (req.tenantIds.length === 0) {
      res.status(403).json({ error: 'Usuário não vinculado a nenhum tenant' });
      return;
    }

    next();
  } catch (err) {
    console.error('[auth] Erro inesperado:', err);
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
}

// Middleware que exige tenant_id no header ou query + resolve role e subclubs
export async function requireTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string);

  if (!tenantId) {
    res.status(400).json({ error: 'Header X-Tenant-Id obrigatório' });
    return;
  }

  if (!req.tenantIds?.includes(tenantId)) {
    res.status(403).json({ error: 'Acesso negado a este tenant' });
    return;
  }

  // Injeta tenant ativo + role
  req.tenantId = tenantId;
  const role = req.tenantRoles?.[tenantId] || 'FINANCEIRO';
  req.userRole = role;

  // Resolve subclubs permitidos
  if (FULL_ACCESS_ROLES.includes(role)) {
    req.allowedSubclubIds = null; // null = acesso total
  } else {
    try {
      const { data } = await supabaseAdmin
        .from('user_org_access')
        .select('org_id')
        .eq('user_id', req.userId!)
        .eq('tenant_id', tenantId);
      req.allowedSubclubIds = (data || []).map((r) => r.org_id);
    } catch (err) {
      console.error('[auth] Erro ao buscar org_access:', err);
      req.allowedSubclubIds = [];
    }
  }

  next();
}

// Factory middleware: restringe acesso a determinados roles
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({
        success: false,
        error: 'Sem permissão para esta ação',
      });
      return;
    }
    next();
  };
}
