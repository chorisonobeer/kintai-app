import { KintaiData } from "../types";
import { entryStatusManager } from "./entryStatusManager";

/**
 * 統一判定ロジック用ユーティリティ関数
 */

/**
 * 新しい統一判定ロジックを使用した日付入力状態確認
 * @param date 確認したい日付
 * @returns 入力済みかどうか
 */
export function isDateEnteredUnified(date: Date): boolean {
  const dateStr = date.toISOString().split("T")[0];
  const result = entryStatusManager.isDateEntered(dateStr);
  return result.hasEntry;
}

/**
 * 勤怠データから入力状態を判定（統一ロジック）
 * @param data 勤怠データ
 * @returns 入力済みかどうか
 */
export function determineEntryStatusUnified(data: KintaiData): boolean {
  // 出勤時間の判定
  const hasStartTime = data.startTime && data.startTime.trim() !== "";

  // 休憩時間の判定（文字列または数値に対応）
  const hasBreakTime = hasValidBreakTime(data.breakTime);

  // 退勤時間の判定
  const hasEndTime = data.endTime && data.endTime.trim() !== "";

  // いずれかが入力されていれば入力済みとする
  return !!(hasStartTime || hasBreakTime || hasEndTime);
}

/**
 * 休憩時間の有効性を判定
 * @param breakTime 休憩時間（文字列または数値）
 * @returns 有効な休憩時間が入力されているか
 */
function hasValidBreakTime(
  breakTime: string | number | undefined | null,
): boolean {
  if (breakTime === undefined || breakTime === null) {
    return false;
  }

  // 数値の場合
  if (typeof breakTime === "number") {
    return breakTime > 0;
  }

  // 文字列の場合
  if (typeof breakTime === "string") {
    const trimmed = breakTime.trim();
    if (trimmed === "" || trimmed === "0:00" || trimmed === "00:00") {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 既存ロジックと新ロジックの比較テスト
 * @param data 勤怠データ配列
 * @param legacyLogic 既存の判定ロジック関数
 * @returns 比較結果
 */
export function compareLogics(
  data: KintaiData[],
  legacyLogic: (data: KintaiData) => boolean,
): {
  totalTests: number;
  matches: number;
  mismatches: number;
  mismatchDetails: string[];
} {
  const results = {
    totalTests: data.length,
    matches: 0,
    mismatches: 0,
    mismatchDetails: [] as string[],
  };

  data.forEach((item) => {
    const legacyResult = legacyLogic(item);
    const newResult = determineEntryStatusUnified(item);

    if (legacyResult === newResult) {
      results.matches++;
    } else {
      results.mismatches++;
      const detail =
        `${item.date}: Legacy=${legacyResult}, New=${newResult} ` +
        `(start='${item.startTime}', break='${item.breakTime}', end='${item.endTime}')`;
      results.mismatchDetails.push(detail);
    }
  });

  return results;
}

/**
 * 段階的移行のためのフラグ管理
 */
export class MigrationFlags {
  private static readonly STORAGE_KEY = "kintai_migration_flags";

  /**
   * 新しい判定ロジックを使用するかのフラグを取得
   */
  static useNewLogic(): boolean {
    const flags = this.getFlags();
    return flags.useNewEntryLogic || false;
  }

  /**
   * 新しい判定ロジックの使用フラグを設定
   */
  static setUseNewLogic(enabled: boolean): void {
    const flags = this.getFlags();
    flags.useNewEntryLogic = enabled;
    this.saveFlags(flags);
  }

  /**
   * 比較テストモードのフラグを取得
   */
  static isComparisonMode(): boolean {
    const flags = this.getFlags();
    return flags.comparisonMode || false;
  }

  /**
   * 比較テストモードのフラグを設定
   */
  static setComparisonMode(enabled: boolean): void {
    const flags = this.getFlags();
    flags.comparisonMode = enabled;
    this.saveFlags(flags);
  }

  private static getFlags(): any {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private static saveFlags(flags: any): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(flags));
    } catch {
      // ローカルストレージエラーは無視
    }
  }
}
