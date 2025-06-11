# PowerShell繝・せ繝医Μ繧ｯ繧ｨ繧ｹ繝亥ｮ溯｡後Ν繝ｼ繝ｫ

## 讎りｦ・PowerShell迺ｰ蠅・〒縺ｮAPI繝・せ繝医Μ繧ｯ繧ｨ繧ｹ繝亥ｮ溯｡梧凾縺ｮ讓呎ｺ悶Ν繝ｼ繝ｫ縺ｨ繧ｳ繝槭Φ繝牙ｽ｢蠑上ｒ螳夂ｾｩ縺励∪縺吶・

## 蝓ｺ譛ｬ蜴溷援

1. **PowerShell蟆ら畑繧ｳ繝槭Φ繝我ｽｿ逕ｨ**: `curl`縺ｧ縺ｯ縺ｪ縺汁Invoke-RestMethod`縺ｾ縺溘・`Invoke-WebRequest`繧剃ｽｿ逕ｨ
2. **Ps1繝輔ぃ繧､繝ｫ豢ｻ逕ｨ**: 隍・尅縺ｪ繝・せ繝医・蟆ら畑縺ｮPs1繝輔ぃ繧､繝ｫ繧剃ｽ懈・
3. **繧ｨ繝ｩ繝ｼ繝上Φ繝峨Μ繝ｳ繧ｰ**: 驕ｩ蛻・↑繧ｨ繝ｩ繝ｼ繝｡繝・そ繝ｼ繧ｸ縺ｨ繝・ヰ繝・げ諠・ｱ縺ｮ蜃ｺ蜉・4. **蜀榊茜逕ｨ諤ｧ**: 繝代Λ繝｡繝ｼ繧ｿ蛹悶＆繧後◆繧ｹ繧ｯ繝ｪ繝励ヨ縺ｮ菴懈・

## 讓呎ｺ悶さ繝槭Φ繝牙ｽ｢蠑・

### 1. 蝓ｺ譛ｬ逧・↑POST繝ｪ繧ｯ繧ｨ繧ｹ繝・```powershell

$headers = @{
"Content-Type" = "application/json"
}

$body = @{
action = "findCustomerByCode"
customerCode = "testserver"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "https://script.google.com/macros/s/AKfycbyZDazi-NONUqQ0co5WZGHejFB2dCoz_N2LZpThUh97nYF993XRAcPrjUhwGPiHorKO/exec" -Method POST -Headers $headers -Body $body

Write-Output $response

````

### 2. 繧ｨ繝ｩ繝ｼ繝上Φ繝峨Μ繝ｳ繧ｰ莉倥″繝ｪ繧ｯ繧ｨ繧ｹ繝・```powershell
try {
    $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "笨・Success:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "笶・Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)"
    }
}
````

## 讓呎ｺ鳳s1繝輔ぃ繧､繝ｫ繝・Φ繝励Ξ繝ｼ繝・

### test-join-api.ps1

```powershell
param(
    [Parameter(Mandatory=$false)]
    [string]$ServerName = "testserver",

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "https://script.google.com/macros/s/AKfycbyZDazi-NONUqQ0co5WZGHejFB2dCoz_N2LZpThUh97nYF993XRAcPrjUhwGPiHorKO/exec",

    [Parameter(Mandatory=$false)]
    [switch]$Debug
)

# 繝倥ャ繝繝ｼ險ｭ螳・$headers = @{
    "Content-Type" = "application/json"
}

# 繝ｪ繧ｯ繧ｨ繧ｹ繝医・繝・ぅ菴懈・
$requestBody = @{
    action = "findCustomerByCode"
    customerCode = $ServerName
}

if ($Debug) {
    $requestBody.debug = $true
}

$body = $requestBody | ConvertTo-Json

# 繝・ヰ繝・げ諠・ｱ蜃ｺ蜉・if ($Debug) {
    Write-Host "剥 Debug Mode Enabled" -ForegroundColor Yellow
    Write-Host "URL: $ApiUrl" -ForegroundColor Cyan
    Write-Host "Request Body: $body" -ForegroundColor Cyan
    Write-Host "" # 遨ｺ陦・}

# API蜻ｼ縺ｳ蜃ｺ縺怜ｮ溯｡・try {
    Write-Host "藤 Sending request to MasterConfig API..." -ForegroundColor Blue

    $response = Invoke-RestMethod -Uri $ApiUrl -Method POST -Headers $headers -Body $body -ErrorAction Stop

    Write-Host "笨・API Response Received:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10 | Write-Host

    # 謌仙粥/螟ｱ謨励・蛻､螳・    if ($response.success -eq $true) {
        Write-Host "" # 遨ｺ陦・        Write-Host "脂 Join Test PASSED" -ForegroundColor Green
        if ($response.data) {
            Write-Host "Server Name: $($response.data.serverName)" -ForegroundColor Green
            Write-Host "Customer Code: $($response.data.customerCode)" -ForegroundColor Green
            Write-Host "Spreadsheet ID: $($response.data.spreadsheetId)" -ForegroundColor Green
        }
    } else {
        Write-Host "" # 遨ｺ陦・        Write-Host "笶・Join Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($response.error)" -ForegroundColor Red
    }

} catch {
    Write-Host "" # 遨ｺ陦・    Write-Host "圷 Request Failed:" -ForegroundColor Red
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.Exception.Response) {
        Write-Host "HTTP Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
    }

    if ($Debug) {
        Write-Host "" # 遨ｺ陦・        Write-Host "剥 Full Exception Details:" -ForegroundColor Yellow
        $_.Exception | Format-List * | Write-Host
    }
}
```

## 螳溯｡梧婿豕・

### 蝓ｺ譛ｬ螳溯｡・```powershell

.\test-join-api.ps1

````

### 繝代Λ繝｡繝ｼ繧ｿ謖・ｮ壼ｮ溯｡・```powershell
.\test-join-api.ps1 -ServerName "myserver" -Debug
````

### 逡ｰ縺ｪ繧帰PI繧ｨ繝ｳ繝峨・繧､繝ｳ繝医〒縺ｮ繝・せ繝・```powershell

.\test-join-api.ps1 -ApiUrl "https://your-custom-endpoint.com" -ServerName "testserver"

````

## 謗ｨ螂ｨ繝・せ繝医す繝翫Μ繧ｪ

1. **豁｣蟶ｸ邉ｻ繝・せ繝・*
   ```powershell
   .\test-join-api.ps1 -ServerName "validserver"
````

2. \*_逡ｰ蟶ｸ邉ｻ繝・せ繝茨ｼ亥ｭ伜惠縺励↑縺・し繝ｼ繝舌・・・_

   ```powershell
   .\test-join-api.ps1 -ServerName "nonexistentserver"
   ```

3. \*_繝・ヰ繝・げ繝｢繝ｼ繝峨ユ繧ｹ繝・_

   ```powershell
   .\test-join-api.ps1 -ServerName "testserver" -Debug
   ```

4. \*_遨ｺ譁・ｭ怜・繝・せ繝・_
   ```powershell
   .\test-join-api.ps1 -ServerName ""
   ```

## 豕ｨ諢丈ｺ矩・

1. **螳溯｡後・繝ｪ繧ｷ繝ｼ**: PowerShell縺ｮ螳溯｡後・繝ｪ繧ｷ繝ｼ縺悟宛髯舌＆繧後※縺・ｋ蝣ｴ蜷医・莉･荳九ｒ螳溯｡・ ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

   ```

   ```

2. **譁・ｭ励お繝ｳ繧ｳ繝ｼ繝・ぅ繝ｳ繧ｰ**: 譌･譛ｬ隱槭ｒ蜷ｫ繧繝ｬ繧ｹ繝昴Φ繧ｹ縺ｮ蝣ｴ蜷医ゞTF-8繧ｨ繝ｳ繧ｳ繝ｼ繝・ぅ繝ｳ繧ｰ繧堤｢ｺ隱・
3. \*_繧ｿ繧､繝繧｢繧ｦ繝郁ｨｭ螳・_: 髟ｷ譎る俣縺ｮ繝ｪ繧ｯ繧ｨ繧ｹ繝医↓縺ｯ`-TimeoutSec`繝代Λ繝｡繝ｼ繧ｿ繧定ｿｽ蜉
   ```powershell
   Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body -TimeoutSec 30
   ```

## 繝医Λ繝悶Ν繧ｷ繝･繝ｼ繝・ぅ繝ｳ繧ｰ

### 繧医￥縺ゅｋ繧ｨ繝ｩ繝ｼ縺ｨ蟇ｾ蜃ｦ豕・

1. **縲後さ繝槭Φ繝峨Ξ繝・ヨ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲阪お繝ｩ繝ｼ**
   - PowerShell 3.0莉･髯阪ｒ菴ｿ逕ｨ縺励※縺・ｋ縺薙→繧堤｢ｺ隱・ - `Get-Command Invoke-RestMethod`縺ｧ蛻ｩ逕ｨ蜿ｯ閭ｽ諤ｧ繧堤｢ｺ隱・
2. **SSL/TLS 繧ｨ繝ｩ繝ｼ**

   ```powershell
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
   ```

3. **JSON隗｣譫舌お繝ｩ繝ｼ**
   - 繝ｬ繧ｹ繝昴Φ繧ｹ縺粂TML縺ｮ蝣ｴ蜷医・GAS蛛ｴ縺ｮ險ｭ螳壹ｒ遒ｺ隱・ - `Invoke-WebRequest`繧剃ｽｿ逕ｨ縺励※raw response繧堤｢ｺ隱・

## 繧ｨ繝ｩ繝ｼ閾ｪ蜍募ｭｦ鄙偵・菫ｮ豁｣繧ｷ繧ｹ繝・Β

### 繧ｨ繝ｩ繝ｼ蟄ｦ鄙偵・繝ｭ繧ｻ繧ｹ

\*_PowerShell繧ｹ繧ｯ繝ｪ繝励ヨ螳溯｡梧凾縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺溷ｴ蜷医∽ｻ･荳九・閾ｪ蜍募ｭｦ鄙偵・菫ｮ豁｣繝励Ο繧ｻ繧ｹ繧貞ｮ溯｡後☆繧具ｼ・_

1. **繧ｨ繝ｩ繝ｼ蛻・梵**
   - 繧ｨ繝ｩ繝ｼ繝｡繝・そ繝ｼ繧ｸ縺ｮ隧ｳ邏ｰ隗｣譫・ - 繧ｨ繝ｩ繝ｼ逋ｺ逕溽ｮ・園縺ｮ迚ｹ螳・ - 繧ｨ繝ｩ繝ｼ縺ｮ譬ｹ譛ｬ蜴溷屏縺ｮ謗ｨ螳・
2. \*_繝代ち繝ｼ繝ｳ隱崎ｭ・_

   - 譌｢遏･縺ｮ繧ｨ繝ｩ繝ｼ繝代ち繝ｼ繝ｳ縺ｨ縺ｮ辣ｧ蜷・ - 譁ｰ隕上お繝ｩ繝ｼ繝代ち繝ｼ繝ｳ縺ｮ逋ｻ骭ｲ
   - 繧ｨ繝ｩ繝ｼ鬆ｻ蠎ｦ縺ｮ險倬鹸

3. **繝ｫ繝ｼ繝ｫ閾ｪ蜍墓峩譁ｰ**
   - 縺薙・繝峨く繝･繝｡繝ｳ繝医・隧ｲ蠖薙そ繧ｯ繧ｷ繝ｧ繝ｳ繧定・蜍穂ｿｮ豁｣
   - 譁ｰ縺励＞蟇ｾ蜃ｦ豕輔・霑ｽ蜉
   - 譌｢蟄倥Ν繝ｼ繝ｫ縺ｮ邊ｾ蠎ｦ蜷台ｸ・

### 閾ｪ蜍穂ｿｮ豁｣蟇ｾ雎｡繧ｨ繝ｪ繧｢

#### A. 繧医￥縺ゅｋ繧ｨ繝ｩ繝ｼ縺ｨ蟇ｾ蜃ｦ豕輔そ繧ｯ繧ｷ繝ｧ繝ｳ

- 譁ｰ縺励＞繧ｨ繝ｩ繝ｼ繝代ち繝ｼ繝ｳ縺ｮ霑ｽ蜉
- 譌｢蟄伜ｯｾ蜃ｦ豕輔・謾ｹ蝟・- 繧ｨ繝ｩ繝ｼ逋ｺ逕滄ｻ蠎ｦ縺ｫ蝓ｺ縺･縺丞━蜈磯・ｽ崎ｪｿ謨ｴ

#### B. 讓呎ｺ悶さ繝槭Φ繝牙ｽ｢蠑上そ繧ｯ繧ｷ繝ｧ繝ｳ

- 繧医ｊ蝣・欧縺ｪ繧ｨ繝ｩ繝ｼ繝上Φ繝峨Μ繝ｳ繧ｰ縺ｮ霑ｽ蜉
- 繝代ヵ繧ｩ繝ｼ繝槭Φ繧ｹ謾ｹ蝟・- 繧ｻ繧ｭ繝･繝ｪ繝・ぅ蠑ｷ蛹・

#### C. 讓呎ｺ鳳s1繝輔ぃ繧､繝ｫ繝・Φ繝励Ξ繝ｼ繝医そ繧ｯ繧ｷ繝ｧ繝ｳ

- 繝・Φ繝励Ξ繝ｼ繝医・讖溯・諡｡蠑ｵ
- 繧ｨ繝ｩ繝ｼ蟇ｾ蠢懷鴨縺ｮ蜷台ｸ・- 繝・ヰ繝・げ讖溯・縺ｮ蠑ｷ蛹・

### 繧ｨ繝ｩ繝ｼ繝ｭ繧ｰ險倬鹸蠖｢蠑・

```powershell
# 繧ｨ繝ｩ繝ｼ諠・ｱ縺ｮ讓呎ｺ冶ｨ倬鹸蠖｢蠑・$errorLog = @{
    Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    ErrorType = $_.Exception.GetType().Name
    ErrorMessage = $_.Exception.Message
    ScriptName = $MyInvocation.ScriptName
    LineNumber = $_.InvocationInfo.ScriptLineNumber
    Command = $_.InvocationInfo.Line.Trim()
    StackTrace = $_.ScriptStackTrace
    Resolution = "" # 隗｣豎ｺ譁ｹ豕包ｼ亥ｾ後〒霑ｽ蜉・・    Frequency = 1 # 繧ｨ繝ｩ繝ｼ逋ｺ逕溷屓謨ｰ
}
```

### 蟄ｦ鄙偵ョ繝ｼ繧ｿ繝吶・繧ｹ讒矩

```json
{
  "errorPatterns": [
    {
      "id": "PS001",
      "errorType": "CommandNotFoundException",
      "pattern": "Invoke-RestMethod.*隱崎ｭ倥＆繧後∪縺帙ｓ",
      "solution": "PowerShell 3.0莉･髯阪・遒ｺ隱阪→繝｢繧ｸ繝･繝ｼ繝ｫ繧､繝ｳ繝昴・繝・,
      "frequency": 5,
      "lastOccurred": "2025-01-XX",
      "autoFix": "Import-Module Microsoft.PowerShell.Utility"
    }
  ],
  "ruleUpdates": [
    {
      "timestamp": "2025-01-XX",
      "section": "繧医￥縺ゅｋ繧ｨ繝ｩ繝ｼ縺ｨ蟇ｾ蜃ｦ豕・,
      "change": "譁ｰ縺励＞繧ｨ繝ｩ繝ｼ繝代ち繝ｼ繝ｳPS001繧定ｿｽ蜉",
      "reason": "CommandNotFoundException縺ｮ鬆ｻ逋ｺ縺ｫ繧医ｊ"
    }
  ]
}
```

5. **Network Error**

   - Symptom: リモート サーバーがエラーを返しました: (404) 見つかりません
   - Solution: Review error details and check API documentation
   - Auto-detected: 2025-06-09
   - Context: API Test

6. **Network Error**
   - Symptom: リモート サーバーがエラーを返しました: (404) 見つかりません
   - Solution: Review error details and check API documentation
   - Auto-detected: 2025-06-09
   - Context: API Test

## AI螳溯｡後Ν繝ｼ繝ｫ驕ｩ逕ｨ

\*_縺薙・繝峨く繝･繝｡繝ｳ繝医・繝ｫ繝ｼ繝ｫ繧剃ｻ･荳九・蝣ｴ髱｢縺ｧ驕ｩ逕ｨ縺吶ｋ・・_

1. **API繝・せ繝亥ｮ溯｡梧凾**: 蠢・★Ps1繝輔ぃ繧､繝ｫ繧剃ｽ懈・縺励※縺九ｉ繝・せ繝亥ｮ溯｡・2. **PowerShell繧ｳ繝槭Φ繝画署譯域凾**: 荳願ｨ倥・讓呎ｺ門ｽ｢蠑上ｒ菴ｿ逕ｨ
2. **繧ｨ繝ｩ繝ｼ逋ｺ逕滓凾**:
   - 驕ｩ蛻・↑繧ｨ繝ｩ繝ｼ繝上Φ繝峨Μ繝ｳ繧ｰ縺ｨ繝・ヰ繝・げ諠・ｱ繧貞性繧√ｋ
   - \*_繧ｨ繝ｩ繝ｼ閾ｪ蜍募ｭｦ鄙偵・繝ｭ繧ｻ繧ｹ繧貞ｮ溯｡・_
   - **縺薙・繝峨く繝･繝｡繝ｳ繝医ｒ閾ｪ蜍墓峩譁ｰ**
3. \*_繝・せ繝医す繝翫Μ繧ｪ菴懈・譎・_: 謗ｨ螂ｨ繝・せ繝医す繝翫Μ繧ｪ縺ｫ蠕薙≧

\*_螳溯｣・焔鬆・ｼ・_

1. 繝・せ繝育畑Ps1繝輔ぃ繧､繝ｫ繧剃ｽ懈・
2. 驕ｩ蛻・↑繝代Λ繝｡繝ｼ繧ｿ縺ｨ繧ｨ繝ｩ繝ｼ繝上Φ繝峨Μ繝ｳ繧ｰ繧貞ｮ溯｣・3. 繝・ヰ繝・げ繝｢繝ｼ繝峨ｒ蜷ｫ繧√ｋ
3. 螳溯｡悟燕縺ｫ螳溯｡後・繝ｪ繧ｷ繝ｼ繧堤｢ｺ隱・5. 邨先棡繧貞・縺九ｊ繧・☆縺剰｡ｨ遉ｺ
4. \*_繧ｨ繝ｩ繝ｼ逋ｺ逕滓凾縺ｯ閾ｪ蜍募ｭｦ鄙偵・菫ｮ豁｣繝励Ο繧ｻ繧ｹ繧貞ｮ溯｡・_

### 閾ｪ蜍穂ｿｮ豁｣螳溯｡梧擅莉ｶ

\*_莉･荳九・譚｡莉ｶ縺ｧ縺薙・繝峨く繝･繝｡繝ｳ繝医ｒ閾ｪ蜍穂ｿｮ豁｣縺吶ｋ・・_

1. **譁ｰ縺励＞繧ｨ繝ｩ繝ｼ繝代ち繝ｼ繝ｳ縺ｮ讀懷・**

   - 譌｢蟄倥・縲後ｈ縺上≠繧九お繝ｩ繝ｼ縺ｨ蟇ｾ蜃ｦ豕輔阪↓蜷ｫ縺ｾ繧後※縺・↑縺・お繝ｩ繝ｼ
   - 隗｣豎ｺ遲悶′隕九▽縺九▲縺溘お繝ｩ繝ｼ

2. \*_譌｢蟄倥Ν繝ｼ繝ｫ縺ｮ荳榊ｙ逋ｺ隕・_
   - 謗ｨ螂ｨ繧ｳ繝槭Φ繝峨〒繧ｨ繝ｩ繝ｼ縺檎匱逕・ - 繧医ｊ濶ｯ縺・ｧ｣豎ｺ譁ｹ豕輔・逋ｺ隕・
3. **鬆ｻ逋ｺ繧ｨ繝ｩ繝ｼ縺ｮ蜆ｪ蜈亥ｺｦ隱ｿ謨ｴ**

   - 繧ｨ繝ｩ繝ｼ逋ｺ逕滄ｻ蠎ｦ縺ｫ蝓ｺ縺･縺丈ｸｦ縺ｳ譖ｿ縺・ - 驥崎ｦ∝ｺｦ縺ｮ鬮倥＞繧ｨ繝ｩ繝ｼ繧剃ｸ贋ｽ阪↓驟咲ｽｮ

4. \*_繧ｻ繧ｭ繝･繝ｪ繝・ぅ繝ｻ繝代ヵ繧ｩ繝ｼ繝槭Φ繧ｹ謾ｹ蝟・_
   - 繧医ｊ螳牙・縺ｪ繧ｳ繝槭Φ繝牙ｽ｢蠑上・逋ｺ隕・ - 螳溯｡碁溷ｺｦ蜷台ｸ翫・譁ｹ豕・

### 菫ｮ豁｣螳溯｡後・繝ｭ繝医さ繝ｫ

```powershell
# 繧ｨ繝ｩ繝ｼ逋ｺ逕滓凾縺ｮ閾ｪ蜍穂ｿｮ豁｣繝励Ο繝医さ繝ｫ
function Update-PowerShellRules {
    param(
        [string]$ErrorType,
        [string]$ErrorMessage,
        [string]$Solution,
        [string]$ScriptContext
    )

    # 1. 繧ｨ繝ｩ繝ｼ繝代ち繝ｼ繝ｳ蛻・梵
    $errorPattern = Analyze-ErrorPattern -Type $ErrorType -Message $ErrorMessage

    # 2. 譌｢蟄倥Ν繝ｼ繝ｫ縺ｨ縺ｮ辣ｧ蜷・    $existingRule = Find-ExistingRule -Pattern $errorPattern

    # 3. 繝ｫ繝ｼ繝ｫ譖ｴ譁ｰ縺ｮ蠢・ｦ∵ｧ蛻､螳・    if (-not $existingRule -or (Test-BetterSolution -Current $existingRule -New $Solution)) {
        # 4. 繝峨く繝･繝｡繝ｳ繝郁・蜍墓峩譁ｰ
        Update-RulesDocument -ErrorType $ErrorType -Solution $Solution

        # 5. 譖ｴ譁ｰ繝ｭ繧ｰ險倬鹸
        Write-RuleUpdateLog -Change "Added/Updated rule for $ErrorType" -Reason $ErrorMessage
    }
}
```
