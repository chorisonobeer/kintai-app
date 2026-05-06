# PWA起動時間ベンチマーク結果

**実行日時**: 2026-05-06T10:34:31.256Z
**実行環境**: Node.js v22.16.0 / linux

---

## 1. GAS API応答時間（ハードコードURL = 実運用URL）

URL: `https://script.google.com/macros/s/AKfycbwKy0xPeGCpj9TWikx6sMSb_BuppWhZnNEueNbnd...`

| # | type | elapsed | status |
|---|------|---------|--------|
| 1 | cold | 2901ms | 200 |
| 2 | warm | 1504ms | 200 |
| 3 | warm | 1961ms | 200 |
| 4 | warm | 2054ms | 200 |
| 5 | warm | 1879ms | 200 |
| 6 | warm | 1364ms | 200 |

**Cold**: 2901ms  |  **Warm**: min=1364ms / median=1879ms / mean=1752ms

## 2. GAS API応答時間（.env.production の別URL）

URL: `https://script.google.com/macros/s/AKfycbxPMNkuofB1CMjD872rhc6XomIckDxCjd0mYxn-s...`

| # | type | elapsed | status |
|---|------|---------|--------|
| 1 | cold | 1466ms | 403 |
| 2 | warm | 1494ms | 403 |
| 3 | warm | 1138ms | 403 |
| 4 | warm | 1239ms | 403 |
| 5 | warm | 1152ms | 403 |
| 6 | warm | 1282ms | 403 |

**Cold**: 1466ms  |  **Warm**: min=1138ms / median=1239ms / mean=1261ms

## 3. Google Sheets CSV応答時間

| Run | elapsed | status | size |
|-----|---------|--------|------|
| 1 | 1898ms | 200 | 99B |
| 2 | 1364ms | 200 | 99B |
| 3 | 1762ms | 200 | 99B |
| 4 | 641ms | 200 | 99B |
| 5 | 958ms | 200 | 99B |

**統計**: min=641ms / median=1364ms / mean=1325ms / p95=1898ms / max=1898ms

---

## 解釈（自動生成）

- **GAS コールドスタート**: 2901ms（この値がPWA初回起動時に最低限かかる）
- **GAS ウォーム応答**: ~1752ms（連続呼び出し時の平均）
- **コールド/ウォーム比**: 1.7倍

- **CSV取得時間**: ~1325ms（作業内容マスタの取得）

### 示唆
- GAS コールドスタートは2〜5秒。ウォーム時は1秒未満なら、SWRキャッシュの効果が最大化する