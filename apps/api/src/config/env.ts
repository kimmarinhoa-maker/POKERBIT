// ══════════════════════════════════════════════════════════════════════
//  Configuração de variáveis de ambiente com validação
// ══════════════════════════════════════════════════════════════════════

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Carrega .env apenas em dev (em produção Railway/Render injetam env vars direto)
const envPath = path.resolve(__dirname, '../../../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),

  // API — Railway usa PORT, local usa API_PORT
  PORT: z.string().optional(),
  API_PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Storage
  STORAGE_BUCKET: z.string().default('imports'),

  // Security
  ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error('env', 'Variaveis de ambiente invalidas:');
  logger.error('env', parsed.error.flatten().fieldErrors);
  logger.error('env', 'Copie .env.example para .env e preencha com suas credenciais do Supabase');
  process.exit(1);
}

export const env = parsed.data;
