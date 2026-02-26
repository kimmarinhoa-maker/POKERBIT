// ══════════════════════════════════════════════════════════════════════
//  Configuração de variáveis de ambiente com validação
// ══════════════════════════════════════════════════════════════════════

import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Carrega .env da raiz do projeto
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),

  // API
  API_PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Storage
  STORAGE_BUCKET: z.string().default('imports'),

  // Security
  ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  console.error('\n📋 Copie .env.example para .env e preencha com suas credenciais do Supabase');
  process.exit(1);
}

export const env = parsed.data;
