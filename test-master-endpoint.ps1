param(
    [Parameter(Mandatory=$false)]
    [string]$ServerName = "testserver",
    [switch]$EnableDebug
)

function Test-MasterEndpoint {
    param(
        [string]$ServerName,
        [bool]$DebugMode = $false
    )
    
    # 指定されたエンドポイントURL
    $apiUrl = "https://script.google.com/macros/s/AKfycbzVbNy4uQsgxytwj36IgFZRvtyH5LXjieFYkyip6xI/dev"
    
    Write-Host "Testing Master Endpoint..." -ForegroundColor Cyan
    Write-Host "API URL: $apiUrl" -ForegroundColor Gray
    Write-Host "Server Name: $ServerName" -ForegroundColor Gray
    Write-Host ""
    
    try {
        # Test 1: Basic Access Test
        Write-Host "[Test 1] Basic Access Test" -ForegroundColor Yellow
        $testUrl = "$apiUrl?action=testAccess"
        Write-Host "Request URL: $testUrl" -ForegroundColor Gray
        
        $response1 = Invoke-RestMethod -Uri $testUrl -Method GET -ErrorAction Stop
        Write-Host "Response:" -ForegroundColor Green
        $response1 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        # Test 2: Get Server Names
        Write-Host "[Test 2] Get Server Names" -ForegroundColor Yellow
        $serverUrl = "$apiUrl?action=getServerNames"
        Write-Host "Request URL: $serverUrl" -ForegroundColor Gray
        
        $response2 = Invoke-RestMethod -Uri $serverUrl -Method GET -ErrorAction Stop
        Write-Host "Response:" -ForegroundColor Green
        $response2 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        # Test 3: Get Spreadsheet ID by Server Name
        Write-Host "[Test 3] Get Spreadsheet ID by Server Name" -ForegroundColor Yellow
        $spreadsheetUrl = "$apiUrl?action=getSpreadsheetIdByServerName&serverName=$ServerName"
        Write-Host "Request URL: $spreadsheetUrl" -ForegroundColor Gray
        
        $response3 = Invoke-RestMethod -Uri $spreadsheetUrl -Method GET -ErrorAction Stop
        Write-Host "Response:" -ForegroundColor Green
        $response3 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        # Test 4: Find Customer by Code (GET)
        Write-Host "[Test 4] Find Customer by Code (GET)" -ForegroundColor Yellow
        $customerUrl = "$apiUrl?action=findCustomerByCode&customerCode=$ServerName"
        Write-Host "Request URL: $customerUrl" -ForegroundColor Gray
        
        $response4 = Invoke-RestMethod -Uri $customerUrl -Method GET -ErrorAction Stop
        Write-Host "Response:" -ForegroundColor Green
        $response4 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        # Test 5: Find Customer by Code (POST)
        Write-Host "[Test 5] Find Customer by Code (POST)" -ForegroundColor Yellow
        $headers = @{
            "Content-Type" = "application/json"
        }
        
        $body = @{
            action = "findCustomerByCode"
            customerCode = $ServerName
        } | ConvertTo-Json
        
        Write-Host "Request Body: $body" -ForegroundColor Gray
        
        $response5 = Invoke-RestMethod -Uri $apiUrl -Method POST -Headers $headers -Body $body -ErrorAction Stop
        Write-Host "Response:" -ForegroundColor Green
        $response5 | ConvertTo-Json -Depth 10 | Write-Host
        Write-Host ""
        
        Write-Host "All endpoint tests completed successfully!" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Host "Endpoint Test Failed:" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        
        if ($_.Exception.Response) {
            Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
        }
        
        if ($DebugMode) {
            Write-Host "Full Exception Details:" -ForegroundColor Yellow
            Write-Host $_.Exception.ToString() -ForegroundColor Yellow
        }
        
        return $false
    }
}

# Main execution
try {
    $result = Test-MasterEndpoint -ServerName $ServerName -DebugMode $EnableDebug.IsPresent
    
    if ($result) {
        Write-Host "Master endpoint test completed successfully" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "Master endpoint test failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Unexpected error occurred: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}