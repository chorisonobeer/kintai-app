/**
 * /src/utils/entryStatusManager.ts
 * 2025-01-XX
 * 変更概要: 新規追加 - 入力判定テーブル管理クラス
 */

import {
  DateEntryStatus,
  MonthlyEntryCache,
  SerializableMonthlyEntryCache,
  EntryStatusOptions,
  EntryStatusResult,
} from "../types/entryStatus";
import { KintaiData } from "../types";

/**
 * 入力判定テーブルを管理するクラス
 * 月間データの入力状態を効率的に管理し、高速な判定を提供する
 */
export class EntryStatusManager {
  private cache: MonthlyEntryCache | null = null;

  private options: EntryStatusOptions;

  private readonly STORAGE_KEY = "kintai_entry_status_cache";

  constructor(options: EntryStatusOptions = {}) {
    this.options = {
      autoCleanup: true,
      cacheExpiry: 24 * 60 * 60 * 1000, // 24時間
      debugMode: false,
      ...options,
    };
  }

  /**
   * 指定された年月の月間データを初期化
   * @param yearMonth YYYY-MM形式の年月
   * @param monthlyData 月間の勤怠データ配列
   */
  async initializeMonth(
    yearMonth: string,
    monthlyData: KintaiData[],
  ): Promise<void> {
    try {
      // EntryStatusManager: 初期化開始

      // 既存キャッシュのクリーンアップ
      if (this.options.autoCleanup) {
        this.clearPreviousMonth(yearMonth);
      }

      // 新しいキャッシュを作成
      const entries = new Map<string, DateEntryStatus>();
      const currentTime = Date.now();

      // 月間データから入力状態を判定
      monthlyData.forEach((data) => {
        const hasEntry = this.determineEntryStatus(data);
        entries.set(data.date, {
          date: data.date,
          hasEntry,
          lastUpdated: currentTime,
        });
      });

      // キャッシュを更新
      this.cache = {
        yearMonth,
        entries,
        lastSync: currentTime,
      };

      // ローカルストレージに保存
      await this.saveToStorage();

      // EntryStatusManager: 初期化完了
    } catch (error) {
      console.error("Failed to initialize month:", error);
      throw error;
    }
  }

  /**
   * 特定日の入力状態を更新
   * @param date YYYY-MM-DD形式の日付
   * @param data 勤怠データ
   */
  async updateEntryStatus(date: string, data: KintaiData): Promise<void> {
    try {
      const yearMonth = date.substring(0, 7); // YYYY-MM

      // キャッシュが存在しない、または異なる月の場合は初期化
      if (!this.cache || this.cache.yearMonth !== yearMonth) {
        this.debugLog(`Cache not found for ${yearMonth}, loading from storage`);
        await this.loadFromStorage(yearMonth);
      }

      if (!this.cache) {
        throw new Error(`No cache available for ${yearMonth}`);
      }

      // 入力状態を判定
      const hasEntry = this.determineEntryStatus(data);
      const currentTime = Date.now();

      // エントリを更新
      this.cache.entries.set(date, {
        date,
        hasEntry,
        lastUpdated: currentTime,
      });

      this.cache.lastSync = currentTime;

      // ローカルストレージに保存
      await this.saveToStorage();

      // EntryStatusManager: 判定結果
    } catch (error) {
      console.error("Failed to update entry status:", error);
      throw error;
    }
  }

  /**
   * 指定日の入力状態を判定
   * @param date YYYY-MM-DD形式の日付
   * @returns 入力判定結果
   */
  isDateEntered(date: string): EntryStatusResult {
    try {
      const yearMonth = date.substring(0, 7);

      // キャッシュが存在しない、または異なる月の場合
      if (!this.cache || this.cache.yearMonth !== yearMonth) {
        this.debugLog(`Cache miss for ${date}`);
        return {
          hasEntry: false,
          source: "unknown",
        };
      }

      // キャッシュの有効期限チェック
      if (
        this.options.cacheExpiry &&
        Date.now() - this.cache.lastSync > this.options.cacheExpiry
      ) {
        this.debugLog(`Cache expired for ${yearMonth}`);
        return {
          hasEntry: false,
          source: "unknown",
        };
      }

      const entry = this.cache.entries.get(date);
      if (!entry) {
        this.debugLog(`No entry found for ${date}`);
        return {
          hasEntry: false,
          source: "cache",
        };
      }

      return {
        hasEntry: entry.hasEntry,
        source: "cache",
        lastUpdated: entry.lastUpdated,
      };
    } catch (error) {
      console.error("Failed to check entry status:", error);
      return {
        hasEntry: false,
        source: "unknown",
      };
    }
  }

  /**
   * 前月のデータをクリーンアップ
   * @param currentYearMonth 現在の年月（YYYY-MM）
   */
  clearPreviousMonth(currentYearMonth?: string): void {
    try {
      if (!currentYearMonth && this.cache) {
        currentYearMonth = this.cache.yearMonth;
      }

      if (!currentYearMonth) {
        return;
      }

      // 現在のキャッシュが異なる月の場合はクリア
      if (this.cache && this.cache.yearMonth !== currentYearMonth) {
        this.debugLog(`Clearing cache for ${this.cache.yearMonth}`);
        this.cache = null;
      }

      // ローカルストレージからも削除
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (
          key &&
          key.startsWith(this.STORAGE_KEY) &&
          currentYearMonth &&
          !key.includes(currentYearMonth)
        ) {
          localStorage.removeItem(key);
          this.debugLog(`Removed storage key: ${key}`);
        }
      });
    } catch (error) {
      console.error("Failed to clear previous month:", error);
    }
  }

  /**
   * 勤怠データから入力状態を判定（統一判定ロジック）
   * @param data 勤怠データ
   * @returns 入力済みかどうか
   */
  private determineEntryStatus(data: KintaiData): boolean {
    // 出勤時間の判定
    const hasStartTime = data.startTime && data.startTime.trim() !== "";

    // 退勤時間の判定
    const hasEndTime = data.endTime && data.endTime.trim() !== "";

    // 出勤時間または退勤時間が入力されていれば入力済みとする
    // 休憩時間は入力判定から完全に除外する
    return !!(hasStartTime || hasEndTime);
  }

  /**
   * 差分更新機能 - 最終同期時刻以降の変更のみを処理
   * @param yearMonth YYYY-MM形式の年月
   * @param recentData 最近の勤怠データ配列
   * @param lastSyncTime 最終同期時刻（省略時は現在のキャッシュの最終同期時刻を使用）
   * @returns 更新された項目数
   */
  async syncIncrementalChanges(
    yearMonth: string,
    recentData: KintaiData[],
    lastSyncTime?: number,
  ): Promise<number> {
    try {
      this.debugLog(`Starting incremental sync for ${yearMonth}`);

      // キャッシュが存在しない場合は全体初期化
      if (!this.cache || this.cache.yearMonth !== yearMonth) {
        this.debugLog("No cache found, performing full initialization");
        await this.initializeMonth(yearMonth, recentData);
        return recentData.length;
      }

      const syncTime = lastSyncTime || this.cache.lastSync;
      let updatedCount = 0;

      // 最終同期時刻以降に変更されたデータのみを処理
      const changedData = this.detectChanges(recentData, syncTime);
      this.debugLog(
        `Found ${changedData.length} changed entries since last sync`,
      );

      for (const data of changedData) {
        const hasEntry = this.determineEntryStatus(data);
        const currentStatus = this.cache.entries.get(data.date);

        // 状態が変更された場合のみ更新
        if (!currentStatus || currentStatus.hasEntry !== hasEntry) {
          await this.updateEntryStatus(data.date, data);
          updatedCount++;
          this.debugLog(`Updated entry status for ${data.date}: ${hasEntry}`);
        }
      }

      // 最終同期時刻を更新
      this.cache.lastSync = Date.now();
      await this.saveToStorage();

      this.debugLog(
        `Incremental sync completed. Updated ${updatedCount} entries`,
      );
      return updatedCount;
    } catch (error) {
      console.error("Failed to sync incremental changes:", error);
      throw error;
    }
  }

  /**
   * 変更検出ロジック - 最終同期時刻以降に変更されたデータを特定
   * @param data 勤怠データ配列
   * @param lastSyncTime 最終同期時刻
   * @returns 変更されたデータ配列
   */
  private detectChanges(
    data: KintaiData[],
    lastSyncTime: number,
  ): KintaiData[] {
    const changedData: KintaiData[] = [];
    const syncThreshold = new Date(lastSyncTime);

    for (const entry of data) {
      const hasRecentChanges = this.hasRecentModifications(
        entry,
        syncThreshold,
      );

      if (hasRecentChanges) {
        changedData.push(entry);
      }
    }

    return changedData;
  }

  /**
   * エントリが最近変更されたかどうかを判定
   * @param entry 勤怠データ
   * @param threshold 閾値時刻
   * @returns 最近変更されたかどうか
   */
  private hasRecentModifications(entry: KintaiData, threshold: Date): boolean {
    // 実際のプロジェクトでは、データにlastModifiedフィールドがある場合はそれを使用
    // ここでは簡易的な判定ロジックを実装

    const entryDate = new Date(entry.date);

    // 閾値時刻以降のデータは変更可能性があるとみなす
    if (entryDate >= threshold) {
      return true;
    }

    // 当日のデータは常に変更可能性があるとみなす
    const today = new Date();
    if (entryDate.toDateString() === today.toDateString()) {
      return true;
    }

    // 過去のデータでも、状態が変更された場合は変更とみなす
    const currentStatus = this.cache?.entries.get(entry.date);
    const newStatus = this.determineEntryStatus(entry);

    return !currentStatus || currentStatus.hasEntry !== newStatus;
  }

  /**
   * 最終同期時刻の取得
   * @returns 最終同期時刻（キャッシュが存在しない場合はnull）
   */
  getLastSyncTime(): number | null {
    return this.cache?.lastSync || null;
  }

  /**
   * 同期状態の確認
   * @returns 同期状態情報
   */
  getSyncStatus(): {
    isInitialized: boolean;
    lastSync: number | null;
    yearMonth: string | null;
    entryCount: number;
    cacheAge: number; // ミリ秒
  } {
    const now = Date.now();
    const lastSync = this.getLastSyncTime();

    return {
      isInitialized: !!this.cache,
      lastSync,
      yearMonth: this.cache?.yearMonth || null,
      entryCount: this.cache?.entries.size || 0,
      cacheAge: lastSync ? now - lastSync : 0,
    };
  }

  /**
   * 既存の判定ロジックとの比較テスト（開発用）
   * @param data 勤怠データ
   * @param legacyResult 既存ロジックの結果
   * @returns 比較結果
   */
  compareWithLegacyLogic(
    data: KintaiData,
    legacyResult: boolean,
  ): {
    newResult: boolean;
    legacyResult: boolean;
    match: boolean;
    details: string;
  } {
    const newResult = this.determineEntryStatus(data);
    const match = newResult === legacyResult;

    let details = "";
    if (!match) {
      details = `Mismatch for ${data.date}: `;
      details += `startTime='${data.startTime}', `;
      details += `breakTime='${data.breakTime}', `;
      details += `endTime='${data.endTime}' `;
      details += `-> New: ${newResult}, Legacy: ${legacyResult}`;
    }

    return {
      newResult,
      legacyResult,
      match,
      details,
    };
  }

  /**
   * ローカルストレージに保存
   */
  private async saveToStorage(): Promise<void> {
    try {
      if (!this.cache) {
        return;
      }

      const serializable: SerializableMonthlyEntryCache = {
        yearMonth: this.cache.yearMonth,
        entries: Array.from(this.cache.entries.values()),
        lastSync: this.cache.lastSync,
      };

      const storageKey = `${this.STORAGE_KEY}_${this.cache.yearMonth}`;
      localStorage.setItem(storageKey, JSON.stringify(serializable));

      this.debugLog(`Saved to storage: ${storageKey}`);
    } catch (error) {
      console.error("Failed to save to storage:", error);
    }
  }

  /**
   * ローカルストレージから読み込み
   * @param yearMonth 年月（YYYY-MM）
   */
  private async loadFromStorage(yearMonth: string): Promise<void> {
    try {
      const storageKey = `${this.STORAGE_KEY}_${yearMonth}`;
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        this.debugLog(`No storage data found for ${yearMonth}`);
        return;
      }

      const serializable: SerializableMonthlyEntryCache = JSON.parse(stored);

      // Mapに変換
      const entries = new Map<string, DateEntryStatus>();
      serializable.entries.forEach((entry) => {
        entries.set(entry.date, entry);
      });

      this.cache = {
        yearMonth: serializable.yearMonth,
        entries,
        lastSync: serializable.lastSync,
      };

      this.debugLog(
        `Loaded from storage: ${storageKey} with ${entries.size} entries`,
      );
    } catch (error) {
      console.error("Failed to load from storage:", error);
    }
  }

  /**
   * デバッグログ出力
   * @param message ログメッセージ
   */
  private debugLog(message: string): void {
    if (this.options.debugMode) {
      console.log(`[EntryStatusManager] ${message}`);
    }
  }

  /**
   * 現在のキャッシュ状態を取得（デバッグ用）
   */
  getCacheInfo(): {
    yearMonth: string | null;
    entryCount: number;
    lastSync: number | null;
  } {
    return {
      yearMonth: this.cache?.yearMonth || null,
      entryCount: this.cache?.entries.size || 0,
      lastSync: this.cache?.lastSync || null,
    };
  }
}

// シングルトンインスタンス
export const entryStatusManager = new EntryStatusManager({
  debugMode: process.env.NODE_ENV === "development",
});
