// ══════════════════════════════════════════════════════════════════════
//  POST /api/auth/refresh — No auth, direct supabaseAdmin
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refresh_token } = body || {};

    if (!refresh_token) {
      return NextResponse.json(
        { success: false, error: 'refresh_token obrigatório' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { success: false, error: 'Token expirado ou inválido' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: safeErrorMessage(err, 'Erro interno do servidor') },
      { status: 500 },
    );
  }
}
