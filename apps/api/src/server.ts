// ══════════════════════════════════════════════════════════════════════
//  Poker Manager SaaS — API Server
//
//  Stack: Express + TypeScript + Supabase
//  Porta: Railway PORT || API_PORT (default 3001)
// ══════════════════════════════════════════════════════════════════════

import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

// Rotas
import authRoutes from './routes/auth.routes';
import importRoutes from './routes/import.routes';
import settlementRoutes from './routes/settlement.routes';
import ledgerRoutes from './routes/ledger.routes';
import playersRoutes from './routes/players.routes';
import organizationsRoutes from './routes/organizations.routes';
import configRoutes from './routes/config.routes';
import linksRoutes from './routes/links.routes';
import carryForwardRoutes from './routes/carry-forward.routes';
import ofxRoutes from './routes/ofx.routes';
import chipPixRoutes from './routes/chippix.routes';
import usersRoutes from './routes/users.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import permissionsRoutes from './routes/permissions.routes';

const app = express();

// ─── Middleware global ─────────────────────────────────────────────

// Gzip compression — reduce response size by 60-80%
app.use(compression());

// Security headers
app.use(helmet());

// CORS: read ALLOWED_ORIGINS from env, fallback to pokermanager.com.br in production
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['https://pokermanager.com.br', 'https://www.pokermanager.com.br'];

app.use(
  cors({
    origin: env.NODE_ENV === 'production' ? allowedOrigins : '*',
    credentials: true,
  }),
);

app.use(express.json({ limit: '5mb' }));

// ─── Rate Limiting ──────────────────────────────────────────────────

// General limiter: 200 requests per minute for all /api/ routes
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas requisicoes. Tente novamente em 1 minuto.' },
});
app.use('/api', generalLimiter);

// Auth endpoints: 20 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

// Import endpoints: 5 requests per minute
const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas importacoes em pouco tempo. Aguarde 1 minuto.' },
});

// WhatsApp endpoints: 10 requests per minute
const whatsappLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Rate limit exceeded for WhatsApp' },
});

// Heavy endpoints (sync-agents, full, sync-rates, finalize): 10 requests per minute
const heavyLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas requisicoes pesadas. Aguarde 1 minuto.' },
});

// Write endpoints (carry-forward, ofx, chippix, ledger): 30 requests per minute
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas operacoes de escrita. Aguarde 1 minuto.' },
});

// ─── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── Rotas da API ──────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/imports', importLimiter, importRoutes);
app.use('/api/settlements', heavyLimiter, settlementRoutes);
app.use('/api/ledger', writeLimiter, ledgerRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/links', linksRoutes);
app.use('/api/carry-forward', writeLimiter, carryForwardRoutes);
app.use('/api/ofx', writeLimiter, ofxRoutes);
app.use('/api/chippix', writeLimiter, chipPixRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/whatsapp', whatsappLimiter, whatsappRoutes);
app.use('/api/permissions', permissionsRoutes);

// ─── 404 handler ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// ─── Error handler global ──────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    success: false,
    error: env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message,
  });
});

// ─── Start ─────────────────────────────────────────────────────────
// Railway injeta PORT; local usa API_PORT; bind 0.0.0.0 para containers
const PORT = Number(process.env.PORT) || env.API_PORT;
const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     🃏  Poker Manager SaaS — API Server         ║
║                                                  ║
║     Port: ${String(PORT).padEnd(39)}║
║     Env:  ${String(env.NODE_ENV).padEnd(39)}║
║     Supabase: ${env.SUPABASE_URL.substring(0, 35).padEnd(35)}║
║                                                  ║
║     Endpoints:                                   ║
║       POST /api/auth/login                       ║
║       POST /api/imports/preview  (wizard pre)    ║
║       POST /api/imports/confirm  (wizard ok)    ║
║       POST /api/imports          (legacy)       ║
║       GET  /api/settlements      (semanas)       ║
║       GET  /api/settlements/:id  (detalhe)       ║
║       POST /api/ledger           (pagamentos)    ║
║       GET  /api/players          (jogadores)     ║
║       GET  /api/organizations    (clubes)        ║
║       GET  /api/settlements/:id/full (subclubs) ║
║       GET  /api/config/fees     (taxas)         ║
║       PUT  /api/config/adjustments (lanç.)      ║
║       GET  /api/links/unlinked   (pendentes)   ║
║       POST /api/links/agent      (vincular)    ║
║       POST /api/links/player     (vincular)    ║
║       GET  /api/carry-forward   (saldo ant.)  ║
║       POST /api/carry-forward/close-week      ║
║                                                  ║
╚══════════════════════════════════════════════════╝
  `);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use`);
    process.exit(1);
  }
  throw err;
});

export default app;
