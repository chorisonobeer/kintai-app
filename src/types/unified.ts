/**
 * /src/types/unified.ts
 * 2025-01-XX
 * 変更概要: 新規追加 - 統一データ型定義ファイル
 */

// ————————————————————————————————
// 基本データ型定義
// ————————————————————————————————

/**
 * 時間形式の統一定義
 * HH:mm形式の文字列（例: "09:30", "13:45"）
 */
export type TimeString = string;

/**
 * 日付形式の統一定義
 * YYYY-MM-DD形式の文字列（例: "2025-06-14"）
 */
export type DateString = string;

/**
 * 休憩時間の統一型定義
 * すべてHH:mm形式の文字列で統一
 * - "HH:mm"形式（例: "01:00", "00:30", "00:00"）
 * - "00:00"は休憩なしを表す
 */
export type BreakTime = TimeString;

/**
 * 勤務場所の統一定義
 */
export type WorkLocation = string;

// ————————————————————————————————
// 勤怠データ構造の統一定義
// ————————————————————————————————

/**
 * 勤怠データの統一インターフェース
 * すべての勤怠関連データはこの形式に準拠する
 */
export interface UnifiedKintaiData {
  /** 日付（YYYY-MM-DD形式） */
  date: DateString;
  /** 出勤時刻（HH:mm形式） */
  startTime: TimeString;
  /** 休憩時間（統一型） */
  breakTime: BreakTime;
  /** 退勤時刻（HH:mm形式） */
  endTime: TimeString;
  /** 勤務場所 */
  location?: WorkLocation;
  /** 勤務時間（HH:mm形式、計算結果） */
  workingTime?: TimeString;
}

/**
 * フォーム状態の統一インターフェース
 * UI制御用の追加プロパティを含む
 */
export interface UnifiedKintaiFormState extends UnifiedKintaiData {
  /** 保存済みフラグ */
  isSaved: boolean;
  /** 編集モードフラグ */
  isEditing: boolean;
  /** 長押し開始時間（タッチ操作用） */
  touchStartTime: number;
}

// ————————————————————————————————
// バリデーション関連の統一定義
// ————————————————————————————————

/**
 * バリデーションエラーの統一インターフェース
 */
export interface UnifiedValidationErrors {
  date?: string;
  startTime?: string;
  breakTime?: string;
  endTime?: string;
  location?: string;
  general?: string;
}

// ————————————————————————————————
// 入力判定関連の統一定義
// ————————————————————————————————

/**
 * 入力判定結果の統一インターフェース
 */
export interface UnifiedEntryStatus {
  /** 入力済みかどうか */
  hasEntry: boolean;
  /** 判定ソース */
  source: "cache" | "calculation" | "unknown";
  /** 最終更新日時 */
  lastUpdated?: number;
}

/**
 * 入力判定比較結果の統一インターフェース
 */
export interface UnifiedLogicComparison {
  /** 既存ロジックの結果 */
  legacy: boolean;
  /** 新ロジックの結果 */
  new: boolean;
  /** 結果が一致するか */
  match: boolean;
  /** 対象日付 */
  date: DateString;
}

// ————————————————————————————————
// 操作種別の統一定義
// ————————————————————————————————

/**
 * 編集操作種別の統一enum
 */
export enum UnifiedEditActionType {
  TOUCH_START = "TOUCH_START",
  TOUCH_END = "TOUCH_END",
  CANCEL_EDIT = "CANCEL_EDIT",
  SAVE_COMPLETE = "SAVE_COMPLETE",
  DATE_CHANGE = "DATE_CHANGE",
  CHECK_SAVED = "CHECK_SAVED",
}

// ————————————————————————————————
// ユーティリティ型定義
// ————————————————————————————————

/**
 * 時間データ検証関数の型定義
 */
export type TimeValidator = (timeStr: TimeString) => boolean;

/**
 * 入力判定関数の型定義
 */
export type EntryStatusChecker = (data: UnifiedKintaiData) => boolean;

/**
 * 日付フォーマット関数の型定義
 */
export type DateFormatter = (date: Date | string) => DateString;

// ————————————————————————————————
// 型ガード関数の型定義
// ————————————————————————————————

/**
 * 時間文字列が有効なHH:mm形式かどうかを判定する型ガード
 */
export function isValidTimeString(timeStr: string): timeStr is TimeString {
  const TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return TIME_PATTERN.test(timeStr);
}

/**
 * 休憩時間が有効な値かどうかを判定する型ガード
 * 統一形式では常にTimeString型なので、HH:mm形式の検証を行う
 */
export function isValidBreakTime(breakTime: BreakTime): boolean {
  return isValidTimeString(breakTime);
}

/**
 * 休憩時間が実質的に入力されているかどうかを判定
 * "00:00"は休憩なしとして扱う
 */
export function hasActualBreakTime(breakTime: BreakTime): boolean {
  return isValidTimeString(breakTime) && breakTime !== "00:00";
}
