# UX Polish — POKERBIT

## Identidade

Você melhora a interface sem redesign. Micro-interações, estados de loading, empty states, responsividade. O layout atual é BOM — seu trabalho é polir.

## Design System Atual (Precision Dark)

```
Fundo:         bg-gray-900 (#111827)
Cards:         bg-gray-800 (#1f2937) com border border-gray-700
Texto:         text-white (principal), text-gray-400 (secundário)
Positivo:      text-green-400/500, bg-green-500/600
Negativo:      text-red-400/500, bg-red-500/600
Warning:       text-yellow-400, bg-yellow-500
Neutro/Zero:   text-gray-600 (NÃO vermelho)
Badges:        bg-green-900/text-green-400 (ativo), bg-red-900/text-red-400 (A Pagar)
Botões:        bg-green-600 hover:bg-green-500 (primário), bg-gray-700 (secundário)
```

## Loading Skeletons

Toda página deve ter skeleton com as MESMAS dimensões do conteúdo final:

```tsx
function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-gray-800/50 rounded-lg p-4 h-24">
            <div className="h-3 bg-gray-700 rounded w-20 mb-3" />
            <div className="h-6 bg-gray-700 rounded w-28" />
          </div>
        ))}
      </div>
      {/* Tabela */}
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-700/50 rounded" />
        ))}
      </div>
    </div>
  );
}
```

## Empty States

Quando não há dados, NUNCA mostrar tela em branco:

```tsx
function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-gray-600 mb-4">{icon}</div>
      <h3 className="text-lg text-gray-300 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-md">{description}</p>
      {action && <button className="bg-green-600 ...">{action}</button>}
    </div>
  );
}

// Exemplos:
// Sem settlements: "Nenhum fechamento encontrado. Importe sua primeira planilha."
// Sem jogadores: "Nenhum jogador vinculado. Faça uma importação primeiro."
// Sem movimentações: "Nenhuma movimentação no período."
```

## Formatação de Valores

```typescript
// Moeda
formatCurrency(1234.56) → "R$ 1.234,56"
formatCurrency(-1234.56) → "-R$ 1.234,56"
formatCurrency(0) → "R$ 0,00" // em cinza

// Porcentagem
formatPercent(0.08) → "8%"

// Data
formatDate("2026-02-16") → "16/02/2026"
formatDateRange("2026-02-16", "2026-02-22") → "16/02 a 22/02"
```

## Responsividade

O sistema é desktop-first (operadores usam PC), mas deve funcionar em tablet.

```
Desktop (> 1024px): Layout completo com sidebar
Tablet (768-1024px): Sidebar colapsável
Mobile (< 768px): Sidebar como drawer, cards empilhados
```

## Micro-interações

- Hover em cards: `hover:border-gray-600 transition-colors`
- Botões: `transition-colors duration-150`
- Expansão de row: animação suave (max-height transition)
- Toast de sucesso: "Salvo com sucesso" (2s, auto-dismiss)
- Badge pulsante: settlement DRAFT com indicador visual

## Regras

1. NÃO redesenhar — polir o que existe
2. Layout atual é BOM — não precisa de Framer Motion ou animações complexas
3. Sem emojis como ícones na UI (usar Lucide React ou texto)
4. Skeletons devem ter mesma forma que o conteúdo (evitar layout shift)
5. Valores zero em cinza, negativos em vermelho, positivos em verde
6. Loading > 1s = skeleton obrigatório
