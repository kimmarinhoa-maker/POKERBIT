// ══════════════════════════════════════════════════════════════════════
//  GET /api/admin/tenants — List all tenants (platform admin only)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

async function requirePlatformAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Token ausente', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { error: 'Token invalido', status: 401 };
  }

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', data.user.id)
    .single();

  if (!profile?.is_platform_admin) {
    return { error: 'Acesso restrito a administradores da plataforma', status: 403 };
  }

  return { userId: data.user.id };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePlatformAdmin(req);
    if ('error' in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const statusFilter = new URL(req.url).searchParams.get('status');

    let query = supabaseAdmin
      .from('tenants')
      .select('id, name, slug, status, created_at, has_subclubs')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: tenants, error } = await query;
    if (error) throw error;

    // Enrich with owner info
    const enriched = await Promise.all(
      (tenants || []).map(async (t) => {
        const { data: owner } = await supabaseAdmin
          .from('user_tenants')
          .select('user_id')
          .eq('tenant_id', t.id)
          .eq('role', 'OWNER')
          .limit(1)
          .maybeSingle();

        let ownerEmail = null;
        if (owner?.user_id) {
          const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('email, full_name')
            .eq('id', owner.user_id)
            .maybeSingle();
          ownerEmail = profile?.email || null;
        }

        // Count members
        const { count } = await supabaseAdmin
          .from('user_tenants')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', t.id)
          .eq('is_active', true);

        return {
          ...t,
          owner_email: ownerEmail,
          member_count: count || 0,
        };
      }),
    );

    return NextResponse.json({ success: true, data: enriched });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: safeErrorMessage(err) },
      { status: 500 },
    );
  }
}
