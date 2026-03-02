// ══════════════════════════════════════════════════════════════════════
//  Poker Manager SaaS — API Server
//
//  Stack: Express + TypeScript + Supabase
//  Porta: Railway PORT || API_PORT (default 3001)
// ══════════════════════════════════════════════════════════════════════

import express from 'express';
import crypto from 'crypto';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { supabaseAdmin } from './config/supabase';
import { logger } from './utils/logger';

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

// Trust Railway/Vercel proxy (required for express-rate-limit + X-Forwarded-For)
app.set('trust proxy', 1);

// ─── Middleware global ─────────────────────────────────────────────

// Gzip compression — reduce response size by 60-80%
app.use(compression());

// Security headers
app.use(helmet());

// CORS: read ALLOWED_ORIGINS from env, fallback to pokermanager + railway in production
const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [
      'https://pokermanager.com.br',
      'https://www.pokermanager.com.br',
      'https://poker-manager-web-production.up.railway.app',
    ];

app.use(
  cors({
    origin: env.NODE_ENV === 'production'
      ? (origin, cb) => {
          // Allow requests with no origin (mobile apps, curl, server-to-server)
          if (!origin) return cb(null, true);
          if (allowedOrigins.includes(origin)) {
            return cb(null, true);
          }
          cb(new Error('CORS not allowed'));
        }
      : '*',
    credentials: true,
  }),
);

app.use(express.json({ limit: '5mb' }));

// X-Request-Id for log correlation
app.use((req, _res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
  next();
});

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

// ─── Health check (with Supabase ping) ────────────────────────────
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try {
    const { error } = await supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }).limit(0);
    dbOk = !error;
  } catch { /* db unreachable */ }

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    version: '0.1.0',
    env: env.NODE_ENV,
    db: dbOk ? 'connected' : 'unreachable',
    timestamp: new Date().toISOString(),
  });
});

// ─── Rotas da API ──────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/imports', importLimiter, importRoutes);
app.use('/api/settlements', heavyLimiter, settlementRoutes);
app.use('/api/ledger', writeLimiter, ledgerRoutes);
app.use('/api/players', writeLimiter, playersRoutes);
app.use('/api/organizations', writeLimiter, organizationsRoutes);
app.use('/api/config', writeLimiter, configRoutes);
app.use('/api/links', writeLimiter, linksRoutes);
app.use('/api/carry-forward', writeLimiter, carryForwardRoutes);
app.use('/api/ofx', writeLimiter, ofxRoutes);
app.use('/api/chippix', writeLimiter, chipPixRoutes);
app.use('/api/users', writeLimiter, usersRoutes);
app.use('/api/whatsapp', whatsappLimiter, whatsappRoutes);
app.use('/api/permissions', writeLimiter, permissionsRoutes);

// ─── 404 handler ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// ─── Error handler global ──────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  logger.error('ERROR', `[req:${requestId}]`, err);
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
    logger.error('server', `Port ${PORT} already in use`);
    process.exit(1);
  }
  throw err;
});

// ─── Graceful shutdown ──────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info('server', `${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('server', 'HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections won't close
  setTimeout(() => {
    logger.warn('server', 'Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
