# Open Questions 自律調査レポート

**作成日**: 2026-04-17
**対象**: `docs/plan-pwa-startup-optimization.md` Section 9 の未解決事項 5件

---

## 結論サマリー

| # | 質問 | 調査結果 | プラン変更の要否 |
|---|------|------|------|
| 1 | Netlify プラン / タイムアウト上限 | **無料プラン前提で設計すべき（10秒上限）** | **要変更**：タイムアウト値を 15s → 9s に修正 |
| 2 | GAS データシート構造の厳密性 | 「ヘッダー1行＋年初から連番」前提で設計済み。計算経路は既に fallback として稼働中 | **要強化**：D-1 に検証ロジック追加 |
| 3 | MobileDatePicker の月またぎ連携 | **`setCurrentMonth` を呼んでいない**。現状は `getKintaiDataByDateApi` が内部で独自にデータ取得することで成立している | **要追加**：C-1 実装時に月同期処理が必須 |
| 4 | 更新バナーUI方針 | 既存の `LoadingModal` が `showVersionCheckModal` 経由で利用可能 | **方針確定**：既存コンポーネント再利用でOK |
| 5 | エラートラッキング導入 | **未導入**（Sentry/DataDog 等なし） | **スコープ外**：将来導入を推奨として残す |

---

## 1. Netlifyプラン / タイムアウト上限

### 調査内容

**確認したファイル**:
- `netlify.toml` の全セクション
- `package.json` の依存関係
- `.env.build` / `.env.local` / `.env.production`
- `.netlify/` ディレクトリ

**結果**:

```toml
# netlify.toml 全体を確認したが、[functions] セクションは存在しない
# → タイムアウト設定の上書きなし → デフォルト値適用
```

`netlify.toml` に以下が**存在しない**:
- `[functions]` ブロック
- `timeout = ...` の明示指定
- `[functions."kintai-api"]` の個別設定

### 判定

Netlify の**デフォルトタイムアウト**:
- **Free / Starter プラン**: Synchronous function は **10秒**
- **Pro 以上**: Synchronous function は **26秒**

どちらのプランかは運用環境依存だが、**設計上は最も厳しい「無料プラン（10秒）」を前提にすべき**。有料プランなら後で緩めるのは容易。

### プラン修正点

| 元プラン | 修正後 |
|------|------|
| クライアント `timeout = 15_000` | **`timeout = 9_000`**（Netlify 10秒より1秒短く） |
| クライアント `maxRetries = 1` | **`maxRetries = 1`**（据え置き） |
| Netlify Function `AbortController timeout = 9_000` | **`timeout = 8_000`**（クライアントタイムアウトより短く、500ms程度の逃げを残す） |

**最悪ケース**: 9s + 1.5s + 9s = **19.5秒**（1回失敗時）。現状30秒から10秒以上短縮。

### 追加提案

`netlify.toml` に以下を追加して明示的に制御してもよい：

```toml
[functions]
  node_bundler = "esbuild"

[functions."kintai-api"]
  # Free プランでは無視される（上限10秒）。Pro 以降で余裕を持たせる場合のみ有効化
  # timeout = 25
```

---

## 2. GAS データシート構造の厳密性

### 調査内容

`GAS/kintai.gs` の該当コード（`findOrCalculateRowByDate`, `searchRowByDate`, `getDayOfYear`）を精読。

**現状の設計**:
```
findOrCalculateRowByDate(sheet, dateStr):
  1. searchRowByDate で A列を TextFinder 検索
  2. 見つかったらその行番号を返す
  3. 見つからなければ: HEADER_ROWS(1) + getDayOfYear(year, month, day) で計算
```

**重要な発見**:

- **計算経路（`HEADER_ROWS + dayOfYear`）は既に fallback として稼働中**
- `getDayOfYear` はうるう年対応済み（`kintai.gs:459-462`）
- つまり、データシートは**「ヘッダー1行 + 1月1日から12月31日まで1行ずつ連番」**の前提で設計されている
- この前提が崩れていれば、**現在の save 操作もすでに壊れている**（新規日付追加時に計算経路に落ちる）

### 判定

前提は**暗黙的だが強固に成立している**。ただし以下のリスクがある:

| リスク | 発生条件 | 深刻度 |
|------|------|------|
| 複数年のデータが同一シートに混在 | 2025年と2026年が同じシート | **高** — `searchRowByDate` の TextFinder が最初にヒットした行を返すため、年違いの同月同日で誤マッチ |
| 月の間に空白行が挿入 | 手動で行を挿入した | 中 — 計算値とズレる |
| 2月29日の扱い（うるう年以外） | うるう年でない年のシートに2/29行が存在 | 低 — `getDayOfYear` の計算と一致 |

### プラン修正点

Phase D-1 を**「計算 + 検証」パターン**に強化:

```js
function calculateRowByDate(year, month, day) {
  const HEADER_ROWS = 1;
  return HEADER_ROWS + getDayOfYear(year, month, day);
}

function calculateAndVerifyRow(sheet, targetDateStr) {
  const [yearStr, monthStr, dayStr] = targetDateStr.split('/');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const calculatedRow = calculateRowByDate(year, month, day);

  // 検証: 計算行のA列日付が実データと一致するか確認（1セル読み取りのみ）
  try {
    const lastRow = sheet.getLastRow();
    if (calculatedRow > lastRow || calculatedRow < 2) {
      return searchRowByDate(sheet, targetDateStr); // 範囲外なら探索 fallback
    }

    const cellValue = sheet.getRange(calculatedRow, 1).getValue();
    let cellDateStr = '';
    if (cellValue instanceof Date) {
      const y = cellValue.getFullYear();
      const m = (cellValue.getMonth() + 1).toString().padStart(2, '0');
      const d = cellValue.getDate().toString().padStart(2, '0');
      cellDateStr = `${y}/${m}/${d}`;
    } else if (typeof cellValue === 'string') {
      cellDateStr = normalizeDate(cellValue);
    }

    if (cellDateStr === targetDateStr) {
      return calculatedRow; // 一致 → 計算経路成功
    }
  } catch (_) {}

  // 検証失敗 → TextFinder fallback（これまで通りの安全側）
  return searchRowByDate(sheet, targetDateStr);
}
```

**コスト**: `getRange().getValue()` 1セルのみ。TextFinder（シート全A列）より数十倍速い。

**使い分け**:
- `handleGetMonthlyData`: `calculateRowByDate` のみ使用（検証不要、速度優先）
- `handleSaveKintai`: `calculateAndVerifyRow` 使用（書き込み前の検証必須）

### 実装前の必須確認事項

**ユーザーに依頼必要**: 運用中のデータシート（シート名「データ」）をスクリーンショットで共有してほしい。以下が確認できればD-1を安全に実施できる。
- ヘッダー行が1行のみか
- A列が「YYYY年M月D日（曜）」または Date 型で年初から連番か
- 複数年が同一シートに混在していないか

（または、GAS内に診断関数を追加して実行結果をもらう）

---

## 3. MobileDatePicker の月またぎ連携

### 調査内容

`src/components/MobileDatePicker.tsx` 全126行を精読。

**判明した事実**:

1. `MobileDatePicker` は `onChange(date: string)` で YYYY-MM-DD 文字列のみを親（`KintaiForm`）に返す
2. `handlePreviousDay` / `handleNextDay` / `DatePicker` の `onChange` すべて、**`setCurrentMonth` や `setCurrentYear` を一切呼ばない**
3. `KintaiForm` 側でも `useKintai()` から取得しているのは `refreshData`, `getKintaiDataByDate` のみ。**`setCurrentMonth` / `setCurrentYear` は未使用**（`Grep` 結果: `No matches found`）

**現状の月またぎ動作**:

```
ユーザーが 4/17 → 5/1 に日付変更
  ↓
MobileDatePicker.onChange('2026-05-01')
  ↓
KintaiForm: dispatch(DATE_CHANGE) で formState.date = '2026-05-01'
  ↓
useEffect([deferredDate]) 発火
  ↓
getKintaiDataByDateApi('2026-05-01')
  ↓ 内部で
getMonthlyData(2026, 5)  ← ★ ここで独自に新月のデータ取得
```

つまり `getKintaiDataByDateApi` が**独自に `getMonthlyData` を呼ぶことで月またぎを成立させている**。

Context の `currentMonth` は 4 のまま。`KintaiContext.monthlyData` には4月のデータしか入っていない状態で、KintaiForm の表示は 5月のデータになる。

### 判定

**C-1（`getKintaiDataByDateApi` 廃止）を単純実装すると月またぎでデータ消失する**。

### プラン修正点

C-1 の実装に以下を**必須**で追加:

```tsx
// KintaiForm.tsx
const { monthlyData, isDataLoading, currentYear, currentMonth,
        setCurrentYear, setCurrentMonth } = useKintai();

// 日付変更時に Context の月を同期
useEffect(() => {
  if (!formState.date) return;
  const [yStr, mStr] = formState.date.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  if (y !== currentYear || m !== currentMonth) {
    // Context の年月を更新 → KintaiContext の useEffect が fetchMonthlyData を発火
    setCurrentYear(y);
    setCurrentMonth(m);
    // monthlyData は次の render で新月のデータに切り替わる
  }
}, [formState.date, currentYear, currentMonth, setCurrentYear, setCurrentMonth]);
```

**副次効果**: `MonthlyView` と `KintaiForm` で同じ月を見ていれば Context が共有されるので、月次ビューの表示も自動で同期する（現状もそうなるが、より一貫性が増す）。

**検証シナリオ追加**:
- 4月17日表示 → 日付ピッカーで 5月1日選択 → 5月のデータが表示されるか
- 1月1日 → 前日ボタン → 前年12月31日のデータが表示されるか（年またぎ）

---

## 4. バージョン更新通知 UI

### 調査内容

`src/App.tsx:26-27, 113-145, 175-189, 196-203` を精読。

**既存実装**:

```tsx
const [showVersionCheckModal, setShowVersionCheckModal] = useState(false);
const [versionModalMessage, setVersionModalMessage] = useState<string>("");

// update_available 検知時
case "VERSION_CHECK_RESULT":
  if (result.status === "update_available") {
    setVersionModalMessage("アップデートを実行します");
    setShowVersionCheckModal(true);
    swRegistrationRef.current?.active?.postMessage({ type: "APPLY_UPDATE" });
  }
  break;

// 適用完了時
case "UPDATE_APPLIED":
  setShowVersionCheckModal(false);
  window.location.reload(); // ← これを廃止する
  break;
```

`LoadingModal` は `isOpen`, `message`, `isLoading`, `showHeader`, `showFooter` を受け取る既存コンポーネント（`src/components/LoadingModal.tsx`）。

### 判定

**既存の `LoadingModal` を活用できる**。新規UIは不要。

### プラン確定方針

A-2（reload 廃止）の実装:

```tsx
case "UPDATE_APPLIED":
  setVersionModalMessage("新しいバージョンを準備しました。次回起動時に適用されます。");
  // 3秒後に自動的にモーダルを閉じる
  setTimeout(() => setShowVersionCheckModal(false), 3_000);
  break;
```

**UX判断**:
- 即時 reload は作業中断の原因になる（保存中など）
- 「次回起動時」は PWA にとって自然な適用タイミング
- バナー形式ではなくモーダルで明示すれば、ユーザーは更新があったことを認識できる
- `setTimeout` による自動クローズで操作不要

---

## 5. エラートラッキング導入

### 調査内容

`package.json` の `dependencies` / `devDependencies` 全30件を確認。

**結果**:

- **Sentry**: 未導入
- **DataDog RUM**: 未導入
- **Rollbar**: 未導入
- **Bugsnag**: 未導入
- **LogRocket**: 未導入
- **Google Analytics 4 / Tag Manager**: 未導入
- **ソースコード内の `grep -i sentry|datadog|rollbar|bugsnag|logrocket`**: マッチ0件（`docs/` 内のプラン記述と偶然の部分文字列マッチのみ）

### 判定

**エラートラッキング基盤は未整備**。

### プラン反映

本プラン（PWA起動高速化）の**スコープ外**として据え置く。

ただし以下を**追加の将来タスクとして記録**することを推奨:

- Phase F（計装）の拡張として `web-vitals` 導入は本プラン内
- 本格的なエラートラッキングは別タスクで検討
  - 無料枠: Sentry（5k events/month）
  - 軽量: `window.addEventListener('error')` + Beacon API で自前送信

---

## 最終的なプラン反映（差分サマリ）

以下を `docs/plan-pwa-startup-optimization.md` に反映する:

### 変更1: タイムアウト値（B-1, B-2）

- Netlify Function `AbortController timeout`: 25s → **8s**（Free前提）
- クライアント `fetchWithRetry timeout`: 15s → **9s**
- 最悪ケース記述: 19.5秒（1回失敗時）

### 変更2: GAS Phase D-1 を「計算+検証」に強化

- `calculateRowByDate`（純計算）と `calculateAndVerifyRow`（1セル検証付き）の2関数を導入
- 月次取得は純計算、保存時は検証付き
- シート構造の実機確認を**実装前の必須タスク**に昇格

### 変更3: C-1 に月同期ロジックを明示追加

- `KintaiForm` で `useEffect([formState.date])` に `setCurrentYear/setCurrentMonth` 同期を必須化
- 検証シナリオに「月またぎ」「年またぎ」を追加

### 変更4: UPDATE_APPLIED を「次回適用」方針に確定

- 既存 `LoadingModal` で「次回起動時に適用」メッセージ表示
- 3秒自動クローズ

### 変更5: エラートラッキングは別タスク化（スコープ外）

- `web-vitals` のみ本プランに含める

---

## 実装前に残る唯一の確認事項

**ユーザーに確認依頼が必要**:

**📋 GASデータシート「データ」の構造**:
- ヘッダーは1行のみか？
- A列が「1月1日」「1月2日」...「12月31日」の連番で並んでいるか？
- 単一年のみか、複数年が同居しているか？

以下のいずれかで確認可能:
1. スプレッドシートのスクリーンショット（A列先頭〜30行程度 + 最終行近辺）
2. GAS に診断関数を追加して実行（実装可能）

**この確認が取れるまで Phase D-1 は実装保留**、Phase A/B/C は並行して進められる。

---

*End of resolution document*
