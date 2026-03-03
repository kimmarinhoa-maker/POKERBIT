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
        .select('*, organizations!club_platforms_subclub_id_fkey(id, name, logo_url)')
        .eq('tenant_id', ctx.tenantId)
        .order('is_primary', { ascending: false })
        .order('created_at');

      if (error) throw error;

      // Flatten subclub info into top-level fields
      const enriched = (data || []).map((row: any) => {
        const org = row.organizations;
        return {
          ...row,
          subclub_name: org?.name || null,
          subclub_logo_url: org?.logo_url || null,
          organizations: undefined, // remove nested object
        };
      });

      return NextResponse.json({ success: true, data: enriched });
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
        const { platform, club_name, club_external_id, is_primary, organization_id, subclub_id } = body;

        if (!platform || typeof platform !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Campo "platform" obrigatorio' },
            { status: 400 },
          );
        }

        // Validate subclub if provided
        if (subclub_id) {
          const { data: subclub } = await supabaseAdmin
            .from('organizations')
            .select('id')
            .eq('id', subclub_id)
            .eq('tenant_id', ctx.tenantId)
            .in('type', ['SUBCLUB', 'CLUB'])
            .single();

          if (!subclub) {
            return NextResponse.json(
              { success: false, error: 'Subclube nao encontrado para este tenant' },
              { status: 404 },
            );
          }
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
              { success: false, error: 'Clube nao encontrado para este tenant' },
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
            subclub_id: subclub_id || null,
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
