// ══════════════════════════════════════════════════════════════════════
//  GET/POST /api/config/club-platforms — Club Platforms CRUD
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('club_platforms')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .order('is_primary', { ascending: false })
        .order('created_at');

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { platform, club_name, club_external_id, is_primary, organization_id } = body;

        if (!platform || typeof platform !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Campo "platform" obrigatório' },
            { status: 400 },
          );
        }

        // If no organization_id provided, use the CLUB org for this tenant
        let orgId = organization_id;
        if (!orgId) {
          const { data: club } = await supabaseAdmin
            .from('organizations')
            .select('id')
            .eq('tenant_id', ctx.tenantId)
            .eq('type', 'CLUB')
            .limit(1)
            .single();

          if (!club) {
            return NextResponse.json(
              { success: false, error: 'Clube não encontrado para este tenant' },
              { status: 404 },
            );
          }
          orgId = club.id;
        }

        const { data, error } = await supabaseAdmin
          .from('club_platforms')
          .insert({
            tenant_id: ctx.tenantId,
            organization_id: orgId,
            platform: platform.trim(),
            club_name: club_name?.trim() || null,
            club_external_id: club_external_id?.trim() || null,
            is_primary: !!is_primary,
          })
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data }, { status: 201 });
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
