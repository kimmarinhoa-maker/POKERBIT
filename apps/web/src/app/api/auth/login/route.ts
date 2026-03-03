// ══════════════════════════════════════════════════════════════════════
//  POST /api/auth/login — No auth, direct supabaseAdmin
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { buildTenantList } from '@/lib/server/auth';

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
      .select('tenant_id, role, tenants!inner(id, name, slug, has_subclubs, status)')
      .eq('user_id', data.user.id)
      .eq('is_active', true);

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
        tenants: await buildTenantList(data.user.id, tenants),
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
