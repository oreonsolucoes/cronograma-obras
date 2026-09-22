@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set OWNER=oreonsolucoes
set REPO=cronograma-obras

echo.
echo ===============================================
echo   Criar repositorio %OWNER%/%REPO% e publicar
echo ===============================================
echo.

REM --- 1. GitHub CLI instalado? ---
where gh >nul 2>nul
if errorlevel 1 (
  echo O GitHub CLI ^(gh^) nao esta instalado. Instalando pelo winget...
  winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
  echo.
  echo Instalacao concluida. FECHE esta janela e rode este arquivo de novo.
  pause
  exit /b 1
)

REM --- 2. Login no GitHub ---
gh auth status >nul 2>nul
if errorlevel 1 (
  echo Vai abrir o navegador para voce entrar no GitHub. Copie o codigo que aparecer aqui.
  gh auth login -h github.com -p https -w
  if errorlevel 1 goto erro
)
gh auth setup-git >nul 2>nul

REM --- 3. Commit local ---
if not exist ".git" git init
git add .
git commit -m "Cronograma de obras" >nul 2>nul
git branch -M main

REM --- 4. Criar repositorio (ou usar o existente) e enviar ---
git remote remove origin >nul 2>nul
gh repo view %OWNER%/%REPO% >nul 2>nul
if errorlevel 1 (
  echo Criando o repositorio %OWNER%/%REPO%...
  gh repo create %OWNER%/%REPO% --public --source=. --remote=origin --push
  if errorlevel 1 goto erro
) else (
  echo O repositorio ja existe. Enviando os arquivos...
  git remote add origin https://github.com/%OWNER%/%REPO%.git
  git push -u origin main
  if errorlevel 1 goto erro
)

REM --- 5. Ativar GitHub Pages (branch main, raiz) ---
echo Ativando o GitHub Pages...
gh api -X POST repos/%OWNER%/%REPO%/pages -f "source[branch]=main" -f "source[path]=/" >nul 2>nul

echo.
echo ===============================================
echo   Pronto!
echo   Site (fica no ar em 1 a 2 minutos):
echo   https://%OWNER%.github.io/%REPO%/
echo.
echo   Lembre de adicionar  %OWNER%.github.io  em
echo   Firebase ^> Authentication ^> Configuracoes ^> Dominios autorizados
echo ===============================================
start "" "https://github.com/%OWNER%/%REPO%/settings/pages"
pause
exit /b 0

:erro
echo.
echo *** Algo deu errado. Leia a mensagem acima. ***
echo Se o erro for de permissao na conta %OWNER%, edite a linha "set OWNER=" com o seu usuario do GitHub.
pause
exit /b 1
