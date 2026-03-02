// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/admin/tenants/[id] — Approve/suspend tenant (platform admin)
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

const VALID_STATUSES = ['pending', 'active', 'suspended'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tenantId } = await params;
    const auth = await requirePlatformAdmin(req);
    if ('error' in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const body = await req.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Status invalido. Use: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update({ status })
      .eq('id', tenantId)
      .select('id, name, slug, status')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: safeErrorMessage(err) },
      { status: 500 },
    );
  }
}
