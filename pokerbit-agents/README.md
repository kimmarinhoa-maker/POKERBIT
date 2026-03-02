# .claude/agents/ — POKERBIT (Poker SaaS)

## 12 Agentes Especializados — Lean & Real

Cada agente reflete o sistema REAL: caminhos de arquivo, tabelas, componentes, fluxos reais.

```
.claude/
└── agents/
    │
    ├── engineering/              # 🔧 Desenvolvimento (4)
    │   ├── fullstack-dev.md     # Next.js + API Routes + Supabase + Tailwind
    │   ├── bug-hunter.md        # Diagnóstico, fix, prevenção de regressões
    │   ├── performance.md       # Loading, bundle, queries, infra Vercel+Supabase
    │   └── deploy-infra.md      # Vercel, Supabase, migrations, env vars
    │
    ├── core/                    # 🎰 Motor do Negócio (4)
    │   ├── settlement-engine.md # Import → Cálculo → Validação → Fechamento
    │   ├── financial-ops.md     # Caixa, ChipPix, Conciliação, OFX, pagamentos
    │   ├── multi-tenant.md      # Liga→Clube→Subclubes, SaaS mode, onboarding
    │   └── whatsapp-comms.md    # Cobrança, grupo, consolidado, wa.me
    │
    ├── operations/              # ⚙️ Operações (2)
    │   ├── qa-auditor.md        # Testes, auditoria de cálculos, checklist
    │   └── data-integrity.md    # Conciliação ChipPix↔Ledger, zero-sum, RLS
    │
    └── product/                 # 📋 Produto (2)
        ├── product-owner.md     # Roadmap, sprints, priorização, specs
        └── ux-polish.md         # UI/UX, skeletons, empty states, responsivo
```

## Hierarquia de Execução

```
Product Owner → define O QUÊ e QUANDO
  ↓
Fullstack Dev → implementa (front + back + banco)
  ↓
Settlement Engine / Financial Ops → regras de negócio
  ↓
QA Auditor → valida cálculos e fluxos
  ↓
Bug Hunter → corrige problemas encontrados
  ↓
Deploy Infra → coloca em produção
  ↓
Data Integrity → monitora pós-deploy
```

## Quando usar cada agente

| Situação | Agente |
|----------|--------|
| "Implementa essa feature" | fullstack-dev |
| "Tá bugado, corrige" | bug-hunter |
| "Tá lento, otimiza" | performance |
| "Faz deploy / configura infra" | deploy-infra |
| "Mexe no fechamento semanal" | settlement-engine |
| "Mexe em caixa, ChipPix, pagamentos" | financial-ops |
| "Novo cliente SaaS, subclubes, onboarding" | multi-tenant |
| "Mensagens WhatsApp" | whatsapp-comms |
| "Testa se tá funcionando" | qa-auditor |
| "Números não batem" | data-integrity |
| "Define próximo sprint" | product-owner |
| "Melhora a interface" | ux-polish |

## Como Usar

```bash
claude --agent engineering/fullstack-dev
claude --agent core/settlement-engine
claude --agent operations/qa-auditor
```

## Total: 12 agentes em 4 departamentos
