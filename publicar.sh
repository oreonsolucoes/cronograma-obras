#!/bin/bash
# publicar.sh — git add + commit + push para o GitHub Pages
# Abra o Git Bash na pasta CRONOGRAMA DE OBRAS e rode:  bash publicar.sh

cd "$(dirname "$0")"

echo ""
echo "================================================"
echo "  Publicando no GitHub Pages..."
echo "================================================"
echo ""

git add .

# Verifica se tem algo para commitar
if git diff --cached --quiet; then
  echo "Nada novo para commitar. Tudo já está atualizado."
else
  MSG="Atualizacao $(date '+%d/%m/%Y %H:%M')"
  git commit -m "$MSG"
  echo "Commit: $MSG"
fi

git push

echo ""
echo "Pronto! O site atualiza em 1 a 2 minutos."
echo "https://oreonsolucoes.github.io/cronograma-obras/"
echo ""
