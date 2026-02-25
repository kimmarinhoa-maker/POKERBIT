import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp';

// ── Mock ledger service ──────────────────────────────────────────────
const mockService = {
  createEntry: vi.fn(),
  listEntries: vi.fn(),
  calcEntityLedgerNet: vi.fn(),
  deleteEntry: vi.fn(),
  toggleReconciled: vi.fn(),
};

vi.mock('../../services/ledger.service', () => ({
  ledgerService: mockService,
}));

// Mock auth middleware to pass through
vi.mock('../../middleware/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireTenant: (_req: any, _res: any, next: any) => next(),
  requireRole:
    (..._roles: string[]) =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

const ledgerRoutes = (await import('../../routes/ledger.routes')).default;

// ── Tests ────────────────────────────────────────────────────────────
describe('Ledger Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/ledger ─────────────────────────────────────────────
  describe('POST /api/ledger', () => {
    const validBody = {
      entity_id: 'ent-1',
      entity_name: 'Agent Test',
      week_start: '2024-01-01',
      dir: 'IN',
      amount: 500,
      method: 'PIX',
      description: 'Pagamento',
    };

    it('body valido → 201', async () => {
      mockService.createEntry.mockResolvedValue({ id: 'led-1', ...validBody });
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app).post('/api/ledger').send(validBody);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('dir invalido → 400 (Zod validation)', async () => {
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app)
        .post('/api/ledger')
        .send({ ...validBody, dir: 'INVALID' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('amount negativo → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app)
        .post('/api/ledger')
        .send({ ...validBody, amount: -100 });
      expect(res.status).toBe(400);
    });

    it('week_start formato errado → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app)
        .post('/api/ledger')
        .send({ ...validBody, week_start: '01-01-2024' });
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/ledger ──────────────────────────────────────────────
  describe('GET /api/ledger', () => {
    it('com week_start → lista entries', async () => {
      mockService.listEntries.mockResolvedValue([{ id: 'led-1' }]);
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app).get('/api/ledger?week_start=2024-01-01');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('sem week_start → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app).get('/api/ledger');
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/ledger/net ──────────────────────────────────────────
  describe('GET /api/ledger/net', () => {
    it('calculo correto', async () => {
      mockService.calcEntityLedgerNet.mockResolvedValue({ entradas: 500, saidas: 200, net: 300 });
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app).get('/api/ledger/net?week_start=2024-01-01&entity_id=ent-1');
      expect(res.status).toBe(200);
      expect(res.body.data.net).toBe(300);
    });
  });

  // ─── DELETE /api/ledger/:id ───────────────────────────────────────
  describe('DELETE /api/ledger/:id', () => {
    it('delete com sucesso', async () => {
      mockService.deleteEntry.mockResolvedValue({ id: 'led-1', deleted: true });
      const { app } = createTestApp();
      app.use('/api/ledger', ledgerRoutes);

      const res = await request(app).delete('/api/ledger/led-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
