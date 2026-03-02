// ══════════════════════════════════════════════════════════════════════
//  Audit Trail — Fire-and-forget audit logging (Next.js API Routes)
// ══════════════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import type { AuthContext } from './auth';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'FINALIZE' | 'VOID';

export function logAudit(
  req: NextRequest,
  ctx: AuthContext,
  action: AuditAction,
  entityType: string,
  entityId: string,
  oldData?: any,
  newData?: any,
): void {
  supabaseAdmin
    .from('audit_log')
    .insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_data: oldData || null,
      new_data: newData || null,
      ip_address: req.headers.get('x-forwarded-for') || null,
      user_agent: req.headers.get('user-agent') || null,
    })
    .then(
      () => {},
      (err: any) => console.warn('[audit]', err),
    );
}
