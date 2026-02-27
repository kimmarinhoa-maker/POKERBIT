// ══════════════════════════════════════════════════════════════════════
//  Backend RBAC Middleware — requirePermission()
//
//  Checks role_permissions table (with in-memory cache).
//  OWNER role always bypasses.
// ══════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ALL_RESOURCES, DEFAULT_PERMISSIONS } from '../constants/defaultPermissions';

// In-memory cache: Map<tenantId:role, { perms, expires }>
const permCache = new Map<string, { perms: Record<string, boolean>; expires: number }>();
const CACHE_TTL = 60_000; // 1 min

/**
 * Middleware factory that checks if the current user's role has permission
 * for at least one of the specified resources.
 *
 * Usage: `requirePermission('page:import')` or `requirePermission('tab:extrato', 'tab:conciliacao')`
 */
export function requirePermission(...resources: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const role = req.userRole;

    // OWNER bypasses everything
    if (role === 'OWNER') return next();

    if (!role || !req.tenantId) {
      res.status(403).json({ success: false, error: 'Sem permissao para este recurso' });
      return;
    }

    const cacheKey = `${req.tenantId}:${role}`;
    let entry = permCache.get(cacheKey);

    if (!entry || Date.now() > entry.expires) {
      try {
        const { data } = await supabaseAdmin
          .from('role_permissions')
          .select('resource, allowed')
          .eq('tenant_id', req.tenantId)
          .eq('role', role);

        const perms: Record<string, boolean> = {};
        // Apply defaults first
        const roleDefaults = (DEFAULT_PERMISSIONS as Record<string, Record<string, boolean>>)[role];
        for (const r of ALL_RESOURCES) {
          perms[r] = roleDefaults?.[r] ?? false;
        }
        // DB overrides
        for (const row of data || []) {
          perms[row.resource] = row.allowed;
        }

        entry = { perms, expires: Date.now() + CACHE_TTL };
        permCache.set(cacheKey, entry);
      } catch (err) {
        console.warn('[permission] Failed to fetch permissions, falling back to defaults:', err);
        // Fallback to defaults only
        const perms: Record<string, boolean> = {};
        const roleDefaults = (DEFAULT_PERMISSIONS as Record<string, Record<string, boolean>>)[role];
        for (const r of ALL_RESOURCES) {
          perms[r] = roleDefaults?.[r] ?? false;
        }
        entry = { perms, expires: Date.now() + 10_000 }; // short TTL on error
        permCache.set(cacheKey, entry);
      }
    }

    // Check: at least 1 resource must be allowed
    const allowed = resources.some((r) => entry!.perms[r] !== false);
    if (!allowed) {
      res.status(403).json({ success: false, error: 'Sem permissao para este recurso' });
      return;
    }

    next();
  };
}
