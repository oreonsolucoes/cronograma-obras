@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo Publicando alteracoes no GitHub Pages...
git add .
git commit -m "Atualizacao %date% %time:~0,5%"
git push
if errorlevel 1 (
  echo *** Falha ao enviar. Leia a mensagem acima. ***
) else (
  echo Pronto. O site atualiza em 1 a 2 minutos.
)
pause
