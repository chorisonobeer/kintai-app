param(
    [Parameter(Mandatory=$true)]
    [string]$ServerName,
    [switch]$EnableDebug
)

function Test-JoinAPI {
    param(
        [string]$ServerName,
        [bool]$DebugMode = $false
    )
    
    if ($DebugMode) {
        Write-Host "Verbose Mode Enabled" -ForegroundColor Yellow
    }
    
    $apiUrl = "https://script.google.com/macros/s/$ServerName/exec"
    
    $requestBody = @{
        action = "findCustomerByCode"
        customerCode = "apple"
    } | ConvertTo-Json
    
    Write-Host "Sending request to MasterConfig API..." -ForegroundColor Blue
    
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $requestBody -ContentType "application/json" -TimeoutSec 30
        
        Write-Host "API Response Received:" -ForegroundColor Green
        $response | ConvertTo-Json -Depth 10
        
        if ($response.success -eq $true) {
            Write-Host "Join Test PASSED" -ForegroundColor Green
            return $true
        } else {
            Write-Host "Join Test FAILED" -ForegroundColor Red
            Write-Host "Error: $($response.error)" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "Request Failed:" -ForegroundColor Red
        Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Error Type: $($_.Exception.GetType().Name)" -ForegroundColor Red
        
        if ($DebugMode) {
            Write-Host "Full Exception Details:" -ForegroundColor Yellow
            Write-Host $_.Exception.ToString() -ForegroundColor Yellow
        }
        
        Write-Host "Starting error learning process..." -ForegroundColor Yellow
        
        $errorAnalysis = Analyze-PowerShellError -Exception $_.Exception -Context "API Test"
        $proposedSolution = Get-ErrorSolution -ErrorType $errorAnalysis.ErrorType
        
        Update-PowerShellRules -ErrorAnalysis $errorAnalysis -Solution $proposedSolution
        Record-ErrorLog -ErrorAnalysis $errorAnalysis -Solution $proposedSolution
        
        Write-Host "Error learning process completed" -ForegroundColor Green
        
        return $false
    }
}

function Analyze-PowerShellError {
    param(
        [System.Exception]$Exception,
        [string]$Context
    )
    
    $errorType = "Unknown"
    $errorMessage = $Exception.Message
    
    if ($errorMessage -match "could not be resolved|not recognized") {
        $errorType = "DNS Resolution"
    }
    elseif ($errorMessage -match "SSL|TLS|certificate") {
        $errorType = "SSL/TLS"
    }
    elseif ($errorMessage -match "timeout|timed out") {
        $errorType = "Timeout"
    }
    elseif ($errorMessage -match "JSON|parse") {
        $errorType = "JSON Parsing"
    }
    elseif ($errorMessage -match "unauthorized|403|401") {
        $errorType = "Authentication"
    }
    else {
        $errorType = "Network"
    }
    
    return @{
        ErrorType = $errorType
        ErrorMessage = $errorMessage
        Context = $Context
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
}

function Get-ErrorSolution {
    param([string]$ErrorType)
    
    switch ($ErrorType) {
        "DNS Resolution" { return "Check server name and network connectivity" }
        "SSL/TLS" { return "Add -SkipCertificateCheck parameter or update certificates" }
        "Timeout" { return "Increase -TimeoutSec parameter or check server response time" }
        "JSON Parsing" { return "Verify API response format and Content-Type header" }
        "Authentication" { return "Check API credentials and permissions" }
        default { return "Review error details and check API documentation" }
    }
}

function Update-PowerShellRules {
    param(
        [hashtable]$ErrorAnalysis,
        [string]$Solution
    )
    
    $rulesPath = "c:\Users\tsuma\kintai-app\PowerShell-Test-Rules.md"
    
    if (Test-Path $rulesPath) {
        $content = Get-Content $rulesPath -Raw
        
        $errorTypeText = $ErrorAnalysis.ErrorType + " Error"
        $detectionDate = Get-Date -Format "yyyy-MM-dd"
        
        $newErrorEntry = "`n`n5. **" + $errorTypeText + "**`n"
        $newErrorEntry += "   - Symptom: " + $ErrorAnalysis.ErrorMessage + "`n"
        $newErrorEntry += "   - Solution: " + $Solution + "`n"
        $newErrorEntry += "   - Auto-detected: " + $detectionDate + "`n"
        $newErrorEntry += "   - Context: " + $ErrorAnalysis.Context + "`n"
        
        $insertPoint = $content.IndexOf("## AI実行ルール適用")
        if ($insertPoint -gt 0) {
            $updatedContent = $content.Insert($insertPoint, $newErrorEntry)
            Set-Content -Path $rulesPath -Value $updatedContent -Encoding UTF8
            
            Write-Host "PowerShell-Test-Rules.md updated automatically!" -ForegroundColor Green
            Write-Host "   New error pattern: $($ErrorAnalysis.ErrorType)" -ForegroundColor Green
            Write-Host "   Proposed solution: $Solution" -ForegroundColor Green
        }
    }
}

function Record-ErrorLog {
    param(
        [hashtable]$ErrorAnalysis,
        [string]$Solution
    )
    
    $logPath = "c:\Users\tsuma\kintai-app\error-learning-log.json"
    
    if (Test-Path $logPath) {
        $logData = Get-Content $logPath -Raw | ConvertFrom-Json
    } else {
        $logData = @{
            errorPatterns = @()
            statistics = @{
                totalErrors = 0
                resolvedErrors = 0
                lastUpdate = ""
            }
            ruleUpdates = @()
        }
    }
    
    $errorEntry = @{
        id = [System.Guid]::NewGuid().ToString()
        timestamp = $ErrorAnalysis.Timestamp
        errorType = $ErrorAnalysis.ErrorType
        errorMessage = $ErrorAnalysis.ErrorMessage
        context = $ErrorAnalysis.Context
        proposedSolution = $Solution
        frequency = 1
        resolved = $false
    }
    
    $existingError = $logData.errorPatterns | Where-Object { $_.errorType -eq $ErrorAnalysis.ErrorType -and $_.errorMessage -eq $ErrorAnalysis.ErrorMessage }
    
    if ($existingError) {
        $existingError.frequency++
        $existingError.lastOccurrence = $ErrorAnalysis.Timestamp
        Write-Host "Updated frequency for existing error: $($existingError.frequency) times" -ForegroundColor Yellow
    } else {
        $logData.errorPatterns += $errorEntry
        Write-Host "Recorded new error pattern: $($errorEntry.id)" -ForegroundColor Blue
    }
    
    $logData.statistics.totalErrors++
    $logData.statistics.lastUpdate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    $logData | ConvertTo-Json -Depth 10 | Set-Content -Path $logPath -Encoding UTF8
    
    Write-Host "Error learning completed:" -ForegroundColor Green
    Write-Host "   Error ID: $($errorEntry.id)" -ForegroundColor White
    Write-Host "   Category: $($ErrorAnalysis.ErrorType)" -ForegroundColor White
    Write-Host "   Proposed Solution: $Solution" -ForegroundColor White
}

try {
    $result = Test-JoinAPI -ServerName $ServerName -DebugMode $EnableDebug.IsPresent
    
    if ($result) {
        Write-Host "Test completed successfully" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "Test failed" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "Unexpected error occurred: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}