// ══════════════════════════════════════════════════════════════════════
//  GET /api/permissions/my — Permissoes do usuario logado
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import {
  ALL_RESOURCES,
  getDefaultPermissionsForRole,
} from '@/lib/server/defaultPermissions';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const role = ctx.userRole || 'FINANCEIRO';

      // OWNER always has full access — no need for DB query
      if (role === 'OWNER') {
        const result: Record<string, boolean> = {};
        for (const resource of ALL_RESOURCES) {
          result[resource] = true;
        }
        return NextResponse.json({ success: true, data: result });
      }

      // Fetch permissions for this role in this tenant
      const { data, error } = await supabaseAdmin
        .from('role_permissions')
        .select('resource, allowed')
        .eq('tenant_id', ctx.tenantId)
        .eq('role', role);

      if (error) throw error;

      // Start with defaults, override with DB values
      const result = getDefaultPermissionsForRole(role);
      for (const row of data || []) {
        result[row.resource] = row.allowed;
      }

      return NextResponse.json({ success: true, data: result });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
