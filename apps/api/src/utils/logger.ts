// ══════════════════════════════════════════════════════════════════════
//  Logger — Structured logging wrapper (replaces raw console.*)
//  In production: only errors. In dev: everything.
// ══════════════════════════════════════════════════════════════════════

const isProd = process.env.NODE_ENV === 'production';

function formatMsg(tag: string, args: unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

export const logger = {
  /** Always logged (startup, critical errors) */
  error(tag: string, ...args: unknown[]) {
    console.error(`[${tag}]`, ...args);
  },

  /** Always logged — auth failures, deprecations, config issues */
  warn(tag: string, ...args: unknown[]) {
    console.warn(`[${tag}]`, ...args);
  },

  /** Dev only */
  info(tag: string, ...args: unknown[]) {
    if (!isProd) console.log(`[${tag}]`, ...args);
  },

  /** Dev only */
  debug(tag: string, ...args: unknown[]) {
    if (!isProd) console.log(`[${tag}]`, ...args);
  },
};
