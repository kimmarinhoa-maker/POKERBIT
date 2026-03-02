// ══════════════════════════════════════════════════════════════════════
//  POST /api/imports/confirm — Persist settlement (only if ready=true)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { parseFileUpload } from '@/lib/server/parseFormData';
import { supabaseAdmin } from '@/lib/server/supabase';
import { importConfirmService, ConfirmError } from '@/lib/services/importConfirm.service';
import { logAudit } from '@/lib/server/audit';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { file, fields } = await parseFileUpload(req, 'file', {
          maxSize: 10 * 1024 * 1024,
          allowedExtensions: ['xlsx', 'xls'],
        });

        if (!file) {
          return NextResponse.json(
            { success: false, error: 'Arquivo XLSX obrigatorio' },
            { status: 400 },
          );
        }

        const club_id = fields.club_id;
        const week_start = fields.week_start;

        // Validate required fields
        if (
          !club_id ||
          !week_start ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(club_id) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(week_start)
        ) {
          return NextResponse.json(
            {
              success: false,
              error: 'Dados invalidos: club_id (uuid) e week_start (YYYY-MM-DD) obrigatorios',
              details: {
                club_id: !club_id ? ['Required'] : [],
                week_start: !week_start ? ['Required'] : [],
              },
            },
            { status: 400 },
          );
        }

        // Validate club belongs to this tenant
        const { data: club } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('id', club_id)
          .eq('tenant_id', ctx.tenantId)
          .eq('type', 'CLUB')
          .single();

        if (!club) {
          return NextResponse.json(
            { success: false, error: 'Club nao pertence a este tenant' },
            { status: 400 },
          );
        }

        const platform = fields.platform || 'suprema';

        const result = await importConfirmService.confirm({
          tenantId: ctx.tenantId,
          clubId: club_id,
          weekStart: week_start,
          fileName: file.originalname,
          fileBuffer: file.buffer,
          uploadedBy: ctx.userId,
          platform,
        });

        logAudit(req, ctx, 'CREATE', 'settlement', result.settlement_id || '', undefined, {
          club_id,
          week_start,
          fileName: file.originalname,
        });

        return NextResponse.json({ success: true, data: result }, { status: 201 });
      } catch (err: unknown) {
        if (err instanceof ConfirmError) {
          return NextResponse.json(
            { success: false, error: err.message },
            { status: err.status },
          );
        }

        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['page:import'] },
  );
}
