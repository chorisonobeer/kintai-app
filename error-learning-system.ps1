# PowerShellエラー自動学習・修正システム
# このスクリプトはエラー発生時に自動的にルールを学習・修正します

param(
    [Parameter(Mandatory=$false)]
    [string]$ErrorLogPath = "c:\Users\tsuma\kintai-app\error-learning-log.json",
    
    [Parameter(Mandatory=$false)]
    [string]$RulesPath = "c:\Users\tsuma\kintai-app\PowerShell-Test-Rules.md",
    
    [Parameter(Mandatory=$false)]
    [switch]$Debug
)

# エラーログデータベースの初期化
function Initialize-ErrorDatabase {
    param([string]$LogPath)
    
    if (-not (Test-Path $LogPath)) {
        $initialData = @{
            errorPatterns = @()
            ruleUpdates = @()
            statistics = @{
                totalErrors = 0
                resolvedErrors = 0
                lastUpdate = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            }
        }
        
        $initialData | ConvertTo-Json -Depth 10 | Set-Content -Path $LogPath -Encoding UTF8
        Write-Host "✅ エラーデータベースを初期化しました: $LogPath" -ForegroundColor Green
    }
}

# エラーパターンの分析
function Analyze-ErrorPattern {
    param(
        [string]$ErrorType,
        [string]$ErrorMessage,
        [string]$ScriptContext
    )
    
    $patterns = @{
        "CommandNotFoundException" = @{
            pattern = ".*認識されません|.*not recognized"
            category = "コマンド不明"
            commonSolutions = @(
                "PowerShellバージョンの確認",
                "必要なモジュールのインポート",
                "実行ポリシーの確認"
            )
        }
        "WebException" = @{
            pattern = ".*SSL|.*TLS|.*証明書"
            category = "SSL/TLS問題"
            commonSolutions = @(
                "TLS1.2の有効化",
                "証明書の確認",
                "プロキシ設定の確認"
            )
        }
        "JsonException" = @{
            pattern = ".*JSON|.*ConvertFrom-Json"
            category = "JSON解析エラー"
            commonSolutions = @(
                "レスポンス形式の確認",
                "文字エンコーディングの確認",
                "APIエンドポイントの確認"
            )
        }
        "TimeoutException" = @{
            pattern = ".*timeout|.*タイムアウト"
            category = "タイムアウト"
            commonSolutions = @(
                "TimeoutSecパラメータの追加",
                "ネットワーク接続の確認",
                "APIサーバーの状態確認"
            )
        }
    }
    
    foreach ($patternKey in $patterns.Keys) {
        if ($ErrorType -eq $patternKey -or $ErrorMessage -match $patterns[$patternKey].pattern) {
            return @{
                matchedPattern = $patternKey
                category = $patterns[$patternKey].category
                suggestedSolutions = $patterns[$patternKey].commonSolutions
                confidence = if ($ErrorType -eq $patternKey) { 0.9 } else { 0.7 }
            }
        }
    }
    
    return @{
        matchedPattern = "Unknown"
        category = "未分類"
        suggestedSolutions = @("詳細調査が必要")
        confidence = 0.3
    }
}

# エラーログの記録
function Record-ErrorLog {
    param(
        [string]$ErrorType,
        [string]$ErrorMessage,
        [string]$ScriptName,
        [int]$LineNumber,
        [string]$Command,
        [string]$StackTrace,
        [object]$Analysis,
        [string]$LogPath
    )
    
    try {
        $logData = Get-Content -Path $LogPath -Raw | ConvertFrom-Json
    } catch {
        Write-Warning "ログファイルの読み込みに失敗。新規作成します。"
        Initialize-ErrorDatabase -LogPath $LogPath
        $logData = Get-Content -Path $LogPath -Raw | ConvertFrom-Json
    }
    
    $errorId = "PS" + (Get-Date -Format "yyyyMMddHHmmss")
    
    $newError = @{
        id = $errorId
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        errorType = $ErrorType
        errorMessage = $ErrorMessage
        scriptName = $ScriptName
        lineNumber = $LineNumber
        command = $Command
        stackTrace = $StackTrace
        analysis = $Analysis
        resolved = $false
        frequency = 1
    }
    
    # 既存の同様エラーをチェック
    $existingError = $logData.errorPatterns | Where-Object { 
        $_.errorType -eq $ErrorType -and $_.errorMessage -eq $ErrorMessage 
    }
    
    if ($existingError) {
        $existingError.frequency++
        $existingError.lastOccurred = $newError.timestamp
        Write-Host "🔄 既存エラーの頻度を更新: $($existingError.frequency)回" -ForegroundColor Yellow
    } else {
        $logData.errorPatterns += $newError
        Write-Host "📝 新しいエラーパターンを記録: $errorId" -ForegroundColor Blue
    }
    
    $logData.statistics.totalErrors++
    $logData.statistics.lastUpdate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    $logData | ConvertTo-Json -Depth 10 | Set-Content -Path $LogPath -Encoding UTF8
    
    return $errorId
}

# ルールドキュメントの自動更新
function Update-RulesDocument {
    param(
        [string]$ErrorType,
        [string]$ErrorMessage,
        [object]$Analysis,
        [string]$Solution,
        [string]$RulesPath
    )
    
    try {
        $rulesContent = Get-Content -Path $RulesPath -Raw -Encoding UTF8
        
        # 「よくあるエラーと対処法」セクションを探す
        $errorSectionPattern = "### よくあるエラーと対処法"
        
        if ($rulesContent -match $errorSectionPattern) {
            $newErrorEntry = @"

$($logData.errorPatterns.Count + 1). **$($Analysis.category)エラー ($ErrorType)**
   - エラーメッセージ: ``$ErrorMessage``
   - 対処法: $Solution
   - 発生頻度: 高
   - 自動検出: $(Get-Date -Format "yyyy-MM-dd")
"@
            
            # AI実行ルール適用セクションの直前に挿入
            $insertPosition = $rulesContent.IndexOf("## AI実行ルール適用")
            if ($insertPosition -gt 0) {
                $beforeSection = $rulesContent.Substring(0, $insertPosition)
                $afterSection = $rulesContent.Substring($insertPosition)
                
                $updatedContent = $beforeSection + $newErrorEntry + "`n`n" + $afterSection
                
                Set-Content -Path $RulesPath -Value $updatedContent -Encoding UTF8
                
                Write-Host "✅ ルールドキュメントを更新しました" -ForegroundColor Green
                
                # 更新ログを記録
                Record-RuleUpdate -Change "新しいエラーパターンを追加: $ErrorType" -Reason $ErrorMessage -LogPath $ErrorLogPath
                
                return $true
            }
        }
    } catch {
        Write-Error "ルールドキュメントの更新に失敗: $($_.Exception.Message)"
        return $false
    }
    
    return $false
}

# ルール更新ログの記録
function Record-RuleUpdate {
    param(
        [string]$Change,
        [string]$Reason,
        [string]$LogPath
    )
    
    try {
        $logData = Get-Content -Path $LogPath -Raw | ConvertFrom-Json
        
        $updateEntry = @{
            timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            change = $Change
            reason = $Reason
            section = "よくあるエラーと対処法"
        }
        
        $logData.ruleUpdates += $updateEntry
        $logData | ConvertTo-Json -Depth 10 | Set-Content -Path $LogPath -Encoding UTF8
        
        Write-Host "📋 ルール更新ログを記録しました" -ForegroundColor Cyan
    } catch {
        Write-Warning "ルール更新ログの記録に失敗: $($_.Exception.Message)"
    }
}

# メインのエラー処理関数
function Process-PowerShellError {
    param(
        [System.Management.Automation.ErrorRecord]$ErrorRecord,
        [string]$ProposedSolution = ""
    )
    
    Write-Host "`n🔍 エラー自動学習プロセスを開始..." -ForegroundColor Yellow
    
    # エラー情報の抽出
    $errorType = $ErrorRecord.Exception.GetType().Name
    $errorMessage = $ErrorRecord.Exception.Message
    $scriptName = $ErrorRecord.InvocationInfo.ScriptName
    $lineNumber = $ErrorRecord.InvocationInfo.ScriptLineNumber
    $command = $ErrorRecord.InvocationInfo.Line.Trim()
    $stackTrace = $ErrorRecord.ScriptStackTrace
    
    if ($Debug) {
        Write-Host "エラータイプ: $errorType" -ForegroundColor Cyan
        Write-Host "エラーメッセージ: $errorMessage" -ForegroundColor Cyan
        Write-Host "スクリプト: $scriptName" -ForegroundColor Cyan
        Write-Host "行番号: $lineNumber" -ForegroundColor Cyan
    }
    
    # エラーパターンの分析
    $analysis = Analyze-ErrorPattern -ErrorType $errorType -ErrorMessage $errorMessage -ScriptContext $command
    
    Write-Host "📊 エラー分析結果:" -ForegroundColor Blue
    Write-Host "  カテゴリ: $($analysis.category)" -ForegroundColor White
    Write-Host "  信頼度: $($analysis.confidence * 100)%" -ForegroundColor White
    Write-Host "  推奨解決策: $($analysis.suggestedSolutions -join ', ')" -ForegroundColor White
    
    # エラーログの記録
    Initialize-ErrorDatabase -LogPath $ErrorLogPath
    $errorId = Record-ErrorLog -ErrorType $errorType -ErrorMessage $errorMessage -ScriptName $scriptName -LineNumber $lineNumber -Command $command -StackTrace $stackTrace -Analysis $analysis -LogPath $ErrorLogPath
    
    # 解決策が提供されている場合、ルールドキュメントを更新
    if ($ProposedSolution -ne "") {
        $updateSuccess = Update-RulesDocument -ErrorType $errorType -ErrorMessage $errorMessage -Analysis $analysis -Solution $ProposedSolution -RulesPath $RulesPath
        
        if ($updateSuccess) {
            Write-Host "🎉 ルールが自動更新されました!" -ForegroundColor Green
        }
    } else {
        Write-Host "💡 解決策が見つかったら、以下のコマンドでルールを更新してください:" -ForegroundColor Yellow
        Write-Host "   .\error-learning-system.ps1 -UpdateRule -ErrorId $errorId -Solution '解決策'" -ForegroundColor Yellow
    }
    
    Write-Host "✅ エラー学習プロセス完了" -ForegroundColor Green
}

# エラー統計の表示
function Show-ErrorStatistics {
    param([string]$LogPath)
    
    if (-not (Test-Path $LogPath)) {
        Write-Host "❌ エラーログファイルが見つかりません: $LogPath" -ForegroundColor Red
        return
    }
    
    try {
        $logData = Get-Content -Path $LogPath -Raw | ConvertFrom-Json
        
        Write-Host "`n📊 エラー統計情報" -ForegroundColor Blue
        Write-Host "===================" -ForegroundColor Blue
        Write-Host "総エラー数: $($logData.statistics.totalErrors)" -ForegroundColor White
        Write-Host "解決済み: $($logData.statistics.resolvedErrors)" -ForegroundColor Green
        Write-Host "未解決: $($logData.statistics.totalErrors - $logData.statistics.resolvedErrors)" -ForegroundColor Red
        Write-Host "最終更新: $($logData.statistics.lastUpdate)" -ForegroundColor White
        
        if ($logData.errorPatterns.Count -gt 0) {
            Write-Host "`n🔥 頻発エラートップ5:" -ForegroundColor Yellow
            $topErrors = $logData.errorPatterns | Sort-Object frequency -Descending | Select-Object -First 5
            
            foreach ($error in $topErrors) {
                Write-Host "  $($error.frequency)回: $($error.errorType) - $($error.analysis.category)" -ForegroundColor White
            }
        }
        
        if ($logData.ruleUpdates.Count -gt 0) {
            Write-Host "`n📝 最近のルール更新:" -ForegroundColor Cyan
            $recentUpdates = $logData.ruleUpdates | Sort-Object timestamp -Descending | Select-Object -First 3
            
            foreach ($update in $recentUpdates) {
                Write-Host "  $($update.timestamp): $($update.change)" -ForegroundColor White
            }
        }
        
    } catch {
        Write-Error "統計情報の表示に失敗: $($_.Exception.Message)"
    }
}

# メイン実行部分
if ($args.Count -eq 0) {
    Write-Host "🤖 PowerShellエラー自動学習・修正システム" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "使用方法:"
    Write-Host "  統計表示: .\error-learning-system.ps1 -ShowStats"
    Write-Host "  エラー処理: try { ... } catch { .\error-learning-system.ps1 -ProcessError \$_ }"
    Write-Host ""
    
    Show-ErrorStatistics -LogPath $ErrorLogPath
}

# パラメータ処理
if ($args -contains "-ShowStats") {
    Show-ErrorStatistics -LogPath $ErrorLogPath
}

if ($args -contains "-ProcessError" -and $args.Count -gt 1) {
    $errorRecord = $args[1]
    Process-PowerShellError -ErrorRecord $errorRecord
}

# 初期化
Initialize-ErrorDatabase -LogPath $ErrorLogPath

Write-Host "✅ エラー学習システムが準備完了" -ForegroundColor Green