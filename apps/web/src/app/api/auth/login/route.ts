// ══════════════════════════════════════════════════════════════════════
//  POST /api/auth/login — No auth, direct supabaseAdmin
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { FULL_ACCESS_ROLES } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email || !password || typeof email !== 'string' || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Email e senha obrigatórios' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Credenciais inválidas' },
        { status: 401 },
      );
    }

    // Buscar tenants do usuário
    const { data: tenants } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id, role, tenants!inner(id, name, slug, has_subclubs)')
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

    return NextResponse.json({
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
        tenants: (tenants || []).map((t) => ({
          id: (t as any).tenants.id,
          name: (t as any).tenants.name,
          slug: (t as any).tenants.slug,
          role: t.role,
          has_subclubs: (t as any).tenants.has_subclubs ?? true,
          allowed_subclubs: (FULL_ACCESS_ROLES as readonly string[]).includes(t.role)
            ? null
            : orgAccessByTenant.get(t.tenant_id) || [],
        })),
      },
    });
  } catch (err: unknown) {
    console.error('[login] Error:', err instanceof Error ? err.message : err);
    if (err instanceof Error) console.error('[login] Stack:', err.stack);
    const isDev = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';
    const message = isDev && err instanceof Error ? err.message : 'Erro interno do servidor';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
