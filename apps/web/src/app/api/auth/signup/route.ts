// ══════════════════════════════════════════════════════════════════════
//  POST /api/auth/signup — Public (no auth required)
//  Creates: auth user + profile + tenant + user_tenants + CLUB org + default payment methods
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, club_name } = body || {};

    // Validate
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Nome deve ter pelo menos 2 caracteres' },
        { status: 400 },
      );
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Email invalido' },
        { status: 400 },
      );
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Senha deve ter pelo menos 6 caracteres' },
        { status: 400 },
      );
    }
    if (!club_name || typeof club_name !== 'string' || club_name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Nome do clube deve ter pelo menos 2 caracteres' },
        { status: 400 },
      );
    }

    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message?.includes('already been registered')) {
        return NextResponse.json(
          { success: false, error: 'Este email ja esta cadastrado' },
          { status: 409 },
        );
      }
      throw authError;
    }

    const userId = authData.user.id;

    // 2. Create user profile
    await supabaseAdmin.from('user_profiles').insert({
      id: userId,
      full_name: name.trim(),
      email: email.trim().toLowerCase(),
    });

    // 3. Create tenant with unique slug
    const slug =
      club_name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
      '-' +
      Date.now().toString(36);

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({ name: club_name.trim(), slug, status: 'pending' })
      .select('id, name, slug, has_subclubs, status')
      .single();

    if (tenantError) throw tenantError;

    // 4. Link user as OWNER
    await supabaseAdmin.from('user_tenants').insert({
      user_id: userId,
      tenant_id: tenant.id,
      role: 'OWNER',
    });

    // 5. Create CLUB organization
    await supabaseAdmin.from('organizations').insert({
      tenant_id: tenant.id,
      type: 'CLUB',
      name: club_name.trim(),
    });

    // 6. Seed default payment methods
    await supabaseAdmin.from('payment_methods').insert([
      { tenant_id: tenant.id, name: 'PIX', is_default: true, sort_order: 1 },
      { tenant_id: tenant.id, name: 'ChipPix', is_default: false, sort_order: 2 },
      { tenant_id: tenant.id, name: 'Cash', is_default: false, sort_order: 3 },
    ]);

    // 7. Sign in to get session tokens
    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (signInError) throw signInError;

    // Return same shape as login endpoint
    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: userId,
            email: email.trim().toLowerCase(),
          },
          session: {
            access_token: signInData.session.access_token,
            refresh_token: signInData.session.refresh_token,
            expires_at: signInData.session.expires_at,
          },
          tenants: [
            {
              id: tenant.id,
              name: tenant.name,
              slug: tenant.slug,
              role: 'OWNER',
              status: tenant.status || 'pending',
              has_subclubs: tenant.has_subclubs ?? true,
              allowed_subclubs: null,
            },
          ],
          needsOnboarding: true,
        },
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error('[signup] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(err, 'Erro ao criar conta') },
      { status: 500 },
    );
  }
}
