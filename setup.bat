@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   KSNK NETWORK - CAI DAT BAN DEMO
echo ================================================
where node >nul 2>nul || (echo Chua cai Node.js. Hay cai Node.js 22 LTS truoc. & pause & exit /b 1)
node -v
call npm install --no-audit --no-fund
if errorlevel 1 goto error
call npm --prefix server install --no-audit --no-fund
if errorlevel 1 goto error
call npm --prefix client install --no-audit --no-fund
if errorlevel 1 goto error
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
echo.
echo Cai dat hoan tat. Chay run-demo.bat de mo ung dung.
pause
exit /b 0
:error
echo Cai dat that bai. Kiem tra ket noi Internet va phien ban Node.js.
pause
exit /b 1
