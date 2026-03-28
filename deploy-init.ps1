param(
    [string]$Server = "root@192.168.1.118",
    [string]$RemotePath = "/opt/carrotbot"
)

$ErrorActionPreference = "Stop"

Write-Host "=== CarrotBot 首次部署 ===" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Write-Host "错误: .env 文件不存在，请先创建配置文件!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[1/3] 构建项目..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "构建失败!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] 上传所有文件..." -ForegroundColor Yellow
ssh $Server "mkdir -p $RemotePath/data $RemotePath/logs"

$FilesToUpload = @(
    "dist",
    "package.json",
    ".env",
    "ecosystem.config.cjs"
)

foreach ($file in $FilesToUpload) {
    if (Test-Path $file) {
        Write-Host "  上传 $file ..." -ForegroundColor Gray
        scp -r $file "${Server}:${RemotePath}/"
    }
}

Write-Host "`n[3/3] 安装依赖并启动服务..." -ForegroundColor Yellow
ssh $Server @"
    cd $RemotePath &&
    npm install --omit=dev &&
    npm rebuild better-sqlite3 &&
    mkdir -p logs &&
    pm2 start ecosystem.config.cjs &&
    pm2 save
"@

Write-Host "`n=== 首次部署完成! ===" -ForegroundColor Green
Write-Host ""
Write-Host "服务已启动，常用命令:" -ForegroundColor Yellow
Write-Host "  查看状态: pm2 status"
Write-Host "  查看日志: pm2 logs carrotbot"
Write-Host "  重启服务: pm2 restart carrotbot"
Write-Host ""
Write-Host "后续更新请运行: ./deploy.ps1"
