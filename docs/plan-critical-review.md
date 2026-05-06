# 実装プラン 批判的レビュー・最終評価

**評価日**: 2026-04-17
**対象**: `docs/plan-pwa-startup-optimization.md`（実測反映後）
**評価者視点**: 第三者レビュアーとして、実装合意の可否を判定
**評価方法**: 提案コード片の正確性、順序の妥当性、副作用の網羅性、UXの適切性を独立検証

---

## 📊 総合評価スコア: **7.7 / 10**

| 観点 | スコア | コメント |
|------|-------|---------|
| 戦略的方向性 | 9/10 | 実測に基づく判断、ボトルネック特定は正確 |
| 実測整合性 | 9/10 | 30秒内訳が数値で裏付け済み |
| 技術的正確性 | **7/10** ⚠️ | 実装コード片に3-4箇所の要修正 |
| リスク管理 | 8/10 | エッジケース網羅、ただしCACHE_NAMEライフサイクル不足 |
| UX配慮 | **6/10** ⚠️ | `UPDATE_APPLIED` 時の表示不整合、新バージョン適用遅延の説明不足 |
| 順序妥当性 | **7/10** ⚠️ | E-1 (SWR) の優先度を上げるべき |
| 実装可能性 | 8/10 | 修正後は問題なし |

### 判定: **条件付き許可**

「高評価」の基準を 8.5+ とした場合、**現状は届かない**。ただし、下記の5件を修正すれば **8.5-9.0** に到達し、実装許可可能。

---

## 🚨 要修正項目（実装前に対応必須）

### 修正1: `UPDATE_APPLIED` 時の LoadingModal 表示不整合

**問題箇所**: `docs/plan-open-questions-resolution.md` Section 4 の提案コード

```tsx
case "UPDATE_APPLIED":
  setVersionModalMessage("新しいバージョンを準備しました。次回起動時に適用されます。");
  setTimeout(() => setShowVersionCheckModal(false), 3_000);
  break;
```

**レビュー指摘**:
- `LoadingModal` は `isLoading={true}` で渡されており、**スピナーが表示され続ける**（`LoadingModal.tsx:44`）
- "準備しました" のメッセージと スピナーは UX 的に矛盾（処理中なのか完了なのか不明瞭）
- モーダルは `className="modal-overlay"` で **画面全体をブロック**（`LoadingModal.tsx:31`）している
- 本来「完了通知」は非ブロッキングであるべき

**修正案**: 新規に `VersionAppliedToast` コンポーネントを作るか、LoadingModal に `isSuccess` prop を追加してスピナーをチェックマークに切り替える。

**簡易対応**（新コンポーネント追加なし）:
```tsx
case "UPDATE_APPLIED":
  // モーダルを即閉じて、軽量な通知はコンソールログのみ（または将来的にトースト追加）
  setShowVersionCheckModal(false);
  console.log("新しいバージョンは次回起動時に適用されます");
  break;
```

ユーザーが「更新されたこと」を知る必要性は相対的に低い。明示通知は将来タスクで。

---

### 修正2: Netlify Function timeout が Free プラン上限にギリギリ

**問題箇所**: `docs/plan-pwa-startup-optimization.md` Section 12 の提案コード

```js
const tid = setTimeout(() => controller.abort(), 9_000); // Netlify Freeプランの10s制限より短く
```

**レビュー指摘**:
- Netlify Free プラン上限 **10秒**
- `controller.abort()` 後、catch節で response を組み立てて `return` するまで **最大 500ms〜1秒** 必要
- 9秒でabort + 1秒で後処理 = **10秒ちょうど**で Netlify 強制終了の可能性
- 実際の GAS 応答時間は 1.5〜2秒なので、タイムアウトの実用価値は「異常値の切り捨て」のみ

**修正案**:
```js
const tid = setTimeout(() => controller.abort(), 7_500); // 10sまでに2.5秒の逃げを確保
```

---

### 修正3: クライアント側の timeout 値が実測と乖離

**問題箇所**: 同 Section 12

```ts
async function fetchWithRetry(url, options, maxRetries = 1, timeout = 15_000) {
```

**レビュー指摘**:
- Netlify Function の実測 max: cold 5.5秒、warm 2.9秒
- クライアント 15秒 は過剰。Netlify 側が 10秒で切るので意味がない
- **リトライ発生時のユーザー体感**: 15秒 + 1.5秒(待機) + 15秒 = 31秒 ← **現状30秒よりも悪化の可能性**

**修正案**:
```ts
async function fetchWithRetry(url, options, maxRetries = 1, timeout = 11_000) {
  // Netlify 10s + 転送 1s = 11s で十分
  // リトライ込み最悪: 11s + 1.5s + 11s = 23.5s
}
```

---

### 修正4: C-1 の実装コードで「月判定」が脆弱

**問題箇所**: `docs/plan-pwa-startup-optimization.md` Section 12 の C-1 提案

```tsx
const contextMonth = monthlyData.length > 0
  ? monthlyData[0].date.substring(0, 7)
  : null;

if (contextMonth && contextMonth === targetMonth) {
  // Contextから取得
}
```

**レビュー指摘**:
- `monthlyData[0]?.date` に依存 → **その月のデータが空配列の場合、判定不能**
- 「この月はまだ一件も入力していない」ユーザーで機能破綻
- 真実の源は `KintaiContext.currentYear` / `currentMonth`

**修正案**:
```tsx
const targetYear = parseInt(deferredDate.substring(0, 4), 10);
const targetMonth = parseInt(deferredDate.substring(5, 7), 10);

// Context の年月と一致していて、データロードが完了しているか
const isContextSynced = targetYear === currentYear && targetMonth === currentMonth;
const isContextReady = isContextSynced && !isDataLoading;

if (isContextReady) {
  // monthlyData から直接取得（空配列でも正しく「データなし」と判定される）
  const data = getKintaiDataFromMonthlyData(deferredDate, monthlyData);
  applyDataToForm(data);
}
```

月同期 useEffect 側:
```tsx
useEffect(() => {
  if (!formState.date) return;
  const y = parseInt(formState.date.substring(0, 4), 10);
  const m = parseInt(formState.date.substring(5, 7), 10);

  if (y !== currentYear || m !== currentMonth) {
    // ★ React 18 自動バッチングで1回のrenderで両方更新される
    setCurrentYear(y);
    setCurrentMonth(m);
    // KintaiContext の useEffect([currentYear, currentMonth]) が発火 → fetchMonthlyData
  }
}, [formState.date]); // ← 依存は formState.date のみで十分（currentYear/currentMonthを入れると再実行が過剰）
```

依存配列を `[formState.date]` のみにすれば不要な再実行を防げる。

---

### 修正5: 実装順序で Phase E-1 (SWR) が後ろすぎる

**問題箇所**: `docs/plan-pwa-startup-optimization.md` Section 5 の Step 順序

```
現行順序: A → B → C → (D) → E → F
```

**レビュー指摘**:
- 実測で判明したとおり、**cold は物理限界 7-8秒、warm は SWR次第で < 1秒**
- ユーザーが最も頻繁に体験するのは warm start（2回目以降）
- Phase A/B/C は cold を短縮するが、**warm への効果は SWR が最大**
- 現在の sessionStorage キャッシュは「30分以内なら使う」だけで、**30分超過で必ず待つ** → これが warm 遅延の主因

**修正案**: 新しい順序
```
新順序: F-1 (計測) → A (SW) → C-1 (API重複) → E-1 (SWR) → B → C-2 → D

※ E-1 を前倒しすることで、Step 1-4 完了時点で
  - cold: 30s → 15s
  - warm: 10s → < 1s  ← ここが決定的
```

ユーザー体感として、**warm start の高速化が最も頻度の高い勝利**になる。

---

## 🟡 軽微な指摘（実装中に注意）

### 指摘1: CACHE_NAME のライフサイクル

Phase A-1 で「キャッシュ全削除をやめる」と、古いハッシュアセットが永続的に残る。

`vite.config.ts:47-49` でハッシュ付きファイル名なので、**新ハッシュは cache miss → ネットワーク取得**は正しく動く。ただし **古いハッシュは削除されない**。

**対策**（本プランのスコープ外だが記録）:
- `CACHE_NAME = 'kintai-app-v2'` を `v3`, `v4` とバンプする運用ルール
- もしくは、定期クリーンアップロジックを SW に追加

### 指摘2: 新バージョン適用が遅延するUX

「次回起動で適用」方式は PWA の自然な挙動だが、ユーザーには分かりづらい。

- 現状: 即 reload → ユーザーは中断させられるが新バージョンをすぐ利用
- 新仕様: ユーザーはアプリを閉じて開き直すまで古いバージョンを使う

**対策**:
- 短いバナー（非ブロッキング）で「アップデート済み。次回起動で有効」表示
- または App.tsx 内の State で「次回は新しい」を localStorage に保存しておき、次回起動時に通知

※ 本プランのスコープ外でよい。ただし運用上必要になる。

### 指摘3: `urlsToCache` から fonts 削除後の FOUT 発生

Phase A-4 で fonts を install 対象外にすると、**FOUT** (Flash of Unstyled Text) が発生する可能性。`display=swap` なので fallback フォントが一瞬表示される。

デザイン上の許容範囲か、要確認。

### 指摘4: Phase D-1 の実装リスクが高い

GAS の TextFinder 撤廃は効果 **-1〜2秒 のみ**で、シート構造前提が崩れると全データ破壊の可能性。

**実測による優先度**: 最後に回すべき。または削除候補。

### 指摘5: ベンチマーク再計測の基準が未定義

各 Phase 実装後、「何をもって成功とするか」の数値基準が不足。

**修正案**: 各 Step 完了時に `scripts/benchmark-startup.mjs` を再実行 + `performance.mark` で計測値を取得 → 事前に定義した合格ラインと比較。

---

## ✅ 高く評価できる点

1. **実測データへの適応**: 推定 → 実測 → プラン修正 のループが機能している
2. **Phase B の優先度を下げる判断**: リトライ未発動という実測結果に素直
3. **段階的リリース戦略**: リスク高の D を最後に回す設計
4. **ロールバック計画**: 各 Step で rollback 手順が明確
5. **3回チェック + 専門家レビュー**: 多面的な検証プロセス
6. **計測基盤の導入**: `scripts/benchmark-startup.mjs` と `performance.mark` で再現性確保

---

## 🎯 実装許可に向けた条件

以下の5件の修正をプランに反映すれば、**総合スコア 8.5+** に到達し、実装許可可能。

| # | 修正内容 | ファイル | 対応時間 |
|---|---------|---------|---------|
| 1 | `UPDATE_APPLIED` 時のモーダル即閉じに変更 | plan-*.md | 3分 |
| 2 | Netlify Function timeout: 9s → **7.5s** | plan-*.md | 1分 |
| 3 | クライアント timeout: 15s → **11s** | plan-*.md | 1分 |
| 4 | C-1 の月判定ロジックを `currentYear/currentMonth` ベースに | plan-*.md | 5分 |
| 5 | 実装順序で **E-1 (SWR) を Step 5 に前倒し** | plan-*.md | 3分 |

修正時間合計: **13分**

---

## 📋 最終判定

### 条件付き許可

**修正5件を反映後、実装開始を許可**。

修正後の期待効果（実測整合）:
- 実装 1〜4 完了時点: cold 30s → **15s**、warm 10s → **2s**
- 実装 5 (SWR) 完了時点: cold 15s、warm **< 1s** ← 体感激変
- 全 Phase 完了時点: cold **10-13s**、warm **< 1s**
- Edge Function 移行検討後: cold **6-8s**、warm < 1s

### 実装着手前のチェックリスト

- [ ] 上記修正5件を `plan-pwa-startup-optimization.md` に反映
- [ ] GASデータシート構造の確認（Phase D 実施前）
- [ ] 各 Step 完了時に benchmark-startup.mjs 実行 → 数値記録
- [ ] `performance.mark` をブラウザで実測（Step 1）
- [ ] リリース1（Step 2〜5）を別コミットで分割
- [ ] ロールバック手順を README.md か CLAUDE.md に追記

### 実装中止を検討すべきサイン

以下が発生したら一時停止・再評価:

1. Phase A-2 実装後、ユーザーから「新バージョンが反映されない」苦情
2. Phase C-1 実装後、月またぎ操作でデータ消失
3. Phase E-1 実装後、古いデータが延々と表示される（revalidate失敗）

これらは各 Phase のロールバック手順で即復旧可能。

---

*このレビューは批判的観点から独立検証したもの。レビュー承認と実装許可は別プロセス。*
