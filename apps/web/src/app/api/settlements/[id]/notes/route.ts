// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/settlements/:id/notes — Atualizar notas
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { logAudit } from '@/lib/server/audit';

const uuidParam = z.string().uuid();
const notesSchema = z.object({ notes: z.string().nullable() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;

        const idParsed = uuidParam.safeParse(id);
        if (!idParsed.success) {
          return NextResponse.json(
            { success: false, error: 'ID invalido' },
            { status: 400 },
          );
        }

        const body = await req.json();
        const parsed = notesSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            {
              success: false,
              error: 'Campo "notes" deve ser string ou null',
              details: parsed.error.flatten().fieldErrors,
            },
            { status: 400 },
          );
        }

        const { notes } = parsed.data;

        const { data, error } = await supabaseAdmin
          .from('settlements')
          .update({ notes: notes || null })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .select('id, notes')
          .single();

        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            { success: false, error: 'Settlement nao encontrado' },
            { status: 404 },
          );
        }

        logAudit(req, ctx, 'UPDATE', 'settlement', id, undefined, { notes });
        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['page:overview'] },
  );
}
