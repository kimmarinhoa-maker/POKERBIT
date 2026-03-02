// ══════════════════════════════════════════════════════════════════════
//  POST /api/ofx/upload — Upload + parse OFX file
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { parseFileUpload } from '@/lib/server/parseFormData';
import { ofxService } from '@/lib/services/ofx.service';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { file, fields } = await parseFileUpload(req, 'file', {
          maxSize: 5 * 1024 * 1024,
          allowedExtensions: ['ofx'],
        });

        if (!file) {
          return NextResponse.json(
            { success: false, error: 'Arquivo OFX obrigatorio' },
            { status: 400 },
          );
        }

        const raw = file.buffer.toString('utf-8');
        const weekStart = fields.week_start || undefined;

        const result = await ofxService.uploadOFX(
          ctx.tenantId,
          raw,
          file.originalname,
          weekStart,
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
