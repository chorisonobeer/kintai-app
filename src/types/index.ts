/**
 * /src/types/index.ts
 * 2025-05-04T12:10+09:00
 * 変更概要: 更新 - KintaiFormState にフォームデータプロパティを追加
 */
export interface KintaiData {
  date: string;
  startTime: string;
  breakTime: string; // 休憩時間（HH:mm形式）
  endTime: string;
  location: string;
  workingTime?: string; // 勤務時間（HH:mm形式）
}

export interface MobileTimePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export interface MobileDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export interface MobileBreakPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export interface ValidationErrors {
  date?: string;
  startTime?: string;
  endTime?: string;
  general?: string;
}

// 勤怠フォームの状態
export interface KintaiFormState {
  date: string; // 現在選択中の日付
  startTime: string; // 出勤時刻
  breakTime: string; // 休憩時間（HH:mm形式）
  endTime: string; // 退勤時刻
  isSaved: boolean; // 現在の日付が保存済みかどうか
  isEditing: boolean; // 編集モード中かどうか
  touchStartTime: number; // 長押し開始時間
}

// 編集モード状態遷移のアクション
export enum EditActionType {
  TOUCH_START,
  TOUCH_END,
  CANCEL_EDIT,
  SAVE_COMPLETE,
  DATE_CHANGE,
  CHECK_SAVED,
}

// MobileDatePickerで使用する選択可能な日付の型
export interface SelectableDate {
  value: string;
  label: string;
}
