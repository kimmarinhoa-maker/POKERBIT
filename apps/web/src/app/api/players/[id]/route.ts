// ══════════════════════════════════════════════════════════════════════
//  PATCH /api/players/:id — Update player data (full_name, phone, email)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { logAudit } from '@/lib/server/audit';

type Params = { params: Promise<{ id: string }> };

const patchPlayerSchema = z.object({
  full_name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: playerId } = await params;
        const body = await req.json();
        const parsed = patchPlayerSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const { full_name, phone, email } = parsed.data;
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (full_name !== undefined) updates.full_name = full_name || null;

        if (phone !== undefined || email !== undefined) {
          const { data: current, error: fetchErr } = await supabaseAdmin
            .from('players')
            .select('metadata')
            .eq('id', playerId)
            .eq('tenant_id', ctx.tenantId)
            .single();

          if (fetchErr) throw fetchErr;

          const meta = (current?.metadata as Record<string, any>) || {};
          if (phone !== undefined) meta.phone = phone || null;
          if (email !== undefined) meta.email = email || null;
          updates.metadata = meta;
        }

        const { data, error } = await supabaseAdmin
          .from('players')
          .update(updates)
          .eq('id', playerId)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;

        logAudit(req, ctx, 'UPDATE', 'player', playerId, undefined, { full_name, phone, email });

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['page:players'] },
  );
}
