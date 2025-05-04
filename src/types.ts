// src/types.ts

// ————————————————————————————————
// 勤怠データ登録・保存用
export type KintaiData = {
    date: string;        // yyyy-MM-dd
    startTime: string;   // HH:mm
    breakTime: number;   // 分数で保持
    endTime: string;     // HH:mm
    location?: string;
  };
  
  // ————————————————————————————————
  // フォーム内部の状態（UI制御用）
  export interface KintaiFormState {
    date: string;
    startTime: string;
    breakTime: number;    // 分数で保持
    endTime: string;
    location?: string;
  
    // 以下、UI上で参照するフラグ・タイマー
    isSaved: boolean;
    isEditing: boolean;
    touchStartTime: number;
  }
  
  // ————————————————————————————————
  // 操作種別を値としても使える enum 定義
  export enum EditActionType {
    TOUCH_START   = 'TOUCH_START',
    TOUCH_END     = 'TOUCH_END',
    CANCEL_EDIT   = 'CANCEL_EDIT',
    SAVE_COMPLETE = 'SAVE_COMPLETE',
    DATE_CHANGE   = 'DATE_CHANGE',
    CHECK_SAVED   = 'CHECK_SAVED'
  }
  
  // ————————————————————————————————
  // バリデーションエラー構造
  export interface ValidationErrors {
    date?: string;
    startTime?: string;
    breakTime?: string;
    endTime?: string;
    location?: string;
    general?: string;
  }
  
  // ————————————————————————————————
  // モバイル用タイムピッカー Props
  export interface MobileTimePickerProps {
    label: string;
    value: string;
    onChange: (time: string) => void;
    disabled?: boolean;
  }
  
  // ————————————————————————————————
  // モバイル用休憩ピッカー Props
  export interface MobileBreakPickerProps {
    value: number;
    onChange: (minutes: number) => void;
    disabled?: boolean;
  }
  
  // ————————————————————————————————
  // 一覧表示用勤怠履歴レコード
  export type KintaiRecord = {
    date: string;
    userName: string;
    userId: string;
    startTime: string;
    breakTime: string;
    endTime: string;
    workingTime: string; // ex: '8.0h'
    location?: string;
  };
  
  // ————————————————————————————————
  // 履歴取得 API のパラメータ
  export type HistoryParams = {
    spreadsheetId: string;
    userId: string;
    year: number;
    month: number;
  };
  