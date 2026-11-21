@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "server\node_modules" (echo Hay chay setup.bat truoc. & pause & exit /b 1)
if not exist "client\node_modules" (echo Hay chay setup.bat truoc. & pause & exit /b 1)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
start "KSNK API" cmd /k "cd /d ""%~dp0server"" && npm run dev"
timeout /t 3 >nul
start "KSNK Angular" cmd /k "cd /d ""%~dp0client"" && npm start"
timeout /t 5 >nul
start http://localhost:4200
