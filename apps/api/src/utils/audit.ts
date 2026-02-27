// ══════════════════════════════════════════════════════════════════════
//  Audit Trail — Fire-and-forget audit logging
// ══════════════════════════════════════════════════════════════════════

import { Request } from 'express';
import { supabaseAdmin } from '../config/supabase';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'FINALIZE' | 'VOID';

/**
 * Logs an audit entry. Fire-and-forget — does NOT block the handler.
 */
export function logAudit(
  req: Request,
  action: AuditAction,
  entityType: string,
  entityId: string,
  oldData?: any,
  newData?: any,
): void {
  supabaseAdmin
    .from('audit_log')
    .insert({
      tenant_id: req.tenantId,
      user_id: req.userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_data: oldData || null,
      new_data: newData || null,
      ip_address: req.ip || req.headers['x-forwarded-for'] || null,
      user_agent: req.headers['user-agent'] || null,
    })
    .then(
      () => {},
      (err: any) => console.warn('[audit]', err),
    );
}
