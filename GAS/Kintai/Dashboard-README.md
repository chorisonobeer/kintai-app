# Dashboard.gs - ダッシュボード作成機能

## 概要

`Dashboard.gs`は、勤怠管理システムにおけるダッシュボード作成機能を提供するGoogle Apps Script（GAS）ファイルです。現在はダミー実装となっており、将来的にライブラリから呼び出される本格的なダッシュボード機能の基盤として設計されています。

## ファイル情報

- **ファイル名**: `Dashboard.gs`
- **作成日**: 2025-06-08
- **目的**: 自動ダッシュボード生成機能の実装準備
- **状態**: ダミー実装（将来の拡張用基盤）

## 主要機能

### 1. メイン関数

#### `createDashboard()`

- **用途**: UIダイアログ付きのダッシュボード作成
- **特徴**:
  - ユーザー確認ダイアログ表示
  - エラーハンドリング完備
  - 処理結果の表示
- **現在の動作**: ダミーデータ処理とメッセージ表示

#### `createDashboardFromLibrary(options)`

- **用途**: 外部ライブラリから呼び出される予定の関数
- **パラメータ**:
  - `autoGenerate`: 自動生成フラグ（デフォルト: true）
  - `includeCharts`: グラフ含有フラグ（デフォルト: true）
  - `dateRange`: 日付範囲（デフォルト: 'current_month'）
  - `outputFormat`: 出力形式（デフォルト: 'sheet'）
- **戻り値**: ダッシュボード作成結果オブジェクト

### 2. サポート関数

#### `generateDashboardData()`

- **用途**: ダッシュボードデータの生成（ダミー処理）
- **現在の処理**: メンバーリストの件数取得
- **将来の拡張予定**:
  - 勤怠データの集計
  - グラフの生成
  - レポートの作成
  - 統計情報の計算

#### `getDashboardConfig()`

- **用途**: ダッシュボード設定情報の取得
- **戻り値**: バージョン、対応フォーマット、設定情報など

#### `checkDashboardStatus()`

- **用途**: ダッシュボード機能のステータス確認
- **戻り値**: 準備状況、スプレッドシート情報、設定情報

### 3. 互換性関数

#### `generateDashboard()`

- **用途**: 旧関数名のエイリアス
- **動作**: `createDashboard()`を呼び出し、非推奨警告をログ出力

## 技術仕様

### エラーハンドリング

- 全ての関数でtry-catch文による適切なエラー処理
- エラー発生時の詳細メッセージ表示
- 処理失敗時の安全な復帰

### 戻り値形式

```javascript
{
  success: boolean,           // 処理成功フラグ
  dashboardId: string,        // ダッシュボードID
  dataProcessed: number,      // 処理データ件数
  createdAt: string,          // 作成日時
  config: object,             // 設定情報
  message: string             // 処理結果メッセージ
}
```

### 設定オプション

```javascript
{
  autoGenerate: boolean,      // 自動生成フラグ
  includeCharts: boolean,     // グラフ含有フラグ
  dateRange: string,          // 日付範囲
  outputFormat: string        // 出力形式
}
```

## 使用方法

### 基本的な使用

```javascript
// 手動でダッシュボード作成
createDashboard();

// ライブラリ経由での作成
var options = {
  autoGenerate: true,
  includeCharts: true,
  dateRange: "current_month",
  outputFormat: "sheet",
};
var result = createDashboardFromLibrary(options);
```

### ステータス確認

```javascript
// 機能の準備状況確認
var status = checkDashboardStatus();
console.log(status.ready); // true/false

// 設定情報取得
var config = getDashboardConfig();
console.log(config.version); // バージョン情報
```

## 将来の拡張計画

### 実装予定機能

1. **データ集計機能**

   - 勤怠データの自動集計
   - 月次・年次レポート生成
   - 統計情報の計算

2. **グラフ生成機能**

   - 出勤率グラフ
   - 労働時間推移
   - 部門別統計

3. **レポート出力機能**

   - PDF形式での出力
   - HTML形式での出力
   - メール自動送信

4. **ライブラリ連携**
   - 外部ダッシュボードライブラリとの連携
   - カスタムテンプレート対応
   - 動的レイアウト生成

### 技術的改善予定

- パフォーマンス最適化
- キャッシュ機能の実装
- バッチ処理対応
- 並列処理の導入

## 依存関係

### 必要なシート

- `メンバーリスト`: メンバー情報の取得に使用
- その他の勤怠データシート（将来実装時）

### 必要な権限

- スプレッドシートの読み取り権限
- UIダイアログ表示権限
- ログ出力権限

## 注意事項

1. **現在の制限**

   - ダミー実装のため、実際のダッシュボード生成は行われません
   - データ処理は基本的な件数取得のみ

2. **将来の移行**

   - 本格実装時は既存の関数インターフェースを維持
   - 設定オプションの拡張予定
   - 戻り値形式の詳細化

3. **互換性**
   - 旧関数名（`generateDashboard`）は非推奨
   - 新規開発では`createDashboard`または`createDashboardFromLibrary`を使用

## 更新履歴

| 日付       | バージョン  | 変更内容             |
| ---------- | ----------- | -------------------- |
| 2025-06-08 | 1.0.0-dummy | 初回作成・ダミー実装 |

## 関連ファイル

- `Code.gs`: メイン処理
- `Utils.gs`: ユーティリティ関数
- `kintai.gs`: 勤怠管理機能
- `passwordreset.gs`: メンバー管理機能

---

_このドキュメントは将来の開発者のために作成されました。実装時はこの仕様を参考に、実際の要件に合わせて調整してください。_
