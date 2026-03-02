// ══════════════════════════════════════════════════════════════════════
//  POST /api/users/invite — Convidar novo membro
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';
import { logAudit } from '@/lib/server/audit';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { email, role } = body;

        if (!email || typeof email !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Email obrigatorio' },
            { status: 400 },
          );
        }

        const validRoles = ['ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE'];
        if (!role || !validRoles.includes(role)) {
          return NextResponse.json(
            {
              success: false,
              error: `Role invalido. Use: ${validRoles.join(', ')}`,
            },
            { status: 400 },
          );
        }

        // Buscar usuario por email via auth admin
        let existingUser: { id: string; email?: string | null } | null = null;

        // Estrategia 1: buscar via user_profiles (tabela publica, rapida)
        const { data: profileMatch } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email')
          .eq('email', email.toLowerCase())
          .limit(1)
          .maybeSingle();

        if (profileMatch) {
          existingUser = { id: profileMatch.id, email: profileMatch.email };
        } else {
          // Estrategia 2: fallback via auth admin com paginacao pequena
          const PER_PAGE = 50;
          const MAX_PAGES = 20;
          let page = 1;
          let found = false;
          while (!found && page <= MAX_PAGES) {
            const { data: pageData, error: pageError } =
              await supabaseAdmin.auth.admin.listUsers({
                page,
                perPage: PER_PAGE,
              });
            if (pageError) throw pageError;
            if (!pageData.users || pageData.users.length === 0) break;

            const match = pageData.users.find(
              (u) => u.email?.toLowerCase() === email.toLowerCase(),
            );
            if (match) {
              existingUser = { id: match.id, email: match.email };
              found = true;
            }
            // Se retornou menos que PER_PAGE, nao ha mais paginas
            if (pageData.users.length < PER_PAGE) break;
            page++;
          }
        }

        if (!existingUser) {
          return NextResponse.json({
            success: true,
            data: null,
            pending: true,
            message: 'Convite pendente - usuario precisa fazer signup primeiro',
          });
        }

        // Verificar se ja esta vinculado ao tenant
        const { data: existing } = await supabaseAdmin
          .from('user_tenants')
          .select('id')
          .eq('user_id', existingUser.id)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (existing) {
          return NextResponse.json(
            {
              success: false,
              error: 'Este usuario ja e membro desta organizacao',
            },
            { status: 409 },
          );
        }

        // Criar vinculo
        const { data, error } = await supabaseAdmin
          .from('user_tenants')
          .insert({
            user_id: existingUser.id,
            tenant_id: ctx.tenantId,
            role,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;

        logAudit(req, ctx, 'CREATE', 'user_tenant', data?.id || '', undefined, {
          email,
          role: role || 'FINANCEIRO',
        });
        return NextResponse.json(
          {
            success: true,
            data,
            message: 'Membro adicionado com sucesso',
          },
          { status: 201 },
        );
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
