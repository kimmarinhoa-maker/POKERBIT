// ══════════════════════════════════════════════════════════════════════
//  Permissions Routes — CRUD de permissoes por funcao
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { safeErrorMessage } from '../utils/apiError';
import { logAudit } from '../utils/audit';
import {
  CONFIGURABLE_ROLES,
  ALL_RESOURCES,
  getDefaultPermissionsForRole,
} from '../constants/defaultPermissions';

const router = Router();

const adminOnly = [requireAuth, requireTenant, requireRole('OWNER', 'ADMIN')];
const anyAuth = [requireAuth, requireTenant];

// ─── GET /api/permissions — Todas as permissoes (OWNER/ADMIN) ────────
// Lazy-seed: se nao existir rows no tenant, insere defaults
router.get('/', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    // Check if any rows exist for this tenant
    const { count, error: countErr } = await supabaseAdmin
      .from('role_permissions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (countErr) throw countErr;

    // Lazy-seed defaults if no rows exist
    if (!count || count === 0) {
      const rows: Array<{ tenant_id: string; role: string; resource: string; allowed: boolean }> = [];
      for (const role of CONFIGURABLE_ROLES) {
        const perms = getDefaultPermissionsForRole(role);
        for (const [resource, allowed] of Object.entries(perms)) {
          rows.push({ tenant_id: tenantId, role, resource, allowed });
        }
      }
      const { error: seedErr } = await supabaseAdmin.from('role_permissions').insert(rows);
      if (seedErr) throw seedErr;
    }

    // Fetch all permissions for this tenant
    const { data, error } = await supabaseAdmin
      .from('role_permissions')
      .select('role, resource, allowed')
      .eq('tenant_id', tenantId)
      .order('role')
      .order('resource');

    if (error) throw error;

    // Group by role
    const result: Record<string, Record<string, boolean>> = {};
    for (const role of CONFIGURABLE_ROLES) {
      result[role] = getDefaultPermissionsForRole(role); // start with defaults
    }
    for (const row of data || []) {
      if (!result[row.role]) result[row.role] = {};
      result[row.role][row.resource] = row.allowed;
    }

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── PUT /api/permissions — Atualizar permissoes de uma role ─────────
router.put('/', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { role, permissions } = req.body;

    if (!role || !CONFIGURABLE_ROLES.includes(role)) {
      res.status(400).json({
        success: false,
        error: `Role invalido. Use: ${CONFIGURABLE_ROLES.join(', ')}`,
      });
      return;
    }

    if (!permissions || typeof permissions !== 'object') {
      res.status(400).json({ success: false, error: 'permissions deve ser um objeto { resource: boolean }' });
      return;
    }

    // Validate resources
    const validResources = new Set<string>(ALL_RESOURCES);
    const entries = Object.entries(permissions).filter(([key]) => validResources.has(key));

    if (entries.length === 0) {
      res.status(400).json({ success: false, error: 'Nenhum resource valido fornecido' });
      return;
    }

    // Upsert each permission
    const rows = entries.map(([resource, allowed]) => ({
      tenant_id: tenantId,
      role,
      resource,
      allowed: Boolean(allowed),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from('role_permissions')
      .upsert(rows, { onConflict: 'tenant_id,role,resource' });

    if (error) throw error;

    logAudit(req, 'UPDATE', 'role_permission', role, undefined, permissions);
    res.json({ success: true, data: { role, updated: entries.length } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── GET /api/permissions/my — Permissoes do usuario logado ──────────
router.get('/my', ...anyAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const role = req.userRole || 'FINANCEIRO';

    // OWNER always has full access — no need for DB query
    if (role === 'OWNER') {
      const result: Record<string, boolean> = {};
      for (const resource of ALL_RESOURCES) {
        result[resource] = true;
      }
      res.json({ success: true, data: result });
      return;
    }

    // Fetch permissions for this role in this tenant
    const { data, error } = await supabaseAdmin
      .from('role_permissions')
      .select('resource, allowed')
      .eq('tenant_id', tenantId)
      .eq('role', role);

    if (error) throw error;

    // Start with defaults, override with DB values
    const result = getDefaultPermissionsForRole(role);
    for (const row of data || []) {
      result[row.resource] = row.allowed;
    }

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

export default router;
