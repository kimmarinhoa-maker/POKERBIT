// ══════════════════════════════════════════════════════════════════════
//  UUID Validation Middleware — Validates :id params are valid UUIDs
// ══════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware factory: validates that specified route params are valid UUIDs.
 * Usage: validateUuid('id') or validateUuid('id', 'entryId')
 */
export function validateUuid(...params: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const param of params) {
      const val = req.params[param];
      if (val && !UUID_RE.test(val)) {
        res.status(400).json({
          success: false,
          error: `Parametro "${param}" deve ser um UUID valido`,
        });
        return;
      }
    }
    next();
  };
}
