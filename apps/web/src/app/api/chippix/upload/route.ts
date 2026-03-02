// ══════════════════════════════════════════════════════════════════════
//  POST /api/chippix/upload — Upload + parse XLSX ChipPix
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { parseFileUpload } from '@/lib/server/parseFormData';
import { chipPixService } from '@/lib/services/chippix.service';

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

        const weekStart = fields.week_start || '';
        const clubId = fields.club_id || undefined;

        const result = await chipPixService.uploadChipPix(
          ctx.tenantId,
          file.buffer,
          file.originalname,
          weekStart,
          clubId,
        );

        return NextResponse.json({ success: true, data: result });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['tab:conciliacao'] },
  );
}
