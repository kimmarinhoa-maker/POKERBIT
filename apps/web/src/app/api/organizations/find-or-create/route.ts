// ══════════════════════════════════════════════════════════════════════
//  POST /api/organizations/find-or-create
//  Import-first: find club by (platform + external_id) or create new
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

const bodySchema = z.object({
  platform: z.enum(['suprema', 'pppoker', 'clubgg']),
  external_id: z.string().min(1),
  league_id: z.string().optional(),
  name: z.string().optional(), // fallback name if creating
});

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const { platform, external_id, league_id, name } = parsed.data;

        // 1. Try to find existing club by (league_id + external_id) — most specific
        if (league_id) {
          const { data: byLeague } = await supabaseAdmin
            .from('organizations')
            .select('id, name, external_id, platform, league_id, metadata')
            .eq('tenant_id', ctx.tenantId)
            .eq('type', 'CLUB')
            .eq('league_id', league_id)
            .eq('external_id', external_id)
            .eq('is_active', true)
            .maybeSingle();

          if (byLeague) {
            // Backfill platform if missing
            if (!byLeague.platform) {
              await supabaseAdmin
                .from('organizations')
                .update({ platform, metadata: { ...(byLeague.metadata as Record<string, unknown> || {}), platform } })
                .eq('id', byLeague.id);
            }
            return NextResponse.json({
              success: true,
              data: { ...byLeague, platform: byLeague.platform || platform, created: false },
            });
          }
        }

        // 2. Fallback: find by (platform + external_id)
        const { data: existing } = await supabaseAdmin
          .from('organizations')
          .select('id, name, external_id, platform, league_id, metadata')
          .eq('tenant_id', ctx.tenantId)
          .eq('type', 'CLUB')
          .eq('external_id', external_id)
          .eq('platform', platform)
          .eq('is_active', true)
          .maybeSingle();

        if (existing) {
          if (league_id && !existing.league_id) {
            await supabaseAdmin
              .from('organizations')
              .update({ league_id })
              .eq('id', existing.id);
          }
          return NextResponse.json({
            success: true,
            data: { ...existing, created: false },
          });
        }

        // 3. Legacy: club with no platform set
        const { data: legacyMatch } = await supabaseAdmin
          .from('organizations')
          .select('id, name, external_id, platform, league_id, metadata')
          .eq('tenant_id', ctx.tenantId)
          .eq('type', 'CLUB')
          .eq('external_id', external_id)
          .eq('is_active', true)
          .is('platform', null)
          .maybeSingle();

        if (legacyMatch) {
          await supabaseAdmin
            .from('organizations')
            .update({
              platform,
              league_id: league_id || legacyMatch.league_id,
              metadata: { ...(legacyMatch.metadata as Record<string, unknown> || {}), platform },
            })
            .eq('id', legacyMatch.id);

          return NextResponse.json({
            success: true,
            data: { ...legacyMatch, platform, league_id, created: false },
          });
        }

        // 3. Create new club
        const clubName = name || `Clube ${external_id} (${platform === 'suprema' ? 'Suprema' : platform === 'pppoker' ? 'PPPoker' : platform})`;

        const { data: newClub, error: insertErr } = await supabaseAdmin
          .from('organizations')
          .insert({
            tenant_id: ctx.tenantId,
            type: 'CLUB',
            name: clubName,
            external_id,
            platform,
            league_id: league_id || null,
            metadata: { platform },
            is_active: true,
          })
          .select('id, name, external_id, platform, league_id, metadata')
          .single();

        if (insertErr || !newClub) {
          return NextResponse.json(
            { success: false, error: `Erro ao criar clube: ${insertErr?.message}` },
            { status: 500 },
          );
        }

        return NextResponse.json({
          success: true,
          data: { ...newClub, created: true },
        }, { status: 201 });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['page:import'] },
  );
}
