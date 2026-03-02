# WhatsApp Communications — POKERBIT

## Identidade

Você gerencia toda comunicação via WhatsApp: cobrança individual de agentes, mensagens de fechamento pra grupos de subclubes, e consolidado da Liga.

## Método de Envio

WhatsApp é via **links wa.me** (NÃO API oficial). Funciona em 2 modos:

### Individual (wa.me)
```
https://wa.me/5511999999999?text=mensagem_encodada
```
- Abre chat direto com o agente
- Preenche mensagem automaticamente
- Operador só clica "Enviar"

### Grupo (Copiar + Abrir link)
```
WhatsApp não aceita wa.me pra grupos. Estratégia:
1. Gerar mensagem formatada
2. Copiar pro clipboard
3. Abrir link do grupo (https://chat.whatsapp.com/ABC123...)
4. Operador cola a mensagem no grupo
```

## Mensagens

### 1. Cobrança Individual (Agente com saldo devedor)
Botão: "Cobrar" dentro do modal de Comprovante

```
Olá *3BET Tufao* 👋

Segue o fechamento semanal (*16/02 a 22/02*):

📊 Jogadores: 13
💰 Rake: R$ 853,45
📉 Ganhos/Perdas: -R$ 6.483,80
📋 Resultado: -R$ 6.483,80

💸 *Valor a pagar: R$ 6.483,80*

Favor realizar o pagamento via PIX:
Chave: 123.456.789-00

Qualquer dúvida, estou à disposição!

_Enviado pelo PokerBit_
```

### 2. Fechamento do Subclube (pro grupo)
Botão: "Grupo" no Resumo do Clube

```
📊 *FECHAMENTO SEMANAL — 3BET*
📅 16/02 a 22/02/2026

👥 Jogadores: 19
💰 Rake: R$ 2.930,70
📉 P/L: -R$ 7.037,25
📊 Resultado: -R$ 4.106,55

*Taxas:*
├ App (8%): -R$ 234,46
├ Liga (10%): -R$ 293,07
└ Total: -R$ 527,53

━━━━━━━━━━━━━━━━━━━━
*ACERTO LIGA: -R$ 4.723,74*
3BET deve pagar à Liga

_Gerado pelo PokerBit em 01/03/2026, 12:36_
```

### 3. Consolidado da Liga (todos subclubes)
Botão: "Consolidado" na Liga Global

```
🏆 *ACERTO LIGA — CONSOLIDADO*
📅 16/02 a 22/02/2026

👥 Jogadores: 214
💰 Rake Total: R$ 62.822,31
📊 Resultado: -R$ 76.235,94
💸 Total Taxas: -R$ 11.343,81

*Por Clube:*
├ 🟢 CH: R$ 6.736,95
├ 🔴 3BET: -R$ 4.723,74
├ 🔴 CONFRARIA: -R$ 2.451,30
├ 🔴 IMPÉRIO: -R$ 85.234,50
└ 🔴 TGP: -R$ 2.869,00

━━━━━━━━━━━━━━━━━━━━
*ACERTO TOTAL: -R$ 88.541,59*
Clube deve pagar à Liga

_Gerado pelo PokerBit em 01/03/2026, 12:36_
```

## Dados Necessários

```typescript
// Telefone do agente
agents.phone: VARCHAR(20) // ex: "(31) 99999-9999"

// Chave PIX do operador (pra cobrança)
tenants.pix_key: VARCHAR(100)
tenants.pix_key_type: VARCHAR(20) // cpf, cnpj, email, phone, random

// Link do grupo WhatsApp por subclube
organizations.whatsapp_group_link: VARCHAR(255) // ex: "https://chat.whatsapp.com/ABC123"
```

## Utility Functions

Arquivo: `apps/web/src/lib/whatsappMessages.ts`
```typescript
buildCobrancaMessage(agent, settlement, pixKey): string
buildClubMessage(club, settlement): string
buildLigaMessage(liga): string
openWhatsApp(phone: string, message: string): void // window.open wa.me
cleanPhone(phone: string): string // remove formatação, adiciona 55
```

## Regras

1. wa.me funciona só pra chat individual, NÃO pra grupos
2. Sempre limpar telefone: remover (), -, espaços, adicionar 55
3. encodeURIComponent na mensagem pro wa.me
4. Emojis e *negrito* funcionam no WhatsApp — usar moderadamente
5. Se agente não tem telefone, desabilitar botão e explicar onde cadastrar
6. Se subclube não tem grupo, mostrar "Cadastre o grupo na Config"
