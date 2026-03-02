// ══════════════════════════════════════════════════════════════════════
//  GET/PUT /api/permissions — CRUD de permissoes por funcao
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';
import {
  CONFIGURABLE_ROLES,
  ALL_RESOURCES,
  getDefaultPermissionsForRole,
} from '@/lib/server/defaultPermissions';

// ─── GET /api/permissions — Todas as permissoes (OWNER/ADMIN) ────────
// Lazy-seed: se nao existir rows no tenant, insere defaults
export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        // Check if any rows exist for this tenant
        const { count, error: countErr } = await supabaseAdmin
          .from('role_permissions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId);

        if (countErr) throw countErr;

        // Lazy-seed defaults if no rows exist
        if (!count || count === 0) {
          const rows: Array<{
            tenant_id: string;
            role: string;
            resource: string;
            allowed: boolean;
          }> = [];
          for (const role of CONFIGURABLE_ROLES) {
            const perms = getDefaultPermissionsForRole(role);
            for (const [resource, allowed] of Object.entries(perms)) {
              rows.push({ tenant_id: ctx.tenantId, role, resource, allowed });
            }
          }
          const { error: seedErr } = await supabaseAdmin
            .from('role_permissions')
            .insert(rows);
          if (seedErr) throw seedErr;
        }

        // Fetch all permissions for this tenant
        const { data, error } = await supabaseAdmin
          .from('role_permissions')
          .select('role, resource, allowed')
          .eq('tenant_id', ctx.tenantId)
          .order('role')
          .order('resource');

        if (error) throw error;

        // Group by role
        const result: Record<string, Record<string, boolean>> = {};
        for (const role of CONFIGURABLE_ROLES) {
          result[role] = getDefaultPermissionsForRole(role); // start with defaults
        }
        for (const row of data || []) {
          if (!result[row.role]) result[row.role] = {};
          result[row.role][row.resource] = row.allowed;
        }

        return NextResponse.json({ success: true, data: result });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}

// ─── PUT /api/permissions — Atualizar permissoes de uma role ─────────
export async function PUT(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { role, permissions } = body;

        if (!role || !CONFIGURABLE_ROLES.includes(role)) {
          return NextResponse.json(
            {
              success: false,
              error: `Role invalido. Use: ${CONFIGURABLE_ROLES.join(', ')}`,
            },
            { status: 400 },
          );
        }

        if (!permissions || typeof permissions !== 'object') {
          return NextResponse.json(
            {
              success: false,
              error: 'permissions deve ser um objeto { resource: boolean }',
            },
            { status: 400 },
          );
        }

        // Validate resources
        const validResources = new Set<string>(ALL_RESOURCES);
        const entries = Object.entries(permissions).filter(([key]) =>
          validResources.has(key),
        );

        if (entries.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Nenhum resource valido fornecido' },
            { status: 400 },
          );
        }

        // Upsert each permission
        const rows = entries.map(([resource, allowed]) => ({
          tenant_id: ctx.tenantId,
          role,
          resource,
          allowed: Boolean(allowed),
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabaseAdmin
          .from('role_permissions')
          .upsert(rows, { onConflict: 'tenant_id,role,resource' });

        if (error) throw error;

        logAudit(req, ctx, 'UPDATE', 'role_permission', role, undefined, permissions);
        return NextResponse.json({
          success: true,
          data: { role, updated: entries.length },
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}
