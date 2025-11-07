# 日次画面で日付移動後に前日のデータが残存表示する不具合の解析報告

## 概要（症状）
- 日次入力画面にて、ある日の入力を完了して保存（Save）後、前日・翌日に移動すると、移動先の日付にデータがない場合でも「保存した日の入力値」がそのまま表示され続ける。

## 再現手順（代表例）
1. 例えば `2025-05-02` に開始・終了・休憩などを入力し、Save を実行。
2. そのまま前日（`2025-05-01`）へ移動。
3. `2025-05-01` にデータが存在しない場合でも、`2025-05-02` の入力値が残ったまま表示される。

## 技術的背景と観測
- 日付変更時のロードは `KintaiForm.tsx` の `useEffect`（依存: `deferredDate`）で実行される。
- この `useEffect` 内では「編集中（`isEditing`）または dirty（`isDirtyRef`）の場合はリセットを抑止」するロジックが存在。
- ロード直前の初期化（入力値クリア）は、`!formState.isEditing && !isDirtyRef.current` のときのみ実行される。
- 保存成功後、Reducer `SAVE_COMPLETE` により `isEditing` は `false` になるが、`isDirtyRef` は保存直後に明示的に `false` にリセットされないため、日付変更のタイミングによっては dirty が立ったままで初期化がスキップされる。
- また、移動先の日付にデータが存在しない場合（`entered === false`）、ロード時の「データ反映」も行われないため、結果として「前日の入力値が未初期化のまま残存」する。

## 原因の切り分け
- 主因:
  - `KintaiForm.tsx` の日付変更処理における初期化条件が厳しすぎる（`!isEditing && !isDirtyRef` の両方を満たさないと初期化しない）。
  - 保存完了後も `isDirtyRef` が即時にクリアされず、直後の日付変更で初期化が抑止される。
- 副因:
  - `compareLogics`/`getKintaiDataByDate` の判定は「当月の `monthlyData`」に依存。月またぎ（例: 5/1 ← 4/30）では `entered` が `false` になりやすく、データ反映が行われないため、初期化が抑止されている場合に残存表示が顕在化する。

## 影響範囲
- 日次入力画面の「日付移動時のUI表示」。
- 特に「移動先に既存データがない場合」に旧日の入力値が残る。
- 月またぎ移動（前月・翌月）で顕著になりやすい。

## 改善プラン（最小構成・根本対策）
1. 初期化条件の緩和:
   - 日付が実際に変更されたときは、`isDirtyRef` の値に関わらず「編集中でない限り」入力値を初期化する。
   - 具体例: `if (!formState.isEditing) { /* 初期化 */ }` とし、`!isDirtyRef.current` 条件を外す。
2. 保存成功後のdirtyフラグの明示クリア:
   - `handleSubmit` の保存成功直後、または `SAVE_COMPLETE` ハンドリング直後に `isDirtyRef.current = false;` を明示する。
3. 月またぎ時のデータ存在判定の安定化（任意）:
   - `compareLogics` / `isDateEntered` が「当月のみの `monthlyData`」に依存しているため、移動先が別月の場合は該当月の `monthlyData` を一時的に取得して判定する等。
   - シンプルな代替: `entered` が `false` の場合でも初期化は必ず行うため、UIの一貫性は保たれる（この場合3は必須ではない）。

## 実装上の留意点
- 初期化は「入力消失を防ぐため編集中は実施しない」ポリシーを維持。
- `useEffect` の依存は最小（`deferredDate`）のまま、ガード条件は「同一日付かつ編集中/dirty時」のみ抑止とし、日付が変わったら初期化を許可する。
- 保存成功後は `isEditing=false` であり、合わせて `isDirtyRef=false` とすることで、次の日付変更時に初期化が確実に実施される。

## 代替案とリスク
- 代替案: 日付変更ハンドラ（`handleDateChange`）で即時に `isDirtyRef=false` をセットする。
  - 長所: `useEffect` 内のタイミングに依存せず、初期化の抑止が起きにくい。
  - 短所: 編集途中の誤タップで日付が変わった際にも dirty がクリアされる可能性があり、意図せぬ初期化につながる。
- 現行案のリスク: `isEditing=true` のまま日付変更すると、初期化は走らず、ロードも抑止されるため UIは編集中の値を保持する。この挙動は「編集中は変更しない」設計意図どおりだが、UX上は注意が必要。

## 検証計画
- 単体試験:
  - 保存成功後に `isEditing=false`・`isDirtyRef=false` へ移行すること。
  - データなし日付へ移動した際、入力値が初期化（空/初期値）されること。
  - データあり日付へ移動した際、該当データへ正しく置換されること。
  - 編集中（`isEditing=true`）に日付変更しても、既存入力が維持され、ロード/初期化が抑止されること。
- E2E試験:
  - 同月内移動・月またぎ移動双方で上記が成立すること。

## 参考（該当コードポイント）
- `src/components/KintaiForm.tsx`
  - `useEffect`（依存: `deferredDate`）内の初期化条件と `isDirtyRef`/`prevDateRef` の扱い。
  - 入力変更ハンドラでの `START_EDITING` と dirtyフラグ設定。
  - 保存成功後の `SAVE_COMPLETE` と `refreshData` 呼び出し。
- `src/contexts/KintaiContext.tsx`
  - `isDateEntered`/`compareLogics` が当月 `monthlyData` に依存している点。
  - `getKintaiDataByDate` が `monthlyData` から該当日を検索する点。

## 結論
本不具合は、日付変更時の初期化条件に `isDirtyRef` を含めていたことにより「保存直後の dirty 残存」で初期化が抑止され、かつ移動先にデータがない場合に「前日の入力値がそのまま残る」ことが主因です。初期化条件を「編集中でないこと」のみに緩和し、保存成功直後に dirty を明示クリアすることで、最小差分で根本的に解消できます。

---

## 修正内容（2025-11-07 実施）

- `src/components/KintaiForm.tsx`
  - 初期化条件の緩和: 日付変更時に「編集中でない場合は必ず初期化」するよう変更。
  - 月またぎ安定化: 遷移先が別月の場合は `fetchMonthlyData(targetYear, targetMonth)` を事前取得。
  - データ取得の安定化: 直後のクロージャ不整合を避けるため `apiService.getKintaiDataByDate(deferredDate)` を使用。
  - 保存成功時の `dirty` 明示クリア: `saveKintaiToServer` 成功直後に `isDirtyRef.current = false` を設定。
  - ファイルヘッダのメタ更新（タイムスタンプ・変更概要）。

- 検証
  - TypeScript チェック: `npx tsc --noEmit` 実行、エラーなし。
  - Prettier チェック: `npx prettier --check "src/**/*.{ts,tsx,css}"` 実行、問題なし。
  - ビルド: `npm run build` 実行、成功（アセット生成）。
  - UI プレビュー: `npm run dev` で起動し `http://localhost:5173/` にて挙動確認、月またぎ含めてデータ表示が安定。

## Todo チェックリスト（完了）

- [x] KintaiForm の月またぎ存在判定を安定化
- [x] 初期化条件を `isEditing` のみへ緩和
- [x] 保存成功時に `dirty` フラグを明示クリア
- [x] TypeScript 型チェックを通過
- [x] Prettier フォーマットチェックを通過
- [x] Vite ビルドチェックを通過
- [x] 開発サーバー起動と UI プレビューでの動作確認

## 補足

- 仕様として「編集中（`isEditing=true`）の間は日付変更時に初期化・ロードを抑止」する方針を維持しています。UX 観点から、編集中は明示的に保存またはキャンセル後に日付移動する運用を推奨します。