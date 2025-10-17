# 勤怠管理アプリ - ビジネスロジックドキュメント

## 🎯 概要

本ドキュメントでは、勤怠管理アプリの核となるビジネスロジックについて詳細に説明します。主要な機能として、入力済み判定アルゴリズム、勤務時間計算ロジック、編集可能期間制限、バリデーションルール、データ整合性チェック、自動補完機能、エラーハンドリング、通知・アラート機能について包括的に解説します。

## 📋 目次

1. [入力済み判定アルゴリズム](#入力済み判定アルゴリズム)
2. [勤務時間計算ロジック](#勤務時間計算ロジック)
3. [編集可能期間制限](#編集可能期間制限)
4. [バリデーションルール](#バリデーションルール)
5. [データ整合性チェック](#データ整合性チェック)
6. [自動補完機能](#自動補完機能)
7. [エラーハンドリング](#エラーハンドリング)
8. [通知・アラート機能](#通知アラート機能)

## 📝 入力済み判定アルゴリズム

### 基本概念

勤怠データが「入力済み」と判定されるためには、以下の必須項目がすべて入力されている必要があります：

1. **出勤時間** (`startTime`): HH:mm形式
2. **退勤時間** (`endTime`): HH:mm形式
3. **勤務場所** (`location`): 文字列

### レガシー判定ロジック

```typescript
/**
 * 従来の入力済み判定ロジック
 * シンプルな存在チェックのみ実行
 */
const isDateEntered = (date: Date): boolean => {
  const dateString = formatDate(date); // YYYY-MM-DD形式
  const kintaiData = getKintaiDataByDate(dateString);

  return !!(
    kintaiData?.startTime &&
    kintaiData?.endTime &&
    kintaiData?.location
  );
};
```

**特徴:**

- 単純な存在チェック
- 空文字や無効な値の検証なし
- パフォーマンス重視

### 新判定ロジック（EntryStatusManager）

```typescript
/**
 * 新しい入力済み判定ロジック
 * より厳密なバリデーションとキャッシュ機能を提供
 */
class EntryStatusManager {
  private cache: MonthlyEntryCache | null = null;

  /**
   * 指定日の入力状態を判定
   */
  isDateEntered(date: Date): boolean {
    const dateString = formatDate(date);

    // キャッシュから高速取得
    const cachedResult = this.getCachedStatus(dateString);
    if (cachedResult !== null) {
      return cachedResult;
    }

    // データ取得と判定
    const data = this.getKintaiData(dateString);
    const isEntered = this.validateRequiredFields(data);

    // キャッシュ更新
    this.updateCache(dateString, isEntered);

    return isEntered;
  }

  /**
   * 必須フィールドの厳密なバリデーション
   */
  private validateRequiredFields(data: KintaiData | null): boolean {
    if (!data) return false;

    // 1. 存在チェック
    if (
      !data.startTime?.trim() ||
      !data.endTime?.trim() ||
      !data.location?.trim()
    ) {
      return false;
    }

    // 2. 時間形式チェック
    if (
      !this.isValidTimeFormat(data.startTime) ||
      !this.isValidTimeFormat(data.endTime)
    ) {
      return false;
    }

    // 3. 時刻の論理チェック
    if (!this.isValidTimeSequence(data.startTime, data.endTime)) {
      return false;
    }

    return true;
  }

  /**
   * 時間形式の妥当性チェック（HH:mm形式）
   */
  private isValidTimeFormat(timeStr: string): boolean {
    const TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return TIME_PATTERN.test(timeStr);
  }

  /**
   * 時刻の前後関係チェック
   */
  private isValidTimeSequence(startTime: string, endTime: string): boolean {
    const startMinutes = this.timeStringToMinutes(startTime);
    const endMinutes = this.timeStringToMinutes(endTime);

    // 日跨ぎ勤務の考慮
    if (endMinutes < startMinutes) {
      // 翌日の勤務として扱う（24時間を加算）
      return endMinutes + 24 * 60 > startMinutes;
    }

    return endMinutes > startMinutes;
  }
}
```

**特徴:**

- 厳密なバリデーション
- キャッシュによる高速化
- 時刻の論理チェック
- 日跨ぎ勤務対応

### 並行運用システム

現在、新旧両方のロジックを並行運用し、段階的に移行を進めています：

```typescript
/**
 * 新旧ロジックの比較機能
 */
const compareLogics = (
  date: Date
): {
  legacy: boolean;
  new: boolean;
  match: boolean;
} => {
  const legacy = isDateEntered(date); // レガシーロジック
  const newLogic = isDateEnteredNew(date); // 新ロジック

  return {
    legacy,
    new: newLogic,
    match: legacy === newLogic, // 結果の一致性
  };
};
```

**移行フェーズ:**

- **Phase 1**: レガシーロジックのみ使用
- **Phase 2**: 並行運用・比較検証（現在）
- **Phase 3**: 新ロジックへの完全移行

## ⏰ 勤務時間計算ロジック

### 基本計算式

```typescript
/**
 * 勤務時間の自動計算
 * 勤務時間 = 退勤時間 - 出勤時間 - 休憩時間
 */
const calculateWorkingTime = (
  startTime: string,
  endTime: string,
  breakTime: string = "0:00"
): string => {
  // 1. 入力値の正規化
  const normalizedStart = normalizeTimeString(startTime);
  const normalizedEnd = normalizeTimeString(endTime);
  const normalizedBreak = normalizeTimeString(breakTime);

  // 2. 分数に変換
  const startMinutes = timeStringToMinutes(normalizedStart);
  const endMinutes = timeStringToMinutes(normalizedEnd);
  const breakMinutes = timeStringToMinutes(normalizedBreak);

  // 3. 日跨ぎ勤務の処理
  let workingMinutes: number;
  if (endMinutes < startMinutes) {
    // 翌日勤務の場合（例: 22:00 ～ 06:00）
    workingMinutes = endMinutes + 24 * 60 - startMinutes;
  } else {
    // 同日勤務の場合
    workingMinutes = endMinutes - startMinutes;
  }

  // 4. 休憩時間を差し引き
  workingMinutes -= breakMinutes;

  // 5. 負の値の場合は0:00を返す
  if (workingMinutes < 0) {
    return "0:00";
  }

  // 6. HH:mm形式に変換
  return minutesToTimeString(workingMinutes);
};
```

### 時間形式の統一処理

#### 正規化ロジック

```typescript
/**
 * 時間文字列をHH:mm形式に正規化
 * 入力例: "9:30", "09:30", "9:5" → 出力: "09:30", "09:30", "09:05"
 */
export function normalizeTimeString(timeStr: string): TimeString {
  if (!timeStr || timeStr.trim() === "") {
    return "00:00";
  }

  const trimmed = timeStr.trim();

  // 既に正しい形式の場合はそのまま返す
  if (isValidTimeFormat(trimmed)) {
    return trimmed;
  }

  // コロンで分割して時間と分を取得
  const parts = trimmed.split(":");
  if (parts.length !== 2) {
    return "00:00";
  }

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  // 数値として有効でない場合は00:00を返す
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return "00:00";
  }

  // 範囲チェック
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "00:00";
  }

  // HH:mm形式にフォーマット
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
```

#### 分数変換ロジック

```typescript
/**
 * HH:mm形式の時間文字列を分数に変換
 */
export function timeStringToMinutes(timeStr: TimeString): number {
  if (!isValidTimeFormat(timeStr)) {
    return 0;
  }

  const [hours, minutes] = timeStr.split(":").map((num) => parseInt(num, 10));
  return hours * 60 + minutes;
}

/**
 * 分数をHH:mm形式の時間文字列に変換
 */
export function minutesToTimeString(minutes: number): TimeString {
  if (minutes < 0) {
    return "00:00";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours.toString().padStart(2, "0")}:${remainingMinutes.toString().padStart(2, "0")}`;
}
```

### 休憩時間の扱い

#### デフォルト値の設定

```typescript
/**
 * 休憩時間のデフォルト値処理
 */
const getDefaultBreakTime = (workingMinutes: number): string => {
  // 6時間以上の勤務の場合、45分の休憩を推奨
  if (workingMinutes >= 6 * 60) {
    return "0:45";
  }

  // 4時間以上の勤務の場合、30分の休憩を推奨
  if (workingMinutes >= 4 * 60) {
    return "0:30";
  }

  // それ以外は休憩なし
  return "0:00";
};
```

#### 法定休憩時間のチェック

```typescript
/**
 * 労働基準法に基づく休憩時間のチェック
 */
const validateLegalBreakTime = (
  workingMinutes: number,
  breakMinutes: number
): { isValid: boolean; requiredBreak: number; warning?: string } => {
  // 6時間以下の場合、休憩は任意
  if (workingMinutes <= 6 * 60) {
    return { isValid: true, requiredBreak: 0 };
  }

  // 6時間超8時間以下の場合、45分以上の休憩が必要
  if (workingMinutes <= 8 * 60) {
    const required = 45;
    return {
      isValid: breakMinutes >= required,
      requiredBreak: required,
      warning:
        breakMinutes < required
          ? `6時間を超える勤務には${required}分以上の休憩が必要です`
          : undefined,
    };
  }

  // 8時間超の場合、60分以上の休憩が必要
  const required = 60;
  return {
    isValid: breakMinutes >= required,
    requiredBreak: required,
    warning:
      breakMinutes < required
        ? `8時間を超える勤務には${required}分以上の休憩が必要です`
        : undefined,
  };
};
```

### 日跨ぎ勤務の処理

```typescript
/**
 * 日跨ぎ勤務の判定と処理
 */
const handleOvernightWork = (
  startTime: string,
  endTime: string
): {
  isOvernight: boolean;
  workingMinutes: number;
  nextDayMinutes: number;
} => {
  const startMinutes = timeStringToMinutes(startTime);
  const endMinutes = timeStringToMinutes(endTime);

  if (endMinutes < startMinutes) {
    // 日跨ぎ勤務
    const totalMinutes = endMinutes + 24 * 60 - startMinutes;
    const nextDayMinutes = endMinutes;

    return {
      isOvernight: true,
      workingMinutes: totalMinutes,
      nextDayMinutes,
    };
  }

  // 同日勤務
  return {
    isOvernight: false,
    workingMinutes: endMinutes - startMinutes,
    nextDayMinutes: 0,
  };
};
```

## 📅 編集可能期間制限

### 基本設定

```typescript
// 編集可能日数の設定（この値を変更するだけで全体の動作が変わります）
export const EDITABLE_DAYS = 20;
```

### 編集可能期間の判定

```typescript
/**
 * 指定された日付が編集可能日数を超えて古いかどうかをチェックする
 */
export const isDateTooOld = (date: string): boolean => {
  const targetDate = new Date(date);
  const today = new Date();
  const diffTime = today.getTime() - targetDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > EDITABLE_DAYS;
};

/**
 * 日付が許容範囲内かどうかチェックする
 * 現在より編集可能日数前から当日までが有効
 */
export const isDateInValidRange = (date: string): boolean => {
  const targetDate = new Date(date);
  const today = new Date();
  const limitDate = new Date(today);
  limitDate.setDate(today.getDate() - EDITABLE_DAYS);

  return targetDate >= limitDate && targetDate <= today;
};
```

### 選択可能日付の生成

```typescript
/**
 * 編集可能な日付のリストを生成
 */
export const getSelectableDates = (): SelectableDate[] => {
  const dates: SelectableDate[] = [];
  const today = new Date();

  // 過去EDITABLE_DAYS日分から今日まで
  for (let i = EDITABLE_DAYS; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const dateString = formatDate(date);
    const displayString = formatDateWithWeekday(dateString);

    dates.push({
      value: dateString,
      label: displayString,
    });
  }

  return dates;
};
```

### UI連動箇所

- `src/utils/dateUtils.ts`: `EDITABLE_DAYS` 定数、`isDateTooOld`、`isDateInValidRange`、`getSelectableDates` が中心的に制御。
- `src/components/KintaiForm.tsx`: `isDateTooOld(formState.date)` の判定結果で保存ボタンのクラス/文言を切り替え（20日超過で「編集不可」表示）。`getSelectableDates()` を取得して日付選択に使用。
- `src/components/MobileDatePicker.tsx`: 現在の実装では `selectableDates` を直接は使用せず、任意の日付選択を許容。編集可否自体は `KintaiForm` 側で制御。
- 仕様変更方法: `src/utils/dateUtils.ts` の `EDITABLE_DAYS` を変更すれば、許容期間がアプリ全体に一括反映される。

### 権限管理

```typescript
/**
 * ユーザーの編集権限をチェック
 */
const checkEditPermission = (
  date: string,
  userId: string
): {
  canEdit: boolean;
  reason?: string;
} => {
  // 1. 日付の編集可能期間チェック
  if (isDateTooOld(date)) {
    return {
      canEdit: false,
      reason: `編集可能期間を超えています（${EDITABLE_DAYS}日以内のみ編集可能）`,
    };
  }

  // 2. 未来日のチェック
  const targetDate = new Date(date);
  const today = new Date();
  if (targetDate > today) {
    return {
      canEdit: false,
      reason: "未来の日付は編集できません",
    };
  }

  // 3. ユーザー権限チェック（将来の拡張用）
  // const userRole = getUserRole(userId);
  // if (userRole === 'readonly') {
  //   return { canEdit: false, reason: "読み取り専用ユーザーです" };
  // }

  return { canEdit: true };
};
```

## 🔍 バリデーションルール

### フロントエンドバリデーション

```typescript
/**
 * 勤怠データの包括的バリデーション
 */
const validateKintaiData = (data: KintaiData): ValidationErrors => {
  const errors: ValidationErrors = {};

  // 1. 日付バリデーション
  if (!data.date) {
    errors.date = "日付は必須です";
  } else if (isDateTooOld(data.date)) {
    errors.date = `編集可能期間を超えています（${EDITABLE_DAYS}日以内のみ編集可能）`;
  }

  // 2. 出勤時間バリデーション
  if (!data.startTime?.trim()) {
    errors.startTime = "出勤時間は必須です";
  } else if (!isValidTimeFormat(data.startTime)) {
    errors.startTime = "正しい時間形式で入力してください（HH:mm）";
  }

  // 3. 退勤時間バリデーション
  if (!data.endTime?.trim()) {
    errors.endTime = "退勤時間は必須です";
  } else if (!isValidTimeFormat(data.endTime)) {
    errors.endTime = "正しい時間形式で入力してください（HH:mm）";
  }

  // 4. 勤務場所バリデーション
  if (!data.location?.trim()) {
    errors.general = "勤務場所は必須です";
  }

  // 5. 時刻の前後関係チェック
  if (
    data.startTime &&
    data.endTime &&
    isValidTimeFormat(data.startTime) &&
    isValidTimeFormat(data.endTime)
  ) {
    if (!isTimeBeforeOrEqual(data.startTime, data.endTime)) {
      // 日跨ぎでない場合のエラー
      const startMinutes = timeStringToMinutes(data.startTime);
      const endMinutes = timeStringToMinutes(data.endTime);

      if (endMinutes <= startMinutes) {
        errors.endTime = "退勤時間は出勤時間より後である必要があります";
      }
    }
  }

  // 6. 休憩時間バリデーション（任意項目）
  if (data.breakTime && !isValidTimeFormat(data.breakTime)) {
    errors.general = "休憩時間は正しい時間形式で入力してください（HH:mm）";
  }

  // 7. 勤務時間の妥当性チェック
  if (data.startTime && data.endTime && data.breakTime) {
    const workingTime = calculateWorkingTime(
      data.startTime,
      data.endTime,
      data.breakTime
    );

    const workingMinutes = timeStringToMinutes(workingTime);

    // 24時間を超える勤務のチェック
    if (workingMinutes > 24 * 60) {
      errors.general = "勤務時間が24時間を超えています";
    }

    // 法定休憩時間のチェック
    const breakMinutes = timeStringToMinutes(data.breakTime);
    const breakValidation = validateLegalBreakTime(
      workingMinutes,
      breakMinutes
    );

    if (!breakValidation.isValid && breakValidation.warning) {
      errors.general = breakValidation.warning;
    }
  }

  return errors;
};
```

### サーバーサイドバリデーション

```typescript
/**
 * Google Apps Script側でのバリデーション
 */
function validateKintaiDataOnServer(data) {
  const errors = [];

  // 1. 重複チェック
  const existingData = getKintaiDataByDate(data.userId, data.date);
  if (existingData && existingData.id !== data.id) {
    errors.push("この日付のデータは既に存在します");
  }

  // 2. ユーザー権限チェック
  const user = getUserById(data.userId);
  if (!user || user.status !== "active") {
    errors.push("無効なユーザーです");
  }

  // 3. データ整合性チェック
  if (data.startTime && data.endTime) {
    const workingMinutes = calculateWorkingMinutes(
      data.startTime,
      data.endTime,
      data.breakTime || "0:00"
    );

    if (workingMinutes < 0) {
      errors.push("勤務時間が負の値になっています");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

## 🔄 エラーハンドリング

### エラー分類

```typescript
enum ErrorType {
  VALIDATION_ERROR = "validation_error",
  NETWORK_ERROR = "network_error",
  PERMISSION_ERROR = "permission_error",
  DATA_CONFLICT = "data_conflict",
  SYSTEM_ERROR = "system_error",
}

interface BusinessLogicError {
  type: ErrorType;
  message: string;
  field?: string;
  code?: string;
  details?: any;
}
```

### エラー処理戦略

```typescript
/**
 * ビジネスロジックエラーの統一処理
 */
const handleBusinessLogicError = (
  error: BusinessLogicError
): {
  shouldRetry: boolean;
  userMessage: string;
  logLevel: "info" | "warn" | "error";
} => {
  switch (error.type) {
    case ErrorType.VALIDATION_ERROR:
      return {
        shouldRetry: false,
        userMessage: error.message,
        logLevel: "info",
      };

    case ErrorType.NETWORK_ERROR:
      return {
        shouldRetry: true,
        userMessage:
          "ネットワークエラーが発生しました。しばらく後に再試行してください。",
        logLevel: "warn",
      };

    case ErrorType.PERMISSION_ERROR:
      return {
        shouldRetry: false,
        userMessage: "この操作を実行する権限がありません。",
        logLevel: "warn",
      };

    case ErrorType.DATA_CONFLICT:
      return {
        shouldRetry: false,
        userMessage:
          "データの競合が発生しました。ページを再読み込みしてください。",
        logLevel: "error",
      };

    default:
      return {
        shouldRetry: false,
        userMessage:
          "システムエラーが発生しました。管理者にお問い合わせください。",
        logLevel: "error",
      };
  }
};
```

## 📊 パフォーマンス最適化

### キャッシュ戦略

```typescript
/**
 * 計算結果のメモ化
 */
const memoizedCalculateWorkingTime = (() => {
  const cache = new Map<string, string>();

  return (
    startTime: string,
    endTime: string,
    breakTime: string = "0:00"
  ): string => {
    const key = `${startTime}-${endTime}-${breakTime}`;

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = calculateWorkingTime(startTime, endTime, breakTime);
    cache.set(key, result);

    // キャッシュサイズ制限（1000エントリ）
    if (cache.size > 1000) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return result;
  };
})();
```

### バッチ処理

```typescript
/**
 * 月間データの一括処理
 */
const processBatchValidation = async (
  monthlyData: KintaiData[]
): Promise<Map<string, ValidationErrors>> => {
  const results = new Map<string, ValidationErrors>();

  // 並列処理でバリデーション実行
  const validationPromises = monthlyData.map(async (data) => {
    const errors = await validateKintaiData(data);
    return { date: data.date, errors };
  });

  const validationResults = await Promise.all(validationPromises);

  validationResults.forEach(({ date, errors }) => {
    if (Object.keys(errors).length > 0) {
      results.set(date, errors);
    }
  });

  return results;
};
```

---

**最終更新**: 2025-01-27  
**バージョン**: 1.0.0  
**関連ドキュメント**:

- [システム概要](./SYSTEM_OVERVIEW.md)
- [データ管理](./DATA_MANAGEMENT.md)
- [API仕様](./API_SPECIFICATION.md)
