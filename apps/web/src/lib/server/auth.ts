// ══════════════════════════════════════════════════════════════════════
//  Auth Middleware — withAuth() wrapper for Next.js API Routes
//
//  Replaces Express requireAuth + requireTenant + requireRole + requirePermission
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase';
import { ALL_RESOURCES, DEFAULT_PERMISSIONS } from './defaultPermissions';

// Roles com acesso total (não precisam de user_org_access)
export const FULL_ACCESS_ROLES = ['OWNER', 'ADMIN'] as const;

export interface AuthContext {
  userId: string;
  userEmail: string;
  accessToken: string;
  tenantId: string;
  tenantIds: string[];
  tenantRoles: Record<string, string>;
  userRole: string;
  allowedSubclubIds: string[] | null; // null = full access
}

export interface AuthOptions {
  roles?: string[];
  permissions?: string[];
  skipTenant?: boolean; // For auth/me which doesn't require tenant
}

type AuthHandler = (ctx: AuthContext) => Promise<NextResponse>;

// In-memory permission cache
const permCache = new Map<string, { perms: Record<string, boolean>; expires: number }>();
const PERM_CACHE_TTL = 60_000;

/**
 * Validates auth, resolves tenant, checks roles/permissions, then calls handler.
 */
export async function withAuth(
  req: NextRequest,
  handler: AuthHandler,
  options?: AuthOptions,
): Promise<NextResponse> {
  // 1. Extract and validate Bearer token
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'Token de autenticacao ausente' },
      { status: 401 },
    );
  }
  const token = authHeader.replace('Bearer ', '');

  try {
    // 2. Validate JWT via Supabase Auth
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return NextResponse.json(
        { success: false, error: 'Token invalido ou expirado' },
        { status: 401 },
      );
    }

    // 3. Fetch tenants + roles
    const { data: tenants, error: tenantError } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', data.user.id)
      .eq('is_active', true);

    if (tenantError) {
      console.error('[auth] Erro ao buscar tenants:', tenantError);
      return NextResponse.json(
        { success: false, error: 'Erro interno de autenticacao' },
        { status: 500 },
      );
    }

    const tenantIds = (tenants || []).map((t) => t.tenant_id);
    const tenantRoles: Record<string, string> = {};
    for (const t of tenants || []) {
      tenantRoles[t.tenant_id] = t.role;
    }

    // For endpoints that don't need tenant (e.g., auth/me, create tenant)
    // Check skipTenant BEFORE tenantIds.length check so new users can create first tenant
    if (options?.skipTenant) {
      return handler({
        userId: data.user.id,
        userEmail: data.user.email!,
        accessToken: token,
        tenantId: tenantIds[0] || '',
        tenantIds,
        tenantRoles,
        userRole: tenantRoles[tenantIds[0]] || 'OWNER',
        allowedSubclubIds: null,
      });
    }

    if (tenantIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Usuario nao vinculado a nenhum tenant' },
        { status: 403 },
      );
    }

    // 4. Validate tenant header
    const tenantId =
      req.headers.get('x-tenant-id') || new URL(req.url).searchParams.get('tenant_id');

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Header X-Tenant-Id obrigatorio' },
        { status: 400 },
      );
    }

    if (!tenantIds.includes(tenantId)) {
      return NextResponse.json(
        { success: false, error: 'Acesso negado a este tenant' },
        { status: 403 },
      );
    }

    const role = tenantRoles[tenantId] || 'FINANCEIRO';

    // 5. Check role restriction
    if (options?.roles && !options.roles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Sem permissao para esta acao' },
        { status: 403 },
      );
    }

    // 6. Check RBAC permission
    if (options?.permissions?.length && role !== 'OWNER') {
      const allowed = await checkPermissions(tenantId, role, options.permissions);
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: 'Sem permissao para este recurso' },
          { status: 403 },
        );
      }
    }

    // 7. Resolve allowed subclub IDs
    let allowedSubclubIds: string[] | null = null;
    if (!(FULL_ACCESS_ROLES as readonly string[]).includes(role)) {
      try {
        const { data: access } = await supabaseAdmin
          .from('user_org_access')
          .select('org_id')
          .eq('user_id', data.user.id)
          .eq('tenant_id', tenantId);
        allowedSubclubIds = (access || []).map((r) => r.org_id);
      } catch (err) {
        console.error('[auth] Erro ao buscar org_access:', err);
        allowedSubclubIds = [];
      }
    }

    return handler({
      userId: data.user.id,
      userEmail: data.user.email!,
      accessToken: token,
      tenantId,
      tenantIds,
      tenantRoles,
      userRole: role,
      allowedSubclubIds,
    });
  } catch (err) {
    console.error('[auth] Erro inesperado:', err);
    return NextResponse.json(
      { success: false, error: 'Erro interno de autenticacao' },
      { status: 500 },
    );
  }
}

/**
 * Shared helper: builds the tenant list with org access + logo for auth responses.
 */
export async function buildTenantList(
  userId: string,
  tenants: any[] | null,
) {
  // Org access map
  const { data: orgAccess } = await supabaseAdmin
    .from('user_org_access')
    .select('tenant_id, org_id, organizations!inner(id, name)')
    .eq('user_id', userId);

  const orgAccessByTenant = new Map<string, { id: string; name: string }[]>();
  for (const oa of orgAccess || []) {
    const tid = oa.tenant_id;
    if (!orgAccessByTenant.has(tid)) orgAccessByTenant.set(tid, []);
    orgAccessByTenant.get(tid)!.push({
      id: (oa as any).organizations.id,
      name: (oa as any).organizations.name,
    });
  }

  // Club org logos
  const tenantIds = (tenants || []).map((t) => t.tenant_id);
  const { data: clubOrgs } = tenantIds.length > 0
    ? await supabaseAdmin
        .from('organizations')
        .select('id, tenant_id, logo_url')
        .in('tenant_id', tenantIds)
        .eq('type', 'CLUB')
    : { data: [] };

  const clubOrgByTenant = new Map<string, { id: string; logo_url: string | null }>();
  for (const org of clubOrgs || []) {
    clubOrgByTenant.set(org.tenant_id, { id: org.id, logo_url: org.logo_url || null });
  }

  return (tenants || []).map((t) => ({
    id: (t as any).tenants.id,
    name: (t as any).tenants.name,
    slug: (t as any).tenants.slug,
    role: t.role,
    status: (t as any).tenants.status || 'active',
    has_subclubs: (t as any).tenants.has_subclubs ?? true,
    logo_url: clubOrgByTenant.get(t.tenant_id)?.logo_url || null,
    club_org_id: clubOrgByTenant.get(t.tenant_id)?.id || null,
    allowed_subclubs: (FULL_ACCESS_ROLES as readonly string[]).includes(t.role)
      ? null
      : orgAccessByTenant.get(t.tenant_id) || [],
  }));
}

async function checkPermissions(
  tenantId: string,
  role: string,
  resources: string[],
): Promise<boolean> {
  const cacheKey = `${tenantId}:${role}`;
  let entry = permCache.get(cacheKey);

  if (!entry || Date.now() > entry.expires) {
    try {
      const { data } = await supabaseAdmin
        .from('role_permissions')
        .select('resource, allowed')
        .eq('tenant_id', tenantId)
        .eq('role', role);

      const perms: Record<string, boolean> = {};
      const roleDefaults = (DEFAULT_PERMISSIONS as Record<string, Record<string, boolean>>)[role];
      for (const r of ALL_RESOURCES) {
        perms[r] = roleDefaults?.[r] ?? false;
      }
      for (const row of data || []) {
        perms[row.resource] = row.allowed;
      }

      entry = { perms, expires: Date.now() + PERM_CACHE_TTL };
      permCache.set(cacheKey, entry);
    } catch (err) {
      console.warn('[permission] Failed to fetch, falling back to defaults:', err);
      const perms: Record<string, boolean> = {};
      const roleDefaults = (DEFAULT_PERMISSIONS as Record<string, Record<string, boolean>>)[role];
      for (const r of ALL_RESOURCES) {
        perms[r] = roleDefaults?.[r] ?? false;
      }
      entry = { perms, expires: Date.now() + 10_000 };
      permCache.set(cacheKey, entry);
    }
  }

  return resources.some((r) => entry!.perms[r] !== false);
}
