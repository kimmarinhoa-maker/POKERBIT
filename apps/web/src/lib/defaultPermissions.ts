// ══════════════════════════════════════════════════════════════════════
//  Default Permissions — Frontend fallback (espelho do backend)
// ══════════════════════════════════════════════════════════════════════

export type PermRole = 'ADMIN' | 'FINANCEIRO' | 'AUDITOR' | 'AGENTE';

export const CONFIGURABLE_ROLES: PermRole[] = ['ADMIN', 'FINANCEIRO', 'AUDITOR', 'AGENTE'];

export const ALL_RESOURCES = [
  'page:dashboard',
  'page:import',
  'page:import_history',
  'page:lancamentos',
  'page:clubes',
  'page:liga_global',
  'page:caixa_geral',
  'page:players',
  'page:clubs',
  'page:links',
  'tab:resumo',
  'tab:detalhamento',
  'tab:dashboard',
  'tab:rakeback',
  'tab:jogadores',
  'tab:comprovantes',
  'tab:extrato',
  'tab:conciliacao',
  'tab:ajustes',
  'tab:dre',
  'tab:liga',
] as const;

export type PermResource = (typeof ALL_RESOURCES)[number];

export const DEFAULT_PERMISSIONS: Record<PermResource, Record<PermRole, boolean>> = {
  'page:dashboard':      { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: true  },
  'page:import':         { ADMIN: true,  FINANCEIRO: false, AUDITOR: false, AGENTE: false },
  'page:import_history': { ADMIN: true,  FINANCEIRO: false, AUDITOR: false, AGENTE: false },
  'page:lancamentos':    { ADMIN: true,  FINANCEIRO: false, AUDITOR: false, AGENTE: false },
  'page:clubes':         { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: true  },
  'page:liga_global':    { ADMIN: true,  FINANCEIRO: false, AUDITOR: false, AGENTE: false },
  'page:caixa_geral':    { ADMIN: true,  FINANCEIRO: true,  AUDITOR: false, AGENTE: false },
  'page:players':        { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: false },
  'page:clubs':          { ADMIN: true,  FINANCEIRO: false, AUDITOR: false, AGENTE: false },
  'page:links':          { ADMIN: true,  FINANCEIRO: false, AUDITOR: false, AGENTE: false },
  'tab:resumo':          { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: true  },
  'tab:detalhamento':    { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: true  },
  'tab:dashboard':       { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: false },
  'tab:rakeback':        { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: false },
  'tab:jogadores':       { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: true  },
  'tab:comprovantes':    { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: true  },
  'tab:extrato':         { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: true  },
  'tab:conciliacao':     { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: false },
  'tab:ajustes':         { ADMIN: true,  FINANCEIRO: true,  AUDITOR: false, AGENTE: false },
  'tab:dre':             { ADMIN: true,  FINANCEIRO: true,  AUDITOR: true,  AGENTE: false },
  'tab:liga':            { ADMIN: true,  FINANCEIRO: true,  AUDITOR: false, AGENTE: false },
};

export function getDefaultPermission(role: string, resource: string): boolean {
  if (role === 'OWNER') return true;
  const res = DEFAULT_PERMISSIONS[resource as PermResource];
  if (!res) return false;
  return res[role as PermRole] ?? false;
}

export function getDefaultPermissionsForRole(role: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const resource of ALL_RESOURCES) {
    result[resource] = getDefaultPermission(role, resource);
  }
  return result;
}
