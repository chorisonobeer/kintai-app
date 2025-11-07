# Google Sheets / Google Drive 読込・書込の高速化調査レポート（2025-11-07）

## 概要（Executive Summary）
- Google Apps Script（GAS）経由の Spreadsheet 操作は「サービス呼び出しの回数」を最小化することが最重要。読み込み・書き込みは可能な限りバッチ化し、配列で処理して一括反映する。
- 現行ロジックは一部でバッチ化ができており妥当。ただし「月次取得時の全範囲読み込み」「連続 `setValue`」など改善余地が残る。
- 推奨改善は以下の3本柱：
  1) 読込範囲の最適化（必要部分のみの範囲取得）
  2) 書込のさらなるバッチ化（連続 `setValue` の削減）
  3) キャッシュ活用（GAS側 `CacheService` とフロント側キャッシュの協調）

---

## 外部調査（要点）

- Apps Scriptベストプラクティス（Google公式）
  - 「外部サービス呼び出しを最小化」・「読み書きのバッチ化」による高速化が推奨。
  - 読み取り→計算→書き込みは「配列にまとめて1回書き戻し」にすることで、70秒→1秒程度まで高速化した事例あり。[1]

- Spreadsheet最適化（Google公式ブログ）
  - `getValues/setValues` のバッチ操作でサービス呼び出し回数を減らす。
  - 読み取りと書き込みの交互実行はキャッシュを無効化するため遅くなる。可能な限りまとめて処理。[2]

- コミュニティ知見（Google Docs Editors Community）
  - ループでの `getValue/setValue` は避け、`range.setValue(false)` や `getValues/setValues` の活用を推奨（1回の読み/書きに集約）。[3]

- 実践テクニックまとめ（Medium 記事）
  - リクエストのバッチ処理、必要データのみの取得、キャッシュ利用が有効。
  - ログ分析でボトルネック特定も推奨。[4]

- Code Review（StackExchange）
  - 読み取りと書き込みの交互は遅い。可能なら「1回読み取り→処理→1回書き込み」に集約。
  - 同様の処理のDRY化、`const/let`の適切な使用も有効。[5]

引用:
- [1] Apps Script Best Practices — Google Developers: https://developers.google.com/apps-script/guides/support/best-practices
- [2] Optimizing Spreadsheet Operations — Google Apps Script Blog: http://googleappsscript.blogspot.com/2010/06/optimizing-spreadsheet-operations.html
- [3] Google Docs Editors Community: https://support.google.com/docs/thread/42793831
- [4] Medium: Mastering Google Apps Script: https://geekjob.medium.com/mastering-google-apps-script-718702d893ba
- [5] Code Review StackExchange: https://codereview.stackexchange.com/questions/278525/slow-performance-of-google-apps-script-that-updates-data

---

## 現行ロジックの確認（抜粋）

- フロント→GAS 呼び出し
  - `src/utils/apiService.ts` の `callGAS` で POST（リトライ・タイムアウトあり、重複防止あり）。
  - フロント側は `getMonthlyData` キャッシュを持ち、二重取得を抑制（`getMonthlyDataFromCache`）。

- GAS 読込（kintai.gs）
  - 月次取得において `sheet.getDataRange().getValues()` で全行を読み込み、ループで月判定（行数が多い場合に非効率）。
  - 日付行検索は A列 `TextFinder` + フォールバックで A列のみに限定して読み取り（効率的）。

- GAS 書込（kintai.gs, passwordreset.gs 等）
  - 勤怠保存では C〜E を `setValues`（1回）にまとめているが、G列は `setValue`（分離）。
  - メンバー登録（`passwordreset.gs`）では C〜N への多数 `setValue` 連続呼び出しあり（同一行・連続列であり `setValues` による一括書き込みに置換可能）。

---

## ボトルネックと改善案

### 1) 読込範囲の最適化（大きな効果）
- 現状: 月次データ取得が `getDataRange()` で全体読み込み。
- 課題: 行数が増えるほど不要データまで取得するため遅い。
- 改善案:
  - 月の開始行/終了行を特定して「対象月の範囲のみ」を取得。
  - 具体例: `searchRowByDate` を拡張して、`YYYY/MM/01` と `YYYY/MM/末日` の行を特定 → `sheet.getRange(startRow, 1, rowCount, lastColumn).getValues()`
  - 月判定が列BやAで容易なら、先に A/B 列のみを読み込み・行インデックス抽出→その部分範囲だけ再読み込み。

### 2) 書込のさらなるバッチ化（中～大効果）
- 現状: 同一行・複数列への `setValue` を連続実行している箇所あり。
- 改善案:
  - 連続列は `setValues([[...]])` へ置換。
  - 例: `passwordreset.gs` の C〜N 列は `memberSheet.getRange(newRow, 3, 1, 12).setValues([[c, d, e, f, g, h, i, j, k, l, m, n]])]` に統合（1回呼び出し）。
  - 非連続列の場合は、可能ならデータ設計側を連続に再編。非連続のままなら、G列のみ `setValue` 1回維持で十分（コストは小さい）。

### 3) キャッシュ活用（中効果）
- 現状: フロント側キャッシュはあり（`getMonthlyDataFromCache`）。GAS側は未活用。
- 改善案:
  - GASの `CacheService` を用いて「ユーザーID＋年月」キーで月次データを短時間（例: 60～300秒）キャッシュ。
  - 同一リクエストが短時間に集中するケースで、読み込みをレスポンスで解消。
  - 注意: データ更新時はキャッシュ無効化（`saveKintai` 成功時に該当キーを削除）。

### 4) 付随最適化（小～中効果）
- 読み取り後の配列計算を優先し、シートAPI呼び出し回数を極小化（[1][2][5]）。
- `SpreadsheetApp.flush()` の濫用は抑制（必要時のみ）。
- ログ/計測の導入（GAS `console.log` + 「Executions」）で、最遅箇所（行選択・範囲読み込み・JSON返却等）を可視化し、ピンポイント改善（[4]）。
- クライアントのUI待機中はモーダル最小化済み（既対応）。並列実行はGASでは不可のため、**最小呼び出し・最小範囲・バッチ化**に集中。

---

## 推奨リファクタ（具体例）

### A. 月次データ取得の範囲限定（`GAS/kintai.gs`）
1. `searchRowByDate` を活用して、月初と月末のA列行を特定。
2. 行範囲が決まったら、その範囲のみ `getRange(...).getValues()`。
3. JSON変換時もその範囲に限定してループ。

期待効果: 全体読み込みを回避でき、行数に比例したレスポンス時間を短縮。

### B. メンバー登録の一括書き込み（`GAS/passwordreset.gs`）
1. C〜N 列（連続12列）を `setValues([[...12項目...]])` で一度に書き込み。
2. 付随処理（検証/ログ）を配列処理側で完結させる。

期待効果: 12回のサービス呼び出し→1回に削減。

### C. GASキャッシュ導入（`GAS/Code.gs` / `GAS/kintai.gs`）
1. `handleGetMonthlyData` 入口でキャッシュ取得→あれば即返却。
2. キャッシュミス時のみ計算・読み込み→結果をキャッシュ保存。
3. `saveKintai` 成功時に該当キーを削除（整合性維持）。

期待効果: 同一月の連続アクセスを高速化・サーバ負荷低減。

---

## 現行が最適かの評価

- 良い点:
  - `setValues` によるバッチ書き込み（C〜E）は適切。
  - `TextFinder` を使った行検索は A 列限定読み取りになっており効率的。
  - フロント側の重複リクエスト防止・キャッシュは適切。

- 改善余地:
  - 月次取得で「全範囲」の読み込みを避け、行範囲限定へ。
  - `passwordreset.gs` の連続 `setValue` 群を `setValues` 一括化。
  - GAS側の短期キャッシュで、スパイク時の応答性を改善。

総評: 基本設計は妥当で、追加の範囲最適化・キャッシュ・一括書き込みの導入により、体感速度をさらに短縮可能。

---

## 実施優先度・見積り

- 優先度高: 月次取得の範囲限定（1.0～1.5時間）
- 優先度中: メンバー登録の一括化（0.5時間）
- 優先度中: GASキャッシュ導入（0.5～1.0時間）
- 検証: ログ計測・ベンチ（0.5時間）

---

## 付記：Google Drive 側の書込高速化観点

- 本プロジェクト主軸は Google Sheets であり、Drive API の重い操作（大容量アップロードやファイルコピー）は少ない。
- もしDriveの大きなファイル操作が増える場合は、**レジューム可能アップロード**や**メタデータ更新のバッチ化**、**不要コピーの削減**を検討（Drive API ベストプラクティス）。

---

## 次アクション提案

1. 月次取得の範囲限定を試作 → ベンチ結果を `docs/perf-bench-<date>.md` に記録。
2. `passwordreset.gs` を `setValues` に置換する小リファクタ。
3. GAS側キャッシュ（TTL 60～300秒）試験導入 → `saveKintai` で無効化処理。

---

（本レポートは、外部情報の要点を引用しつつ現行リポジトリの実装状況を踏まえて最短・最小の改善策に絞って提案しています。上記の範囲限定・一括書込・キャッシュの3点が費用対効果の高い対策です。）

---

## 改善プラン（詳細）

### EPIC-1: 月次データ取得の範囲限定（高優先度）
- ゴール: `getDataRange()` をやめ、対象月の行範囲のみ読み込みに切り替える。
- 変更点:
  - 月初・月末の A列行を特定（`searchRowByDate` を拡張）。
  - `sheet.getRange(startRow, 1, numRows, lastColumn).getValues()` で限定読込。
  - JSONへの変換ループも対象範囲に限定。
- 検証: 大小2ケース（行数少/多）で応答時間を計測し、従来比で短縮。（ベンチレポート作成）
- 受け入れ基準: 大規模シートで体感待ち時間が改善し、機能同等であること。

### EPIC-2: メンバー登録の一括書き込み（中優先度）
- ゴール: `passwordreset.gs` の C〜N 連続 `setValue` を `setValues` 一括書込みに置換。
- 変更点:
  - `memberSheet.getRange(newRow, 3, 1, 12).setValues([[...12項目...]])` に統合。
  - 検証・ログは配列生成前後に集約。
- 検証: 新規登録の動作確認（値一致・バリデーション整合・書き込み時間短縮）。
- 受け入れ基準: 書込み呼び出しが1回となり、値の正確性が保たれること。

### EPIC-3: GAS短期キャッシュ導入（中優先度）
- ゴール: 月次取得レスポンスを `CacheService` で短時間キャッシュ（例: 60〜300秒）。
- 変更点:
  - キー: `monthly:{userId}:{year}-{month}`。
  - `saveKintai` 成功時に該当キー削除で整合性維持。
- 検証: 同一月への連続アクセス時のレスポンス改善を確認。
- 受け入れ基準: キャッシュヒット時に即応答、ミス時は従来通り計算。

### 付随改善（任意）
- ログ計測: `console.log` と 「Executions」で読み取り・変換・返却の時間を可視化。
- `SpreadsheetApp.flush()` の削減（必要時のみ）。

---

## Todo & 進捗管理（本ドキュメント用）

- [x] EPIC-1 実装: 月次取得の範囲限定（A列行特定→限定読込）
- [ ] EPIC-1 検証: ベンチ結果を `docs/perf-bench-YYYY-MM-DD.md` に記録
- [ ] EPIC-2 実装: メンバー登録の C〜N 一括 `setValues` 置換
- [ ] EPIC-2 検証: 入力値検証・書込み時間の短縮確認
- [ ] EPIC-3 実装: `CacheService` で月次キャッシュ導入（TTL設定）
- [ ] EPIC-3 検証: 連続アクセス時の応答性改善確認
- [ ] ログ追加: GAS内計測ログの導入（読み取り/変換/返却）
- [ ] 成果まとめ: 改善効果サマリーを本ドキュメントへ追記

### 実施メモ（EPIC-1）
- 対象: `GAS/kintai.gs` 内 `Kintai.handleGetMonthlyData`
- 変更: `getDataRange().getValues()` を、`findOrCalculateRowByDate` で算出した `startRow`〜`endRow` の限定範囲取得へ置換。
- 読込列: A〜G（`lastColumn` を最小 7 に制限）
- フォールバック: 行未検出時は空配列を返却。

---

## 不具合修正レポート：日次入力画面で保存直後に「未入力」表示となる

### 概要
- 症状: 日次入力画面で書き込み完了直後に、当日分が「未入力」と表示される。しかし月次ビューでは保存値が正しく反映され、日次画面へ戻ると正しく表示される。
- 状況再現: 保存→（同画面）直後の当日表示のみ不整合。再遷移や再ロード後は正常。

### 原因（主因/副因）
- 主因: 保存成功後に `refreshData` で月次データは再取得されるが、フォーム内部の当日値（`startTime/breakTime/endTime/location/workingTime`）のローカル状態が再同期待ちのまま空値のまま残り、`DrumTimePicker` が空値時のプレースホルダ「未入力」を描画していた。
- 副因: `getKintaiDataByDate` は `monthlyData` に依存して当日レコードを返すが、保存直後の描画タイミングではフォームのローカル状態更新が行われていなかった（キャッシュクリアは正しく動作）。

### 対策（最小差分・根本解決）
- 対応箇所: `src/components/KintaiForm.tsx`
- 変更点: 保存成功→`refreshData(forceRefresh=true)` 完了後に、当日分を `getKintaiDataByDate` で即時再取得し、フォームのローカル状態（`startTime`, `breakTime`, `endTime`, `location`, `workingTime`, `isSaved`）へ反映。これにより保存直後の描画でも実データが表示される。
- 影響範囲: フロントフォームのローカル状態更新のみ。API・キャッシュロジック・月次ビューへの影響なし。

### 検証結果
- TypeScript 型チェック: `npx tsc --noEmit`（OK）
- Prettier フォーマット: `npx prettier --write "src/**/*.{ts,tsx,css}"`（差分整形済み）
- Vite ビルド: `npm run build`（OK）
- UI 確認: 開発サーバー起動後、当日保存直後の画面で保存値が即時表示されることを確認。未入力プレースホルダは表示されない。

### 再発防止メモ
- 保存直後に画面が同一ルートに留まるフローでは、コンテキストの再取得だけでなく「フォームのローカル状態の再同期待ち」を明示的に行う設計指針を採用する。
- 代替案（未採用）: フォームを完全にコンテキスト駆動にし、ローカル状態を持たない。影響範囲が広いため今回の修正では最小差分を優先。

### 変更履歴（概要）
- 2025-11-07: KintaiForm 保存後リフレッシュ時に当日データを再読込してローカル状態へ反映する処理を追加。

---