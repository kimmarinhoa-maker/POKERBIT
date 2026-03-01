#!/bin/bash
# ============================================================
# POKERBIT — Limpeza Total do Repositório
# ============================================================
#
# COMO USAR (Git Bash na pasta do projeto):
# bash cleanup.sh
#
# RESULTADO FINAL — estrutura limpa:
#   📂 apps/api        ← Backend
#   📂 apps/web        ← Frontend
#   📂 packages/engine  ← Motor de cálculos
#   📂 packages/importer← Parser de planilhas
#   📂 database/        ← Migrations SQL
#   📄 package.json + configs
# ============================================================

set -e
echo ""
echo "🧹 POKERBIT — Limpeza Total"
echo "============================================================"
echo ""

# ============================================================
# 1. ARQUIVOS LEGADOS DA RAIZ (HTML antigo + scripts avulsos)
# ============================================================
echo "📦 [1/8] Removendo arquivos legados da raiz..."

git rm -f --ignore-unmatch dataLayer.js
git rm -f --ignore-unmatch financeEngine.js
git rm -f --ignore-unmatch adapterImport.js
git rm -f --ignore-unmatch fechamento-poker.html
git rm -f --ignore-unmatch testes-console.js
git rm -f --ignore-unmatch analyze_planilha.js
git rm -f --ignore-unmatch EXTRACTION_SPEC.md

echo "   ✅ 7 arquivos removidos"

# ============================================================
# 2. BACKUPS .bak (Git history já guarda versões anteriores)
# ============================================================
echo "🗑️  [2/8] Removendo backups .bak..."

git rm -f --ignore-unmatch dataLayer.js.bak_v1
git rm -f --ignore-unmatch financeEngine.js.bak_v1
git rm -f --ignore-unmatch fechamento-poker.html.bak_v1
git rm -f --ignore-unmatch fechamento-poker.html.bak_v3

echo "   ✅ 4 backups removidos"

# ============================================================
# 3. PASTA js/ — código render-*.js do sistema HTML antigo
#    12 arquivos, todos do commit inicial, nunca atualizados
# ============================================================
echo "📁 [3/8] Removendo pasta js/ (HTML antigo: render-*.js)..."

git rm -rf --ignore-unmatch js/

echo "   ✅ js/ removida (12 arquivos)"

# ============================================================
# 4. PASTA "planilha import/" — só tinha 1 xlsx de teste
# ============================================================
echo "📁 [4/8] Removendo pasta 'planilha import/'..."

git rm -rf --ignore-unmatch "planilha import/"

echo "   ✅ planilha import/ removida"

# ============================================================
# 5. PASTA docs/ — 4 markdowns do commit inicial, desatualizados
#    ARCHITECTURE.md, FINANCIAL_RULES.md, SUPABASE_SETUP.md,
#    TESTING_CHECKLIST.md — nenhum atualizado desde Feb 23
# ============================================================
echo "📁 [5/8] Removendo pasta docs/ (desatualizados)..."

git rm -rf --ignore-unmatch docs/

echo "   ✅ docs/ removida (4 arquivos)"

# ============================================================
# 6. PASTA scripts/ — 2 scripts do commit inicial, nunca usados
#    check-unlinked.js, validate-settlement.js
# ============================================================
echo "📁 [6/8] Removendo pasta scripts/ (scripts antigos)..."

git rm -rf --ignore-unmatch scripts/

echo "   ✅ scripts/ removida (2 arquivos)"

# ============================================================
# 7. PASTAS tools/ + fixtures/ — golden tests do commit inicial
#    tools/: compare.js, run_golden.js, test_preview_*.js
#    fixtures/: config/, expected/, input/
#    + Remover scripts golden:* do package.json
# ============================================================
echo "📁 [7/8] Removendo tools/ + fixtures/ (golden tests antigos)..."

git rm -rf --ignore-unmatch tools/
git rm -rf --ignore-unmatch fixtures/

echo "   ✅ tools/ e fixtures/ removidas"

# ============================================================
# 8. PASTA .claude/ — config do Claude Code (não pertence ao repo)
# ============================================================
echo "📁 [8/8] Removendo .claude/ do tracking..."

git rm -rf --ignore-unmatch .claude/

echo "   ✅ .claude/ removida do tracking"

# ============================================================
# ATUALIZAR .gitignore
# ============================================================
echo ""
echo "🔒 Atualizando .gitignore..."

# Adicionar entradas se não existem
for ENTRY in ".claude/" "memory/" "*.bak_v*"; do
  if ! grep -qF "$ENTRY" .gitignore 2>/dev/null; then
    echo "$ENTRY" >> .gitignore
  fi
done

git add .gitignore

# ============================================================
# LIMPAR SCRIPTS GOLDEN DO package.json
# (golden:run, golden:compare, golden:update, golden:inspect, test:golden)
# ============================================================
echo "📝 Limpando scripts de golden test do package.json..."

# Usa sed pra remover as linhas dos golden scripts
sed -i '/"golden:run"/d' package.json
sed -i '/"golden:compare"/d' package.json
sed -i '/"golden:update"/d' package.json
sed -i '/"golden:inspect"/d' package.json
sed -i '/"test:golden"/d' package.json

git add package.json

echo "   ✅ Golden scripts removidos do package.json"

# ============================================================
# COMMIT
# ============================================================
echo ""
echo "📝 Fazendo commit..."

git add -A

git commit -m "chore: full cleanup — remove all legacy code and unused folders

REMOVED FILES (root):
- dataLayer.js, financeEngine.js, adapterImport.js
- fechamento-poker.html, testes-console.js, analyze_planilha.js
- EXTRACTION_SPEC.md
- All .bak backup files (4 files)

REMOVED FOLDERS:
- js/            (12 render-*.js from old HTML system)
- planilha import/ (test xlsx file)
- docs/          (4 outdated markdowns from initial commit)
- scripts/       (2 unused scripts from initial commit)
- tools/         (golden test runners — unused)
- fixtures/      (golden test data — unused)
- .claude/       (Claude Code config — now in .gitignore)

UPDATED:
- package.json: removed golden:* scripts
- .gitignore: added .claude/, memory/, *.bak_v*

KEPT (production code):
- apps/api       (backend)
- apps/web       (frontend)  
- packages/      (engine + importer)
- database/      (SQL migrations)"

echo ""
echo "============================================================"
echo "🎉 LIMPEZA COMPLETA!"
echo ""
echo "📊 Removidos: ~35+ arquivos em 7 pastas"
echo ""
echo "📂 Estrutura final:"
echo "   apps/api/        ← Backend (Express + Supabase)"
echo "   apps/web/        ← Frontend (Next.js)"
echo "   packages/engine/ ← Motor de cálculos"
echo "   packages/importer/ ← Parser de planilhas"
echo "   database/        ← Migrations SQL"
echo "   package.json     ← Monorepo config"
echo "   + configs (eslint, prettier, vitest, nixpacks)"
echo ""
echo "👉 Próximo passo: git push origin master"
echo "============================================================"
