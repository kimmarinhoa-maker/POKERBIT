// ══════════════════════════════════════════════════════════════════════
//  GET /api/users — Lista membros do tenant
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { data, error } = await supabaseAdmin.rpc('get_tenant_users', {
          p_tenant_id: ctx.tenantId,
        });

        // Fallback: query direta se a RPC nao existir
        if (error) {
          // Query direta nas tabelas
          const { data: users, error: queryError } = await supabaseAdmin
            .from('user_tenants')
            .select(
              `
              id,
              user_id,
              role,
              is_active,
              created_at
            `,
            )
            .eq('tenant_id', ctx.tenantId)
            .order('created_at');

          if (queryError) throw queryError;

          // Buscar profiles (com email) em batch — evita N+1 getUserById
          const userIds = (users || []).map((u) => u.user_id);

          const { data: profiles } = await supabaseAdmin
            .from('user_profiles')
            .select('id, full_name, avatar_url, email')
            .in('id', userIds);

          const profileMap = new Map(
            (profiles || []).map((p) => [p.id, p]),
          );

          // Enriquecer com dados do profile (email vem do profile se disponivel)
          const enriched: any[] = [];
          const missingEmailUsers: { index: number; userId: string }[] = [];

          for (const ut of users || []) {
            const profile = profileMap.get(ut.user_id);
            enriched.push({
              ...ut,
              full_name: profile?.full_name || null,
              avatar_url: profile?.avatar_url || null,
              email: profile?.email || null,
            });
            if (!profile?.email) {
              missingEmailUsers.push({
                index: enriched.length - 1,
                userId: ut.user_id,
              });
            }
          }

          // Fallback: buscar emails faltantes via auth admin
          if (missingEmailUsers.length > 0) {
            await Promise.all(
              missingEmailUsers.map(async ({ index, userId }) => {
                try {
                  const { data: authUser } =
                    await supabaseAdmin.auth.admin.getUserById(userId);
                  enriched[index].email = authUser?.user?.email || null;
                } catch (authErr: unknown) {
                  console.warn(
                    `[users] Failed to fetch email for user ${userId}:`,
                    safeErrorMessage(authErr),
                  );
                }
              }),
            );
          }

          return NextResponse.json({ success: true, data: enriched });
        }

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
