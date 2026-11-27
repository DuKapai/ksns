@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "server\node_modules" (echo Hay chay setup.bat truoc. & pause & exit /b 1)
if not exist "client\node_modules" (echo Hay chay setup.bat truoc. & pause & exit /b 1)
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul
for /f "delims=" %%p in ('node -e "require('./server/node_modules/dotenv').config({path:'./server/.env'}); const p=Number(process.env.PORT || 3000); if (!Number.isInteger(p) || p!==Math.max(1,Math.min(65535,p))) process.exit(1); console.log(p)"') do set "KSNK_PORT=%%p"
if not defined KSNK_PORT (echo PORT trong server\.env khong hop le. & pause & exit /b 1)
node -e "const s=require('net').createConnection({host:'127.0.0.1',port:Number(process.argv[1])}); s.on('connect',()=>{s.destroy();process.exit(1)}); s.on('error',e=>process.exit(e.code==='ECONNREFUSED'?0:1))" %KSNK_PORT%
if errorlevel 1 goto port_in_use
call npm --prefix client run build
if errorlevel 1 (echo Khong build duoc giao dien. & pause & exit /b 1)
start "KSNK API" cmd /k "cd /d ""%~dp0server"" && npm start"
node -e "let n=0; const check=()=>fetch('http://127.0.0.1:'+process.argv[1]+'/api/health').then(r=>r.ok?r.json():Promise.reject()).then(x=>{if(!x.ok)throw Error()}).catch(()=>{if(++n!==30)setTimeout(check,500);else process.exit(1)});check()" %KSNK_PORT%
if errorlevel 1 (echo May chu khong khoi dong duoc. Hay kiem tra cua so KSNK API. & pause & exit /b 1)
echo Mo http://localhost:%KSNK_PORT%/app/dashboard
start http://localhost:%KSNK_PORT%/app/dashboard
exit /b 0
:port_in_use
node -e "const b='http://127.0.0.1:'+process.argv[1];Promise.all([fetch(b+'/api/health').then(r=>r.json()),fetch(b+'/app/dashboard').then(r=>r.ok?r.text():Promise.reject())]).then(([h,p])=>{if(h.service!=='ksnk-network-api' || !p.includes('<app-root'))process.exit(1)}).catch(()=>process.exit(1))" %KSNK_PORT%
if errorlevel 1 (echo Cong %KSNK_PORT% dang duoc su dung boi chuong trinh khac hoac may chu cu. & pause & exit /b 1)
echo Ung dung dang chay: http://localhost:%KSNK_PORT%/app/dashboard
start http://localhost:%KSNK_PORT%/app/dashboard
exit /b 0
