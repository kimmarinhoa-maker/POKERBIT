import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp';

// ── Mock settlement service ──────────────────────────────────────────
const mockService = {
  listWeeks: vi.fn(),
  getSettlementDetail: vi.fn(),
  getSettlementWithSubclubs: vi.fn(),
  finalizeSettlement: vi.fn(),
  voidSettlement: vi.fn(),
};

vi.mock('../../services/settlement.service', () => ({
  settlementService: mockService,
}));

// Mock supabase for routes that use it directly (notes, payment-type, etc.)
const mockChain: any = {};
['select', 'insert', 'update', 'delete', 'eq', 'is', 'single', 'order', 'limit'].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.then = (resolve: Function) => {
  resolve(mockChain._result || { data: null, error: null });
  return mockChain;
};
mockChain._result = { data: null, error: null };

vi.mock('../../config/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => mockChain),
  },
}));

// Mock auth middleware to pass through (testApp injects auth context)
vi.mock('../../middleware/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireTenant: (_req: any, _res: any, next: any) => next(),
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => {
    if (_req.userRole && _roles.includes(_req.userRole)) return next();
    return _res.status(403).json({ success: false, error: 'Sem permissão para esta ação' });
  },
}));

const settlementRoutes = (await import('../../routes/settlement.routes')).default;

// ── Tests ────────────────────────────────────────────────────────────
describe('Settlement Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._result = { data: null, error: null };
  });

  // ─── GET /api/settlements ──────────────────────────────────────────
  describe('GET /api/settlements', () => {
    it('lista settlements', async () => {
      mockService.listWeeks.mockResolvedValue([
        { id: 's1', week_start: '2024-01-01', status: 'DRAFT' },
      ]);

      const { app } = createTestApp();
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app).get('/api/settlements');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('passa filtros para service', async () => {
      mockService.listWeeks.mockResolvedValue([]);
      const { app } = createTestApp();
      app.use('/api/settlements', settlementRoutes);

      await request(app).get('/api/settlements?club_id=c1&start_date=2024-01-01&end_date=2024-01-07');
      expect(mockService.listWeeks).toHaveBeenCalledWith(
        'test-tenant-id', 'c1', '2024-01-01', '2024-01-07',
      );
    });

    it('erro do service → 500', async () => {
      mockService.listWeeks.mockRejectedValue(new Error('DB error'));
      const { app } = createTestApp();
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app).get('/api/settlements');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── GET /api/settlements/:id/full ────────────────────────────────
  describe('GET /api/settlements/:id/full', () => {
    it('retorna settlement com subclubs', async () => {
      mockService.getSettlementWithSubclubs.mockResolvedValue({
        id: 's1',
        subclubs: [{ name: 'IMPERIO' }],
      });
      const { app } = createTestApp();
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app).get('/api/settlements/s1/full');
      expect(res.status).toBe(200);
      expect(res.body.data.subclubs).toHaveLength(1);
    });

    it('nao encontrado → 404', async () => {
      mockService.getSettlementWithSubclubs.mockResolvedValue(null);
      const { app } = createTestApp();
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app).get('/api/settlements/not-found/full');
      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /api/settlements/:id/notes ─────────────────────────────
  describe('PATCH /api/settlements/:id/notes', () => {
    it('FINANCEIRO pode atualizar notas', async () => {
      mockChain._result = { data: { id: 's1', notes: 'hello' }, error: null };
      const { app } = createTestApp({ userRole: 'FINANCEIRO' });
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app)
        .patch('/api/settlements/s1/notes')
        .send({ notes: 'hello' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('AUDITOR nao pode atualizar notas → 403', async () => {
      const { app } = createTestApp({ userRole: 'AUDITOR' });
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app)
        .patch('/api/settlements/s1/notes')
        .send({ notes: 'hack' });
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/settlements/:id/finalize ───────────────────────────
  describe('POST /api/settlements/:id/finalize', () => {
    it('DRAFT → FINAL com sucesso', async () => {
      mockService.finalizeSettlement.mockResolvedValue({ id: 's1', status: 'FINAL' });
      const { app } = createTestApp({ userRole: 'OWNER' });
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app).post('/api/settlements/s1/finalize');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FINAL');
    });

    it('non-DRAFT → 422', async () => {
      mockService.finalizeSettlement.mockRejectedValue(new Error('Settlement não pode ser finalizado'));
      const { app } = createTestApp({ userRole: 'OWNER' });
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app).post('/api/settlements/s1/finalize');
      expect(res.status).toBe(422);
    });

    it('FINANCEIRO nao pode finalizar → 403', async () => {
      const { app } = createTestApp({ userRole: 'FINANCEIRO' });
      app.use('/api/settlements', settlementRoutes);

      const res = await request(app).post('/api/settlements/s1/finalize');
      expect(res.status).toBe(403);
    });
  });
});
