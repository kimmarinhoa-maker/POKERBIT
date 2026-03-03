// ══════════════════════════════════════════════════════════════════════
//  PUT/DELETE /api/config/club-platforms/[id]
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const { club_name, club_external_id } = body;

        const update: Record<string, any> = {};
        if (club_name !== undefined) update.club_name = club_name?.trim() || null;
        if (club_external_id !== undefined) update.club_external_id = club_external_id?.trim() || null;

        if (Object.keys(update).length === 0) {
          return NextResponse.json(
            { success: false, error: 'Nenhum campo para atualizar' },
            { status: 400 },
          );
        }

        const { data, error } = await supabaseAdmin
          .from('club_platforms')
          .update(update)
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;

        // Guard: refuse deletion if settlements reference this platform
        const { count } = await supabaseAdmin
          .from('settlements')
          .select('id', { count: 'exact', head: true })
          .eq('club_platform_id', id)
          .eq('tenant_id', ctx.tenantId);

        if (count && count > 0) {
          return NextResponse.json(
            { success: false, error: `Nao e possivel deletar: ${count} settlement(s) vinculado(s) a esta plataforma` },
            { status: 409 },
          );
        }

        const { error } = await supabaseAdmin
          .from('club_platforms')
          .delete()
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        return NextResponse.json({ success: true, data: { deleted: true } });
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
