param(
    [string]$Server = "root@192.168.1.118",
    [string]$RemotePath = "/opt/carrotbot",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "=== CarrotBot 部署脚本 ===" -ForegroundColor Cyan

if (-not $SkipBuild) {
    Write-Host "`n[1/4] 构建项目..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "构建失败!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[1/4] 跳过构建" -ForegroundColor Yellow
}

Write-Host "`n[2/4] 创建远程目录..." -ForegroundColor Yellow
ssh $Server "mkdir -p $RemotePath/data"

Write-Host "`n[3/4] 上传文件..." -ForegroundColor Yellow
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
    } else {
        Write-Host "  跳过 $file (不存在)" -ForegroundColor DarkGray
    }
}

Write-Host "`n[4/4] 安装依赖并重启服务..." -ForegroundColor Yellow
ssh $Server @"
    cd $RemotePath &&
    npm install --omit=dev &&
    mkdir -p logs &&
    pm2 restart carrotbot 2>&1 > logs/pm2.log
"@
Start-Sleep -Seconds 2
Write-Host "`n=== 部署完成，下面是PM2日志 ===" -ForegroundColor Green
ssh $Server @"
    cd $RemotePath &&
    pm2 logs carrotbot --nostream
"@
Write-Host "服务器地址: http://192.168.1.118:3123" -ForegroundColor Cyan
