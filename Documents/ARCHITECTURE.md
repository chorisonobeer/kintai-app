# 勤怠管理アプリ - アーキテクチャドキュメント

## 📋 目次

1. [概要](#概要)
2. [ディレクトリ構造](#ディレクトリ構造)
3. [アーキテクチャ設計](#アーキテクチャ設計)
4. [コンポーネント設計](#コンポーネント設計)
5. [データフロー](#データフロー)
6. [状態管理](#状態管理)
7. [ルーティング設計](#ルーティング設計)
8. [パフォーマンス最適化](#パフォーマンス最適化)

## 概要

勤怠管理アプリは、React + TypeScript + Viteを基盤とした**SPA（Single Page Application）**として設計されています。モバイルファーストのレスポンシブデザインを採用し、Google Apps Scriptとの連携によりデータの永続化を実現しています。

### 主要な設計原則

- **コンポーネント指向設計**: 再利用可能なUIコンポーネント
- **関心の分離**: ビジネスロジック、UI、データ管理の明確な分離
- **型安全性**: TypeScriptによる厳密な型定義
- **パフォーマンス重視**: React 18の並行機能を活用
- **オフライン対応**: Service Workerによるバックグラウンド同期

## ディレクトリ構造

```
src/
├── components/           # UIコンポーネント
│   ├── Header.tsx        # 共通ヘッダー（ナビゲーション、ユーザー情報）
│   ├── Login.tsx         # 認証フォーム
│   ├── KintaiForm.tsx    # 勤怠入力フォーム（メイン機能）
│   ├── MonthlyView.tsx   # 月間勤怠一覧表示
│   ├── DeployInfoModal.tsx # デプロイ情報モーダル（デバッグ用）
│   ├── MobileDatePicker.tsx    # モバイル対応日付選択
│   ├── MobileTimePicker.tsx    # モバイル対応時間選択
│   ├── MobileBreakPicker.tsx   # モバイル対応休憩時間選択
│   ├── drumtimepicker.tsx      # カスタム時間ピッカー
│   └── drumtimepicker.css      # 時間ピッカー専用スタイル
├── contexts/             # React Context（状態管理）
│   └── KintaiContext.tsx # 勤怠データのグローバル状態管理
├── utils/                # ユーティリティ関数
│   ├── apiService.ts     # GAS API連携、認証管理
│   ├── backgroundSync.ts # バックグラウンド同期処理
│   ├── dateUtils.ts      # 日付操作、編集可能期間判定
│   ├── timeUtils.ts      # 時間計算、フォーマット変換
│   ├── entryStatusManager.ts # 入力済み判定ロジック
│   ├── entryStatusUtils.ts   # 入力状態ユーティリティ
│   └── storageUtils.ts   # ローカルストレージ操作
├── types/                # TypeScript型定義
│   ├── index.ts          # 基本型定義（KintaiData、FormState等）
│   ├── entryStatus.ts    # 入力状態関連型
│   └── unified.ts        # 統合型定義
├── styles/               # スタイルシート
│   ├── styles.css        # メインスタイル
│   ├── styles_monthly.css # 月間表示専用スタイル
│   ├── styles_addition.css # 追加スタイル
│   ├── styles_addition_final.css # 最終調整スタイル
│   └── long-press.css    # 長押し操作スタイル
├── test/                 # テストファイル
│   └── entryStatusTest.ts # 入力状態テスト
├── App.tsx               # アプリケーションルート
├── main.tsx              # エントリーポイント
└── types.ts              # レガシー型定義（移行中）
```

### ディレクトリ設計の特徴

1. **機能別分離**: コンポーネント、ユーティリティ、型定義を明確に分離
2. **スケーラビリティ**: 新機能追加時の拡張性を考慮
3. **保守性**: 関連ファイルの配置により保守作業を効率化
4. **テスト容易性**: ビジネスロジックとUIの分離によりテストを簡素化

## アーキテクチャ設計

### レイヤー構成

```
┌─────────────────────────────────────┐
│           Presentation Layer        │
│  (React Components + CSS)           │
├─────────────────────────────────────┤
│           Business Logic Layer      │
│  (Utils + Context + Hooks)          │
├─────────────────────────────────────┤
│           Data Access Layer         │
│  (API Service + Storage Utils)      │
├─────────────────────────────────────┤
│           External Services         │
│  (Google Apps Script + Browser API) │
└─────────────────────────────────────┘
```

### 主要な設計パターン

#### 1. **Container/Presentational Pattern**

- **Container Components**: データ取得・状態管理（KintaiForm, MonthlyView）
- **Presentational Components**: UI表示のみ（MobilePickers, Header）

#### 2. **Provider Pattern**

- `KintaiContext`: 勤怠データのグローバル状態管理
- 認証状態、月間データ、ローディング状態を一元管理

#### 3. **Service Layer Pattern**

- `apiService.ts`: 外部API連携の抽象化
- `backgroundSync.ts`: バックグラウンド処理の管理

## コンポーネント設計

### 主要コンポーネントの責務

#### 1. **App.tsx** - アプリケーションルート

```typescript
責務:
- ルーティング設定
- 認証保護ルートの管理
- Service Worker初期化
- バックグラウンド同期の制御

依存関係:
- React Router (ルーティング)
- KintaiProvider (状態管理)
- backgroundSyncManager (同期処理)
```

#### 2. **Header.tsx** - 共通ヘッダー

```typescript
責務:
- ナビゲーション機能
- ユーザー情報表示
- ログアウト処理
- デバッグ情報表示（長押し操作）

Props:
- onLogout: () => void

特徴:
- 長押しでバージョン情報表示
- レスポンシブデザイン対応
```

#### 3. **KintaiForm.tsx** - 勤怠入力フォーム（メインコンポーネント）

```typescript
責務:
- 勤怠データの入力・編集
- リアルタイム勤務時間計算
- バリデーション処理
- データ保存・同期

状態管理:
- useReducer: 複雑な編集状態管理
- useTransition: 非同期処理の最適化
- useDeferredValue: パフォーマンス最適化

主要機能:
- 日付選択（編集可能期間制限）
- 時間入力（出勤・退勤・休憩）
- 勤務場所選択
- 自動保存機能
```

#### 4. **MonthlyView.tsx** - 月間勤怠表示

```typescript
責務: -月間勤怠データの一覧表示 -
  月間ナビゲーション -
  入力済み状態の可視化 -
  データ更新・同期;

表示機能: -カレンダー形式表示 -
  曜日別スタイリング -
  入力状態インジケーター -
  勤務時間集計;
```

#### 5. **Login.tsx** - 認証フォーム

```typescript
責務:
- ユーザー認証処理
- 認証エラーハンドリング
- ローディング状態管理

Props:
- onLoginSuccess: () => void

セキュリティ:
- パスワード暗号化
- 認証トークン管理
```

### モバイル対応コンポーネント

#### **MobileDatePicker.tsx**

- ネイティブ日付選択UI
- 編集可能期間の制限
- タッチ操作最適化

#### **MobileTimePicker.tsx**

- カスタム時間選択UI
- ドラム式ピッカー
- 時間フォーマット自動変換

#### **MobileBreakPicker.tsx**

- 休憩時間専用選択UI
- プリセット時間選択
- カスタム時間入力

## データフロー

### 1. **認証フロー**

```
Login Component
    ↓ (credentials)
apiService.login()
    ↓ (API call)
Google Apps Script
    ↓ (auth token)
LocalStorage
    ↓ (redirect)
Protected Routes
```

### 2. **勤怠データ入力フロー**

```
KintaiForm
    ↓ (form data)
Validation
    ↓ (validated data)
apiService.saveKintaiToServer()
    ↓ (API call)
Google Apps Script
    ↓ (success)
KintaiContext.refreshData()
    ↓ (updated data)
MonthlyView Update
```

### 3. **データ同期フロー**

```
User Input
    ↓
LocalStorage (immediate)
    ↓
Background Sync Queue
    ↓ (when online)
Google Apps Script
    ↓ (success)
Cache Update
    ↓
UI Refresh
```

### 4. **月間データ取得フロー**

```
MonthlyView Mount
    ↓
KintaiContext.getMonthlyData()
    ↓
SessionStorage Check
    ↓ (cache miss)
apiService.getMonthlyData()
    ↓ (API call)
Google Apps Script
    ↓ (data)
SessionStorage Cache
    ↓
Component Update
```

## 状態管理

### KintaiContext の設計

```typescript
interface KintaiContextType {
  // データ状態
  monthlyData: KintaiData[];
  isDataLoading: boolean;

  // 現在の年月
  currentYear: number;
  currentMonth: number;

  // アクション
  setCurrentYear: (year: number) => void;
  setCurrentMonth: (month: number) => void;
  refreshData: () => Promise<void>;

  // 入力済み判定
  isEntryComplete: (date: string) => boolean;
  getEntryStatus: (date: string) => EntryStatus;
}
```

### 状態管理の特徴

1. **一元管理**: 勤怠データの単一情報源
2. **キャッシュ戦略**: SessionStorageによる効率的なデータ管理
3. **リアクティブ更新**: データ変更時の自動UI更新
4. **エラーハンドリング**: 通信エラー時の適切な状態管理

## ルーティング設計

### ルート構成

```typescript
Routes:
  /login          - 認証ページ（非保護）
  /               - 勤怠入力フォーム（保護）
  /monthly        - 月間勤怠表示（保護）

保護ルート:
  - ProtectedRoute HOCによる認証チェック
  - 未認証時は自動的に/loginにリダイレクト
  - 認証情報の整合性チェック
```

### ナビゲーション設計

- **Header Component**: 全ページ共通ナビゲーション
- **React Router**: SPA内ルーティング
- **認証保護**: 認証状態に基づくアクセス制御

## パフォーマンス最適化

### React 18 並行機能の活用

#### 1. **useTransition**

```typescript
// KintaiForm.tsx
const [isPending, startTransition] = useTransition();

// 重い処理を並行実行
startTransition(() => {
  // データ保存処理
});
```

#### 2. **useDeferredValue**

```typescript
// 入力値の遅延更新でパフォーマンス向上
const deferredValue = useDeferredValue(inputValue);
```

### キャッシュ戦略

#### 1. **SessionStorage**

- 月間データの一時キャッシュ
- ページリロード時の高速表示
- キャッシュ期限管理

#### 2. **LocalStorage**

- 認証情報の永続化
- ユーザー設定の保存
- オフライン対応データ

### バックグラウンド同期

#### Service Worker活用

```typescript
// backgroundSync.ts
class BackgroundSyncManager {
  // オフライン時のデータキューイング
  // オンライン復帰時の自動同期
  // 同期失敗時のリトライ機能
}
```

### バンドル最適化

- **Vite**: 高速ビルドとHMR
- **Tree Shaking**: 未使用コードの除去
- **Code Splitting**: 動的インポートによる分割読み込み
- **CSS最適化**: 重複スタイルの除去

## 今後の拡張予定

### アーキテクチャ改善

1. **マイクロフロントエンド化**

   - 機能別モジュール分割
   - 独立デプロイ可能な構成

2. **状態管理ライブラリ導入**

   - Redux Toolkit または Zustand
   - より複雑な状態管理への対応

3. **テスト環境整備**
   - Jest + React Testing Library
   - E2Eテスト（Playwright）
   - ビジュアルリグレッションテスト

### 新機能アーキテクチャ

1. **リアルタイム通知**

   - WebSocket または Server-Sent Events
   - プッシュ通知API

2. **オフライン機能強化**

   - IndexedDB活用
   - 完全オフライン動作

3. **PWA機能**
   - アプリインストール
   - バックグラウンド同期
   - オフライン表示

---

**最終更新**: 2025年1月
**バージョン**: 1.0.0
**作成者**: 勤怠管理アプリ開発チーム
