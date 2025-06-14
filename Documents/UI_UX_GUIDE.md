# UI/UXガイド

勤怠管理アプリケーションのユーザーインターフェース・ユーザーエクスペリエンス設計ガイドライン

## 📋 目次

1. [デザインシステム概要](#デザインシステム概要)
2. [カラーパレット](#カラーパレット)
3. [タイポグラフィ](#タイポグラフィ)
4. [コンポーネントライブラリ](#コンポーネントライブラリ)
5. [レスポンシブデザイン](#レスポンシブデザイン)
6. [インタラクションデザイン](#インタラクションデザイン)
7. [アクセシビリティ](#アクセシビリティ)
8. [パフォーマンス最適化](#パフォーマンス最適化)
9. [ユーザビリティ原則](#ユーザビリティ原則)
10. [実装ガイドライン](#実装ガイドライン)
11. [品質保証](#品質保証)

## デザインシステム概要

勤怠管理アプリは**モバイルファースト**のデザインアプローチを採用し、直感的で効率的なユーザーエクスペリエンスを提供します。

### 設計原則

1. **シンプリシティ**: 必要最小限の要素で最大の効果
2. **一貫性**: 全画面で統一されたデザイン言語
3. **アクセシビリティ**: すべてのユーザーが利用可能
4. **パフォーマンス**: 高速で軽量な操作感
5. **モバイル最適化**: タッチ操作に最適化されたUI

### デザイントークン管理

CSS Custom Properties（CSS変数）を使用してデザイントークンを一元管理し、保守性とスケーラビリティを確保しています。

## カラーパレット

### プライマリカラー

```css
:root {
  /* メインブランドカラー */
  --primary-color: #3d5afe; /* メインアクション */
  --header-color: #303f9f; /* ヘッダー背景 */
  --primary-dark: #303f9f; /* ダークバリエーション */
  --primary-light: #e8eaf6; /* ライトバリエーション */

  /* セカンダリカラー */
  --button-color: #2196f3; /* 通常ボタン */
  --edit-button-color: #ff9800; /* 編集ボタン */
  --saved-button-color: #4caf50; /* 保存完了ボタン */
  --secondary-color: #546e7a; /* セカンダリ要素 */
  --accent-color: #ff4081; /* アクセント */
}
```

### 背景・サーフェスカラー

```css
:root {
  --background-color: #f5f8fa; /* アプリ背景 */
  --picker-bg: #f0f4f8; /* ピッカー背景 */
  --card-bg: #ffffff; /* カード背景 */
  --background-gray: #f5f5f5; /* グレー背景 */
  --weekend-light: #f5f5ff; /* 週末背景 */
  --sunday-light: #fff0f0; /* 日曜日背景 */
}
```

### テキストカラー

```css
:root {
  --text-primary: #263238; /* メインテキスト */
  --text-secondary: #546e7a; /* セカンダリテキスト */
  --text-color: #333; /* 基本テキスト */
  --text-secondary: #777; /* 補助テキスト */
}
```

### システムカラー

```css
:root {
  --success-color: #4caf50; /* 成功状態 */
  --error-color: #f44336; /* エラー状態 */
  --border-color: #e0e6ed; /* ボーダー */
  --border-color: #e0e0e0; /* 代替ボーダー */
}
```

### カラー使用ガイドライン

#### プライマリカラー使用例

- **#3d5afe**: メインCTA、重要なアクション
- **#303f9f**: ヘッダー、ナビゲーション
- **#2196f3**: 通常のボタン、リンク

#### セマンティックカラー

- **成功**: #4caf50 - 保存完了、入力済み状態
- **警告**: #ff9800 - 編集モード、注意喚起
- **エラー**: #f44336 - バリデーションエラー、システムエラー

## タイポグラフィ

### フォントファミリー

```css
body {
  font-family:
    "Noto Sans JP",
    /* 日本語最適化 */ -apple-system,
    /* iOS */ BlinkMacSystemFont,
    /* macOS */ "Segoe UI",
    /* Windows */ sans-serif; /* フォールバック */
}
```

### フォントサイズ階層

```css
/* ヘッダー */
h1 {
  font-size: 1.5rem;
  font-weight: 500;
} /* 24px */
h2 {
  font-size: 1.25rem;
  font-weight: 500;
} /* 20px */
h3 {
  font-size: 1.125rem;
  font-weight: 500;
} /* 18px */

/* ボディテキスト */
.text-base {
  font-size: 1rem;
} /* 16px */
.text-sm {
  font-size: 0.875rem;
} /* 14px */
.text-xs {
  font-size: 0.75rem;
} /* 12px */

/* 特殊用途 */
.text-lg {
  font-size: 1.125rem;
} /* 18px */
.text-xl {
  font-size: 1.25rem;
} /* 20px */
```

### 行間・文字間隔

```css
/* 読みやすさを重視した行間設定 */
body {
  line-height: 1.6;
}
h1,
h2,
h3 {
  line-height: 1.4;
}
.text-tight {
  line-height: 1.25;
}

/* 文字間隔 */
.tracking-wide {
  letter-spacing: 0.025em;
}
.tracking-wider {
  letter-spacing: 0.05em;
}
```

## コンポーネントライブラリ

### ボタンコンポーネント

#### プライマリボタン

```css
.btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 1rem;
  font-weight: 500;
  min-height: 44px; /* タッチターゲット最小サイズ */
  min-width: 44px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn:active {
  transform: translateY(0);
}
```

#### セカンダリボタン

```css
.btn-secondary {
  background: transparent;
  color: var(--primary-color);
  border: 2px solid var(--primary-color);
  border-radius: 8px;
  padding: 10px 22px; /* ボーダー分を調整 */
}
```

#### 状態別ボタン

```css
/* 編集モード */
.btn-edit {
  background-color: var(--edit-button-color);
  color: white;
}

/* 保存完了 */
.btn-saved {
  background-color: var(--saved-button-color);
  color: white;
}

/* 無効状態 */
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
```

### フォームコンポーネント

#### 入力フィールド

```css
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.input-wrapper {
  position: relative;
  background: var(--card-bg);
  border-radius: 8px;
  border: 2px solid var(--border-color);
  transition: border-color 0.2s ease;
}

.input-wrapper:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(61, 90, 254, 0.1);
}

input {
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  font-size: 1rem;
  color: var(--text-primary);
}
```

### カードコンポーネント

```css
.card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color);
}

.card-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}
```

### モバイル専用コンポーネント

#### ドラム式ピッカー

```css
.drum-picker {
  background: var(--picker-bg);
  border-radius: 12px;
  padding: 16px;
  touch-action: pan-y; /* 縦スクロールのみ許可 */
}

.drum-column {
  height: 200px;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  -webkit-overflow-scrolling: touch;
}

.drum-item {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  scroll-snap-align: center;
  font-size: 1.125rem;
}

.drum-item.selected {
  background: var(--primary-color);
  color: white;
  border-radius: 8px;
}
```

## レスポンシブデザイン

### ブレークポイント

```css
/* モバイルファースト設計 */
:root {
  --mobile: 320px; /* 最小モバイル */
  --mobile-large: 480px; /* 大型モバイル */
  --tablet: 768px; /* タブレット */
  --desktop: 1024px; /* デスクトップ */
  --desktop-large: 1440px; /* 大型デスクトップ */
}

/* メディアクエリ */
@media (min-width: 480px) {
  /* 大型モバイル対応 */
}

@media (min-width: 768px) {
  /* タブレット対応 */
  .container {
    max-width: 600px;
    margin: 0 auto;
  }
}

@media (min-width: 1024px) {
  /* デスクトップ対応 */
  .container {
    max-width: 800px;
  }
}
```

### レスポンシブ戦略

#### 1. **モバイルファースト**

- 基本スタイルはモバイル向け
- 大画面向けに段階的に拡張
- タッチ操作を前提とした設計

#### 2. **フルード・グリッド**

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
```

#### 3. **フレキシブル・イメージ**

```css
img {
  max-width: 100%;
  height: auto;
}
```

### タッチターゲット最適化

```css
/* WCAG準拠の最小タッチターゲット */
.touch-target {
  min-height: 44px;
  min-width: 44px;
  padding: 12px;
}

/* タッチ操作の改善 */
.touchable {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
```

## インタラクションデザイン

### アニメーション

#### 1. **マイクロインタラクション**

```css
/* ボタンホバー効果 */
.btn {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* フォーカス効果 */
.input-wrapper:focus-within {
  transform: scale(1.02);
  transition: transform 0.2s ease;
}
```

#### 2. **ページ遷移アニメーション**

```css
/* スライドアニメーション */
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.page-enter {
  animation: slideInRight 0.3s ease-out;
}
```

#### 3. **長押しフィードバック**

```css
.long-pressing {
  transform: scale(0.98);
  transition: transform 0.1s ease;
}

.long-press-progress {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  animation: shimmer 1s infinite;
}
```

### ジェスチャー対応

#### スワイプナビゲーション

```css
.swipeable {
  touch-action: pan-x;
  overflow-x: hidden;
}

/* スワイプインジケーター */
.swipe-indicator {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.swiping .swipe-indicator {
  opacity: 1;
}
```

#### 長押し操作

```css
.long-pressable {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.long-pressable:active {
  background-color: rgba(0, 0, 0, 0.05);
}
```

## アクセシビリティ

### WCAG 2.1 AA準拠

#### 1. **カラーコントラスト**

```css
/* 最小コントラスト比 4.5:1 を確保 */
:root {
  --text-primary: #263238; /* 背景#ffffffとのコントラスト比: 12.6:1 */
  --text-secondary: #546e7a; /* 背景#ffffffとのコントラスト比: 5.4:1 */
}

/* 大きなテキスト（18pt以上）は3:1以上 */
.large-text {
  color: var(--text-secondary);
  font-size: 1.125rem;
}
```

#### 2. **フォーカス管理**

```css
/* 明確なフォーカスインジケーター */
:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* カスタムフォーカススタイル */
.custom-focus:focus {
  box-shadow: 0 0 0 3px rgba(61, 90, 254, 0.3);
  outline: none;
}
```

#### 3. **ARIA属性**

```html
<!-- ボタンの状態表示 */
<button aria-pressed="true" aria-label="編集モード">
  編集
</button>

<!-- フォームのラベル関連付け -->
<label for="start-time">出勤時間</label>
<input id="start-time" aria-describedby="start-time-help" />
<div id="start-time-help">HH:MM形式で入力してください</div>

<!-- ライブリージョン -->
<div aria-live="polite" aria-atomic="true">保存が完了しました</div>
```

#### 4. **キーボードナビゲーション**

```css
/* タブ順序の最適化 */
.tab-container {
  display: flex;
}

.tab-item {
  order: 1;
}

.tab-item:focus {
  z-index: 1;
}

/* スキップリンク */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: var(--primary-color);
  color: white;
  padding: 8px;
  text-decoration: none;
  z-index: 1000;
}

.skip-link:focus {
  top: 6px;
}
```

### スクリーンリーダー対応

```css
/* スクリーンリーダー専用テキスト */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* フォーカス時に表示 */
.sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

## パフォーマンス最適化

### CSS最適化

#### 1. **Critical CSS**

```css
/* Above-the-fold content styles */
.critical {
  /* 初期表示に必要な最小限のスタイル */
}
```

#### 2. **CSS Grid vs Flexbox**

```css
/* 2次元レイアウト: CSS Grid */
.grid-layout {
  display: grid;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
}

/* 1次元レイアウト: Flexbox */
.flex-layout {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

#### 3. **アニメーション最適化**

```css
/* GPU加速の活用 */
.optimized-animation {
  transform: translateZ(0); /* レイヤー作成を強制 */
  will-change: transform; /* 最適化のヒント */
}

/* 60fps維持 */
@keyframes smooth-slide {
  from {
    transform: translate3d(-100%, 0, 0);
  }
  to {
    transform: translate3d(0, 0, 0);
  }
}
```

### レンダリング最適化

```css
/* レイアウトシフト防止 */
.aspect-ratio-box {
  aspect-ratio: 16 / 9;
}

/* コンテンツの可視性制御 */
.lazy-content {
  content-visibility: auto;
  contain-intrinsic-size: 200px;
}

/* スクロール最適化 */
.scroll-container {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}
```

## 今後の改善予定

### デザインシステム拡張

1. **デザイントークン管理**

   - Style Dictionary導入
   - 複数プラットフォーム対応

2. **コンポーネントライブラリ**

   - Storybook導入
   - ビジュアルリグレッションテスト

3. **アクセシビリティ強化**
   - 自動テスト導入（axe-core）
   - ユーザビリティテスト実施

### パフォーマンス改善

1. **CSS最適化**

   - PurgeCSS導入
   - Critical CSS自動生成

2. **アニメーション改善**
   - Web Animations API活用
   - Intersection Observer活用

## ユーザビリティ原則

### 勤怠管理アプリ特有のUX要件

#### 1. **効率性重視**

```typescript
// 最小タップ数での入力完了
interface QuickInputFlow {
  maxTaps: 3; // 最大3タップで入力完了
  autoSave: boolean; // 自動保存機能
  smartDefaults: boolean; // 前回値の自動設定
}
```

#### 2. **エラー防止**

```typescript
// バリデーション戦略
interface ValidationStrategy {
  realTimeValidation: boolean; // リアルタイム検証
  preventiveUI: boolean; // 無効操作の事前防止
  confirmationDialogs: boolean; // 重要操作の確認
}
```

#### 3. **状況認識**

```typescript
// 現在状態の明確な表示
interface StatusIndicators {
  currentDate: string; // 現在編集中の日付
  saveStatus: "saved" | "pending" | "error";
  syncStatus: "synced" | "syncing" | "offline";
  editableStatus: boolean; // 編集可能期間内かどうか
}
```

### ユーザージャーニー最適化

#### 日次入力フロー

1. **アプリ起動** → 当日データ自動表示
2. **時刻入力** → ドラムピッカーで直感的入力
3. **自動保存** → 入力と同時に保存
4. **状態確認** → 視覚的フィードバック

#### 月次確認フロー

1. **月次画面** → カレンダービューで一覧
2. **日付選択** → タップで詳細表示
3. **編集操作** → 必要に応じて修正
4. **同期確認** → Google Sheets連携状況

## 実装ガイドライン

### CSS設計原則

#### 1. **BEM命名規則**

```css
/* Block */
.kintai-form {
}

/* Element */
.kintai-form__input {
}
.kintai-form__button {
}

/* Modifier */
.kintai-form__button--primary {
}
.kintai-form__button--disabled {
}
```

#### 2. **CSS Custom Properties活用**

```css
:root {
  /* スペーシングシステム */
  --space-xs: 0.25rem; /* 4px */
  --space-sm: 0.5rem; /* 8px */
  --space-md: 1rem; /* 16px */
  --space-lg: 1.5rem; /* 24px */
  --space-xl: 2rem; /* 32px */

  /* ブレークポイント */
  --bp-mobile: 320px;
  --bp-tablet: 768px;
  --bp-desktop: 1024px;

  /* アニメーション */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  --easing-ease: cubic-bezier(0.4, 0, 0.2, 1);
  --easing-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --easing-ease-out: cubic-bezier(0, 0, 0.2, 1);
}
```

#### 3. **レスポンシブミックスイン**

```css
/* モバイルファースト */
.responsive-container {
  padding: var(--space-md);
}

@media (min-width: 768px) {
  .responsive-container {
    padding: var(--space-lg);
    max-width: 1200px;
    margin: 0 auto;
  }
}
```

### React コンポーネント設計

#### 1. **コンポーネント構造**

```typescript
// 基本コンポーネント構造
interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
  "data-testid"?: string;
}

// 複合コンポーネントパターン
const KintaiForm = {
  Root: KintaiFormRoot,
  Header: KintaiFormHeader,
  Body: KintaiFormBody,
  Footer: KintaiFormFooter,
};
```

#### 2. **状態管理パターン**

```typescript
// カスタムフック活用
const useKintaiForm = () => {
  const [state, dispatch] = useReducer(kintaiFormReducer, initialState);

  const actions = useMemo(
    () => ({
      updateTime: (field: string, value: string) =>
        dispatch({ type: "UPDATE_TIME", field, value }),
      save: () => dispatch({ type: "SAVE" }),
      reset: () => dispatch({ type: "RESET" }),
    }),
    []
  );

  return { state, actions };
};
```

### アクセシビリティ実装

#### 1. **ARIA属性**

```typescript
// フォーム要素のアクセシビリティ
const TimeInput = ({ label, value, onChange, error }) => (
  <div className="time-input">
    <label htmlFor={id} className="time-input__label">
      {label}
    </label>
    <input
      id={id}
      type="time"
      value={value}
      onChange={onChange}
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={!!error}
      className="time-input__field"
    />
    {error && (
      <div id={`${id}-error`} role="alert" className="time-input__error">
        {error}
      </div>
    )}
  </div>
);
```

#### 2. **キーボードナビゲーション**

```typescript
// キーボード操作サポート
const useKeyboardNavigation = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Tab":
          // フォーカス管理
          break;
        case "Enter":
          // 送信処理
          break;
        case "Escape":
          // キャンセル処理
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
};
```

## 品質保証

### テスト戦略

#### 1. **ビジュアルリグレッションテスト**

```typescript
// Storybook + Chromatic
export default {
  title: "Components/KintaiForm",
  component: KintaiForm,
  parameters: {
    chromatic: {
      viewports: [320, 768, 1024],
      delay: 300,
    },
  },
};
```

#### 2. **アクセシビリティテスト**

```typescript
// Jest + @testing-library/jest-dom
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('should not have accessibility violations', async () => {
  const { container } = render(<KintaiForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

#### 3. **パフォーマンステスト**

```typescript
// Web Vitals監視
import { getCLS, getFID, getFCP, getLCP, getTTFB } from "web-vitals";

const reportWebVitals = (metric) => {
  console.log(metric);
  // Analytics送信
};

getCLS(reportWebVitals);
getFID(reportWebVitals);
getFCP(reportWebVitals);
getLCP(reportWebVitals);
getTTFB(reportWebVitals);
```

### デザインレビュープロセス

#### 1. **デザインチェックリスト**

- [ ] カラーコントラスト比 4.5:1 以上
- [ ] タッチターゲット 44px × 44px 以上
- [ ] フォントサイズ 16px 以上（モバイル）
- [ ] 読み込み状態の表示
- [ ] エラー状態の適切な表示
- [ ] 成功状態のフィードバック

#### 2. **ユーザビリティチェック**

- [ ] 3タップ以内での主要操作完了
- [ ] 明確な現在状態表示
- [ ] 直感的なナビゲーション
- [ ] 適切なエラーメッセージ
- [ ] オフライン対応

### 継続的改善

#### 1. **ユーザーフィードバック収集**

```typescript
// フィードバック収集システム
interface UserFeedback {
  userId: string;
  feature: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  timestamp: Date;
}

const collectFeedback = async (feedback: UserFeedback) => {
  // Analytics送信
  await analytics.track("user_feedback", feedback);
};
```

#### 2. **A/Bテスト実装**

```typescript
// 機能フラグによるA/Bテスト
const useFeatureFlag = (flagName: string) => {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    // フィーチャーフラグサービスから取得
    const checkFlag = async () => {
      const flag = await featureFlags.get(flagName);
      setIsEnabled(flag.enabled);
    };

    checkFlag();
  }, [flagName]);

  return isEnabled;
};
```

---

**最終更新**: 2025-01-15
**バージョン**: 2.0.0
**作成者**: 勤怠管理アプリ開発チーム

## 関連ドキュメント

- [システム概要](./SYSTEM_OVERVIEW.md)
- [アーキテクチャ設計](./ARCHITECTURE.md)
- [API仕様](./API_SPECIFICATION.md)
- [セキュリティガイド](./SECURITY.md)
