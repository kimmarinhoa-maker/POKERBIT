// ══════════════════════════════════════════════════════════════════════
//  POST /api/chippix/import-extrato — Direct import XLSX -> ledger
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
        const { file } = await parseFileUpload(req, 'file', {
          maxSize: 10 * 1024 * 1024,
          allowedExtensions: ['xlsx', 'xls'],
        });

        if (!file) {
          return NextResponse.json(
            { success: false, error: 'Arquivo XLSX obrigatorio' },
            { status: 400 },
          );
        }

        const result = await chipPixService.importExtrato(
          ctx.tenantId,
          file.buffer,
          ctx.userId,
        );

        return NextResponse.json({ success: true, data: result });
      } catch (err: unknown) {
        const msg = safeErrorMessage(err);
        const status = msg.includes('Semana incorreta') ? 400 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'], permissions: ['tab:conciliacao'] },
  );
}
