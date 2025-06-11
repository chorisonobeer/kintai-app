# 安定した開発サーバー起動スクリプト
# nodemonで自動再起動機能付き

Write-Host "=== 安定版開発サーバー起動 ==="
Write-Host "nodemonをインストール中..."

# nodemonがインストールされているかチェック
try {
    $nodemonVersion = npm list -g nodemon --depth=0 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "nodemonをグローバルインストール中..."
        npm install -g nodemon
    } else {
        Write-Host "nodemon は既にインストール済みです"
    }
} catch {
    Write-Host "nodemonをインストール中..."
    npm install -g nodemon
}

Write-Host "開発サーバーを自動再起動モードで起動します..."
Write-Host "サーバーが停止しても自動的に再起動されます"
Write-Host "停止するには Ctrl+C を押してください"
Write-Host ""

# nodemonで開発サーバーを起動（自動再起動付き）
nodemon --exec "npm run dev" --watch src --watch vite.config.ts --ext ts,tsx,js,jsx,json --delay 2
