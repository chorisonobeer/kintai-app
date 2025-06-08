# 時間形式統一移行ガイド

## 概要

勤怠アプリケーションにおける時間データの形式を統一し、すべてHH:mm形式で処理するための移行ガイドです。

## 問題の背景

### 従来の問題点

1. **休憩時間の特別扱い**
   - 出勤・退勤時間: HH:mm形式の文字列
   - 休憩時間: 数値（分単位）または文字列の混在
   - 判定ロジックの不整合の原因

2. **型安全性の欠如**
   - `breakTime: string | number | null | undefined`
   - 型チェックが複雑化
   - ランタイムエラーの可能性

3. **処理の複雑化**
   - 形式変換処理が各所に散在
   - 一貫性のない判定ロジック
   - メンテナンス性の低下

## 統一後の設計

### 基本原則

```typescript
// すべての時間データはHH:mm形式で統一
export type TimeString = string; // "09:30", "13:45", "00:00"
export type BreakTime = TimeString; // "01:00", "00:30", "00:00"

// "00:00"は「入力なし」を表す
// null/undefinedは使用しない
```

### 統一データ構造

```typescript
export interface UnifiedKintaiData {
  date: DateString;        // "2025-06-14"
  startTime: TimeString;   // "09:00"
  breakTime: BreakTime;    // "01:00" (統一形式)
  endTime: TimeString;     // "18:00"
  location?: WorkLocation;
  workingTime?: TimeString; // "08:00" (計算結果)
}
```

## 移行手順

### Phase 1: ユーティリティ関数の導入

✅ **完了済み**
- `src/utils/timeUtils.ts` - 時間処理ユーティリティ
- `src/types/unified.ts` - 統一型定義

### Phase 2: 既存コードの段階的移行

#### 2.1 KintaiContext.tsx の更新

**現在の問題箇所:**
```typescript
// 既存ロジック（問題あり）
const hasBreakTime =
  record.breakTime !== undefined &&
  record.breakTime !== null &&
  record.breakTime > 0; // 数値前提の比較
```

**統一後:**
```typescript
import { hasActualBreakTime } from '../types/unified';
import { isValidBreakTimeInput } from '../utils/timeUtils';

// 統一ロジック
const hasBreakTime = hasActualBreakTime(record.breakTime);
```

#### 2.2 entryStatusManager.ts の更新

**現在の問題箇所:**
```typescript
// 複雑な型判定
if (typeof breakTime === "number") {
  return breakTime > 0;
}
if (typeof breakTime === "string") {
  // 文字列処理...
}
```

**統一後:**
```typescript
import { hasActualBreakTime } from '../types/unified';

// シンプルな判定
const hasBreakTime = hasActualBreakTime(data.breakTime);
```

#### 2.3 フォームコンポーネントの更新

**データ変換の統一:**
```typescript
import { normalizeBreakTime } from '../utils/timeUtils';

// 入力値の正規化
const handleBreakTimeChange = (value: string) => {
  const normalized = normalizeBreakTime(value);
  setFormState(prev => ({
    ...prev,
    breakTime: normalized.timeString // 常にHH:mm形式
  }));
};
```

### Phase 3: データ移行

#### 3.1 既存データの変換

```typescript
// 既存データの一括変換関数
export function migrateKintaiData(oldData: any): UnifiedKintaiData {
  return {
    date: oldData.date,
    startTime: normalizeTimeString(oldData.startTime),
    breakTime: normalizeBreakTime(oldData.breakTime).timeString,
    endTime: normalizeTimeString(oldData.endTime),
    location: oldData.location,
    workingTime: oldData.workingTime ? normalizeTimeString(oldData.workingTime) : undefined,
  };
}
```

#### 3.2 ローカルストレージの移行

```typescript
// ストレージデータの移行
export function migrateStorageData(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('kintai_')) {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      const migratedData = migrateKintaiData(data);
      localStorage.setItem(key, JSON.stringify(migratedData));
    }
  });
}
```

## 検証とテスト

### 単体テスト

```typescript
// timeUtils.test.ts
describe('時間形式統一', () => {
  test('休憩時間の正規化', () => {
    expect(normalizeBreakTime('1:30').timeString).toBe('01:30');
    expect(normalizeBreakTime(90).timeString).toBe('01:30');
    expect(normalizeBreakTime('').timeString).toBe('00:00');
  });

  test('入力判定の統一', () => {
    expect(hasActualBreakTime('01:00')).toBe(true);
    expect(hasActualBreakTime('00:00')).toBe(false);
  });
});
```

### 統合テスト

```typescript
// 新旧ロジックの比較テスト
describe('判定ロジック統一', () => {
  test('既存データでの一貫性確認', () => {
    const testData = {
      date: '2025-06-14',
      startTime: '09:00',
      breakTime: '01:00', // 統一形式
      endTime: '18:00',
    };
    
    const legacyResult = legacyEntryChecker(testData);
    const unifiedResult = unifiedEntryChecker(testData);
    
    expect(legacyResult).toBe(unifiedResult);
  });
});
```

## 移行チェックリスト

### ✅ 完了済み
- [ ] 統一型定義の作成
- [ ] 時間処理ユーティリティの作成
- [ ] 移行ガイドの作成

### 🔄 進行中
- [ ] KintaiContext.tsx の更新
- [ ] entryStatusManager.ts の更新
- [ ] KintaiForm.tsx の更新

### ⏳ 予定
- [ ] 既存データの移行
- [ ] テストの実装
- [ ] 型チェックの確認
- [ ] 動作確認

## 期待される効果

### 1. 型安全性の向上
- 単一の型による一貫した処理
- コンパイル時のエラー検出
- IDEの補完機能向上

### 2. コードの簡素化
- 複雑な型判定の削除
- 統一された処理フロー
- メンテナンス性の向上

### 3. バグの削減
- 判定ロジックの不整合解消
- ランタイムエラーの削減
- 予期しない動作の防止

### 4. 開発効率の向上
- 一貫したAPI設計
- 再利用可能なユーティリティ
- 明確な責務分離

## 注意事項

1. **既存データとの互換性**
   - 移行処理の実装が必要
   - 段階的な移行を推奨

2. **UIコンポーネントの更新**
   - 入力フォームの検証ロジック更新
   - 表示形式の統一

3. **API連携の確認**
   - バックエンドとのデータ形式確認
   - 必要に応じて変換処理の実装

## まとめ

時間形式の統一により、勤怠アプリケーションの型安全性、保守性、開発効率が大幅に向上します。段階的な移行により、既存機能への影響を最小限に抑えながら、より堅牢なシステムを構築できます。