// ══════════════════════════════════════════════════════════════════════
//  PUT /api/players/:id/rate — Update player rakeback rate
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { logAudit } from '@/lib/server/audit';

type Params = { params: Promise<{ id: string }> };

const playerRateSchema = z.object({
  rate: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().min(0).max(100)),
  effective_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: playerId } = await params;
        const body = await req.json();
        const parsed = playerRateSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Rate deve ser um numero entre 0 e 100', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const numRate = parsed.data.rate as number;
        const dateFrom = parsed.data.effective_from || new Date().toISOString().split('T')[0];

        // Check if rate already exists for this date
        const { data: existing } = await supabaseAdmin
          .from('player_rb_rates')
          .select('id')
          .eq('tenant_id', ctx.tenantId)
          .eq('player_id', playerId)
          .eq('effective_from', dateFrom)
          .maybeSingle();

        let data;
        if (existing) {
          const { data: updated, error } = await supabaseAdmin
            .from('player_rb_rates')
            .update({ rate: numRate, effective_to: null })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          data = updated;
        } else {
          // Close previous rate
          await supabaseAdmin
            .from('player_rb_rates')
            .update({ effective_to: dateFrom })
            .eq('tenant_id', ctx.tenantId)
            .eq('player_id', playerId)
            .is('effective_to', null);

          // Insert new rate
          const { data: inserted, error } = await supabaseAdmin
            .from('player_rb_rates')
            .insert({
              tenant_id: ctx.tenantId,
              player_id: playerId,
              rate: numRate,
              effective_from: dateFrom,
              created_by: ctx.userId,
            })
            .select()
            .single();
          if (error) throw error;
          data = inserted;
        }

        logAudit(req, ctx, 'UPDATE', 'player_rb_rate', playerId, undefined, {
          rate: numRate,
          effective_from: dateFrom,
        });

        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        console.error('[PUT player/:id/rate] Error:', err);
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['page:players'] },
  );
}
