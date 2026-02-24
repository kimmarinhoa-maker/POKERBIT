import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { createMockSupabase } from '../helpers/mockSupabase';

// ── Mock supabaseAdmin before importing auth middleware ───────────────
const mockSupabase = createMockSupabase();

vi.mock('../../config/supabase', () => ({
  supabaseAdmin: mockSupabase,
}));

// Now import the middleware (it will use our mock)
const { requireAuth, requireTenant, requireRole } = await import('../../middleware/auth');

// ── Helper: create a minimal express app with the middleware under test ─
function makeApp(
  middleware: Array<(req: Request, res: Response, next: NextFunction) => any>,
  handler?: (req: Request, res: Response) => void,
) {
  const app = express();
  app.use(express.json());
  for (const mw of middleware) {
    app.use(mw);
  }
  app.get(
    '/test',
    ...(handler
      ? [handler]
      : [
          (_req: Request, res: Response) => {
            res.json({ ok: true, userId: _req.userId, tenantId: _req.tenantId, userRole: _req.userRole });
          },
        ]),
  );
  return app;
}

// ═══════════════════════════════════════════════════════════════════════
describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sem token → 401', async () => {
    const app = makeApp([requireAuth]);
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('ausente');
  });

  it('token sem "Bearer " prefix → 401', async () => {
    const app = makeApp([requireAuth]);
    const res = await request(app).get('/test').set('Authorization', 'InvalidToken');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('ausente');
  });

  it('token invalido (Supabase rejeita) → 401', async () => {
    mockSupabase._setAuthError('invalid token');
    const app = makeApp([requireAuth]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('inválido');
  });

  it('token valido → injeta userId e continua', async () => {
    mockSupabase._setAuthUser({ id: 'user-123', email: 'test@test.com' });
    mockSupabase._setResult('user_tenants', [
      { tenant_id: 'tenant-1', role: 'OWNER' },
    ]);
    const app = makeApp([requireAuth]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-123');
  });

  it('usuario sem tenants → 403', async () => {
    mockSupabase._setAuthUser({ id: 'user-orphan', email: 'orphan@test.com' });
    mockSupabase._setResult('user_tenants', []);
    const app = makeApp([requireAuth]);
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('tenant');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('requireTenant', () => {
  // For these tests, simulate that requireAuth already ran
  function authInjector(req: Request, _res: Response, next: NextFunction) {
    req.userId = 'user-123';
    req.tenantIds = ['tenant-1', 'tenant-2'];
    req.tenantRoles = { 'tenant-1': 'OWNER', 'tenant-2': 'AGENTE' };
    next();
  }

  it('sem X-Tenant-Id header → 400', async () => {
    const app = makeApp([authInjector, requireTenant]);
    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('X-Tenant-Id');
  });

  it('tenant nao autorizado → 403', async () => {
    const app = makeApp([authInjector, requireTenant]);
    const res = await request(app).get('/test').set('X-Tenant-Id', 'not-allowed');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('negado');
  });

  it('OWNER → allowedSubclubIds = null (full access)', async () => {
    const app = makeApp([authInjector, requireTenant], (req, res) => {
      res.json({ role: req.userRole, subclubs: req.allowedSubclubIds });
    });
    const res = await request(app).get('/test').set('X-Tenant-Id', 'tenant-1');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.subclubs).toBeNull();
  });

  it('AGENTE → busca allowedSubclubIds do banco', async () => {
    mockSupabase._setResult('user_org_access', [
      { org_id: 'org-1' },
      { org_id: 'org-2' },
    ]);
    const app = makeApp([authInjector, requireTenant], (req, res) => {
      res.json({ role: req.userRole, subclubs: req.allowedSubclubIds });
    });
    const res = await request(app).get('/test').set('X-Tenant-Id', 'tenant-2');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('AGENTE');
    expect(res.body.subclubs).toEqual(['org-1', 'org-2']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('requireRole', () => {
  function authInjector(role: string) {
    return (req: Request, _res: Response, next: NextFunction) => {
      req.userRole = role;
      next();
    };
  }

  it('role permitido → passa', async () => {
    const app = makeApp([authInjector('OWNER'), requireRole('OWNER', 'ADMIN')]);
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('role nao permitido → 403', async () => {
    const app = makeApp([authInjector('AUDITOR'), requireRole('OWNER', 'ADMIN')]);
    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('permissão');
  });
});
