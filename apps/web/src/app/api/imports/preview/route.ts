// ══════════════════════════════════════════════════════════════════════
//  POST /api/imports/preview — Analyze XLSX without persisting
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { parseFileUpload } from '@/lib/server/parseFormData';
import { supabaseAdmin } from '@/lib/server/supabase';
import { importPreviewService } from '@/lib/services/importPreview.service';

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

        const weekStartOverride = fields.week_start || undefined;
        const platform = fields.platform || 'suprema';

        const preview = await importPreviewService.preview({
          tenantId: ctx.tenantId,
          fileBuffer: file.buffer,
          fileName: file.originalname,
          weekStartOverride,
          platform,
        });

        // Also return tenant subclubs for binding dropdowns
        const { data: subclubs } = await supabaseAdmin
          .from('organizations')
          .select('id, name')
          .eq('tenant_id', ctx.tenantId)
          .eq('type', 'SUBCLUB')
          .eq('is_active', true)
          .order('name');

        return NextResponse.json({
          success: true,
          data: {
            ...preview,
            available_subclubs: subclubs || [],
          },
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { permissions: ['page:import'] },
  );
}
