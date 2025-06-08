/**
 * /src/utils/timeUtils.ts
 * 2025-01-XX
 * 変更概要: 新規追加 - 統一時間データ処理ユーティリティ
 */

import { TimeString, BreakTime } from '../types/unified';

// ————————————————————————————————
// 時間形式の統一処理
// ————————————————————————————————

/**
 * 時間文字列の正規表現パターン
 * HH:mm形式（例: "09:30", "13:45", "00:00"）
 */
const TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;

/**
 * 時間文字列が有効なHH:mm形式かどうかを判定
 * @param timeStr 時間文字列
 * @returns 有効な形式かどうか
 */
export function isValidTimeFormat(timeStr: string): boolean {
  return TIME_PATTERN.test(timeStr);
}

/**
 * 時間文字列をHH:mm形式に正規化
 * @param timeStr 時間文字列（例: "9:30", "09:30", "9:5"）
 * @returns 正規化された時間文字列（例: "09:30", "09:05"）
 */
export function normalizeTimeString(timeStr: string): TimeString {
  if (!timeStr || timeStr.trim() === '') {
    return '00:00';
  }

  const trimmed = timeStr.trim();
  
  // 既に正しい形式の場合はそのまま返す
  if (isValidTimeFormat(trimmed)) {
    return trimmed;
  }

  // コロンで分割して時間と分を取得
  const parts = trimmed.split(':');
  if (parts.length !== 2) {
    return '00:00';
  }

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  // 数値として有効でない場合は00:00を返す
  if (isNaN(hours) || isNaN(minutes)) {
    return '00:00';
  }

  // 範囲チェック
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return '00:00';
  }

  // HH:mm形式にフォーマット
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * 分数をHH:mm形式の時間文字列に変換
 * @param minutes 分数
 * @returns HH:mm形式の時間文字列
 */
export function minutesToTimeString(minutes: number): TimeString {
  if (minutes < 0) {
    return '00:00';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}`;
}

/**
 * HH:mm形式の時間文字列を分数に変換
 * @param timeStr HH:mm形式の時間文字列
 * @returns 分数
 */
export function timeStringToMinutes(timeStr: TimeString): number {
  if (!isValidTimeFormat(timeStr)) {
    return 0;
  }

  const [hours, minutes] = timeStr.split(':').map(num => parseInt(num, 10));
  return hours * 60 + minutes;
}

// ————————————————————————————————
// 休憩時間の統一処理
// ————————————————————————————————

/**
 * 休憩時間を統一形式（HH:mm）に正規化
 * @param breakTime 休憩時間（任意の形式）
 * @returns 正規化された休憩時間情報
 */
export function normalizeBreakTime(breakTime: BreakTime): {
  timeString: TimeString;
  minutes: number;
  isValid: boolean;
  isEmpty: boolean;
} {
  // null/undefinedの場合
  if (breakTime === null || breakTime === undefined) {
    return {
      timeString: '00:00',
      minutes: 0,
      isValid: false,
      isEmpty: true,
    };
  }

  // 数値の場合（分単位）
  if (typeof breakTime === 'number') {
    const minutes = Math.max(0, Math.floor(breakTime));
    return {
      timeString: minutesToTimeString(minutes),
      minutes,
      isValid: minutes > 0,
      isEmpty: minutes === 0,
    };
  }

  // 文字列の場合
  if (typeof breakTime === 'string') {
    const trimmed = breakTime.trim();
    
    // 空文字列の場合
    if (trimmed === '') {
      return {
        timeString: '00:00',
        minutes: 0,
        isValid: false,
        isEmpty: true,
      };
    }

    // 正規化を試行
    const normalized = normalizeTimeString(trimmed);
    const minutes = timeStringToMinutes(normalized);
    
    return {
      timeString: normalized,
      minutes,
      isValid: minutes > 0,
      isEmpty: minutes === 0,
    };
  }

  // その他の型の場合
  return {
    timeString: '00:00',
    minutes: 0,
    isValid: false,
    isEmpty: true,
  };
}

/**
 * 休憩時間が有効な入力値かどうかを判定
 * @param breakTime 休憩時間（任意の形式）
 * @returns 有効な入力値かどうか
 */
export function isValidBreakTimeInput(breakTime: BreakTime): boolean {
  const normalized = normalizeBreakTime(breakTime);
  return normalized.isValid;
}

// ————————————————————————————————
// 時間計算ユーティリティ
// ————————————————————————————————

/**
 * 2つの時間の差を計算（分単位）
 * @param startTime 開始時間（HH:mm形式）
 * @param endTime 終了時間（HH:mm形式）
 * @returns 時間差（分単位）、無効な場合は0
 */
export function calculateTimeDifference(startTime: TimeString, endTime: TimeString): number {
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
    return 0;
  }

  const startMinutes = timeStringToMinutes(startTime);
  const endMinutes = timeStringToMinutes(endTime);

  // 日をまたぐ場合を考慮
  if (endMinutes < startMinutes) {
    return (24 * 60) - startMinutes + endMinutes;
  }

  return endMinutes - startMinutes;
}

/**
 * 勤務時間を計算（休憩時間を除く）
 * @param startTime 出勤時間（HH:mm形式）
 * @param endTime 退勤時間（HH:mm形式）
 * @param breakTime 休憩時間（任意の形式）
 * @returns 勤務時間（HH:mm形式）
 */
export function calculateWorkingTime(
  startTime: TimeString,
  endTime: TimeString,
  breakTime: BreakTime
): TimeString {
  // 総勤務時間を計算
  const totalMinutes = calculateTimeDifference(startTime, endTime);
  
  // 休憩時間を正規化
  const normalizedBreak = normalizeBreakTime(breakTime);
  
  // 実勤務時間を計算
  const workingMinutes = Math.max(0, totalMinutes - normalizedBreak.minutes);
  
  return minutesToTimeString(workingMinutes);
}

// ————————————————————————————————
// 時間データの検証
// ————————————————————————————————

/**
 * 時間データの整合性を検証
 * @param startTime 出勤時間
 * @param endTime 退勤時間
 * @param breakTime 休憩時間
 * @returns 検証結果
 */
export function validateTimeData(
  startTime: TimeString,
  endTime: TimeString,
  breakTime: BreakTime
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 出勤時間の検証
  if (!isValidTimeFormat(startTime)) {
    errors.push('出勤時間の形式が正しくありません');
  }

  // 退勤時間の検証
  if (!isValidTimeFormat(endTime)) {
    errors.push('退勤時間の形式が正しくありません');
  }

  // 休憩時間の検証
  const normalizedBreak = normalizeBreakTime(breakTime);
  if (breakTime !== null && breakTime !== undefined && !normalizedBreak.isValid) {
    errors.push('休憩時間の形式が正しくありません');
  }

  // 時間の論理的整合性チェック
  if (errors.length === 0) {
    const totalMinutes = calculateTimeDifference(startTime, endTime);
    if (totalMinutes <= normalizedBreak.minutes) {
      errors.push('休憩時間が勤務時間を超えています');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ————————————————————————————————
// 表示用フォーマット
// ————————————————————————————————

/**
 * 時間を表示用にフォーマット
 * @param timeStr HH:mm形式の時間文字列
 * @param options フォーマットオプション
 * @returns フォーマットされた時間文字列
 */
export function formatTimeForDisplay(
  timeStr: TimeString,
  options: {
    showSeconds?: boolean;
    use24Hour?: boolean;
  } = {}
): string {
  if (!isValidTimeFormat(timeStr)) {
    return '00:00';
  }

  const { showSeconds = false, use24Hour = true } = options;

  if (use24Hour) {
    return showSeconds ? `${timeStr}:00` : timeStr;
  }

  // 12時間形式への変換（必要に応じて実装）
  const [hours, minutes] = timeStr.split(':').map(num => parseInt(num, 10));
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}