/**
 * /src/utils/backgroundSync.ts
 * 2025-01-XX
 * 変更概要: 新規追加 - バックグラウンド同期機能
 */

import { entryStatusManager } from "./entryStatusManager";
import { KintaiData } from "../types";

/**
 * バックグラウンド同期の設定オプション
 */
export interface BackgroundSyncOptions {
  /** 同期間隔（ミリ秒） */
  syncInterval?: number;
  /** 最大リトライ回数 */
  maxRetries?: number;
  /** リトライ間隔（ミリ秒） */
  retryDelay?: number;
  /** デバッグモード */
  debugMode?: boolean;
  /** オフライン時の動作 */
  offlineMode?: boolean;
}

/**
 * 同期状態の種類
 */
export type SyncState = "idle" | "syncing" | "error" | "offline";

/**
 * 同期結果
 */
export interface SyncResult {
  success: boolean;
  updatedCount: number;
  error?: string;
  timestamp: number;
}

/**
 * バックグラウンド同期管理クラス
 */
export class BackgroundSyncManager {
  private options: Required<BackgroundSyncOptions>;

  private syncState: SyncState = "idle";

  private syncTimer: NodeJS.Timeout | null = null;

  private retryCount = 0;

  private lastSyncResult: SyncResult | null = null;

  private listeners: Array<(state: SyncState, result?: SyncResult) => void> =
    [];

  constructor(options: BackgroundSyncOptions = {}) {
    this.options = {
      syncInterval: 5 * 60 * 1000, // 5分
      maxRetries: 3,
      retryDelay: 30 * 1000, // 30秒
      debugMode: process.env.NODE_ENV === "development",
      offlineMode: false,
      ...options,
    };

    // オンライン/オフライン状態の監視
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline.bind(this));
      window.addEventListener("offline", this.handleOffline.bind(this));
    }
  }

  /**
   * バックグラウンド同期を開始
   */
  start(): void {
    if (this.syncTimer) {
      this.debugLog("Background sync already running");
      return;
    }

    this.debugLog("Starting background sync");
    this.scheduleNextSync();
  }

  /**
   * バックグラウンド同期を停止
   */
  stop(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
      this.debugLog("Background sync stopped");
    }
    this.setSyncState("idle");
  }

  /**
   * 手動同期を実行
   * @param yearMonth 対象年月
   * @param data 勤怠データ
   */
  async manualSync(yearMonth: string, data: KintaiData[]): Promise<SyncResult> {
    this.debugLog(`Manual sync requested for ${yearMonth}`);
    return this.performSync(yearMonth, data);
  }

  /**
   * 次回同期をスケジュール
   */
  private scheduleNextSync(): void {
    if (this.syncState === "offline" && !this.options.offlineMode) {
      this.debugLog("Skipping sync schedule - offline mode");
      return;
    }

    const delay =
      this.retryCount > 0 ? this.options.retryDelay : this.options.syncInterval;

    this.syncTimer = setTimeout(async () => {
      await this.performPeriodicSync();
      this.scheduleNextSync();
    }, delay);

    this.debugLog(`Next sync scheduled in ${delay}ms`);
  }

  /**
   * 定期同期を実行
   */
  private async performPeriodicSync(): Promise<void> {
    try {
      // 現在のキャッシュ状態を確認
      const syncStatus = entryStatusManager.getSyncStatus();

      if (!syncStatus.isInitialized) {
        this.debugLog("Entry status manager not initialized, skipping sync");
        return;
      }

      // 実際のプロジェクトでは、ここでAPIから最新データを取得
      // 今回は簡易実装として、既存のデータを使用
      const { yearMonth } = syncStatus;
      if (!yearMonth) {
        this.debugLog("No year-month available, skipping sync");
        return;
      }

      // TODO: 実際のAPIコールでデータを取得
      // const data = await apiService.getMonthlyData(yearMonth);
      // await this.performSync(yearMonth, data);

      this.debugLog("Periodic sync completed (placeholder)");
    } catch (error) {
      this.debugLog(`Periodic sync failed: ${error}`);
    }
  }

  /**
   * 同期処理を実行
   * @param yearMonth 対象年月
   * @param data 勤怠データ
   */
  private async performSync(
    yearMonth: string,
    data: KintaiData[],
  ): Promise<SyncResult> {
    const startTime = Date.now();
    this.setSyncState("syncing");

    try {
      this.debugLog(
        `Starting sync for ${yearMonth} with ${data.length} entries`,
      );

      // 差分更新を実行
      const updatedCount = await entryStatusManager.syncIncrementalChanges(
        yearMonth,
        data,
      );

      const result: SyncResult = {
        success: true,
        updatedCount,
        timestamp: Date.now(),
      };

      this.lastSyncResult = result;
      this.retryCount = 0;
      this.setSyncState("idle", result);

      this.debugLog(
        `Sync completed successfully. Updated ${updatedCount} entries in ${Date.now() - startTime}ms`,
      );
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const result: SyncResult = {
        success: false,
        updatedCount: 0,
        error: errorMessage,
        timestamp: Date.now(),
      };

      this.lastSyncResult = result;
      this.handleSyncError(error);

      return result;
    }
  }

  /**
   * 同期エラーを処理
   * @param error エラー
   */
  private handleSyncError(error: unknown): void {
    this.retryCount++;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    this.debugLog(
      `Sync failed (attempt ${this.retryCount}/${this.options.maxRetries}): ${errorMessage}`,
    );

    if (this.retryCount >= this.options.maxRetries) {
      this.setSyncState("error");
      this.retryCount = 0;
    } else {
      // リトライをスケジュール
      this.setSyncState("idle");
    }
  }

  /**
   * オンライン状態になった時の処理
   */
  private handleOnline(): void {
    this.debugLog("Network online detected");
    if (this.syncState === "offline") {
      this.setSyncState("idle");
      // 即座に同期を試行
      this.scheduleNextSync();
    }
  }

  /**
   * オフライン状態になった時の処理
   */
  private handleOffline(): void {
    this.debugLog("Network offline detected");
    this.setSyncState("offline");
  }

  /**
   * 同期状態を設定
   * @param state 新しい状態
   * @param result 同期結果（オプション）
   */
  private setSyncState(state: SyncState, result?: SyncResult): void {
    if (this.syncState !== state) {
      this.syncState = state;
      this.notifyListeners(state, result);
    }
  }

  /**
   * リスナーに状態変更を通知
   * @param state 同期状態
   * @param result 同期結果
   */
  private notifyListeners(state: SyncState, result?: SyncResult): void {
    this.listeners.forEach((listener) => {
      try {
        listener(state, result);
      } catch (error) {
        console.error("Error in sync state listener:", error);
      }
    });
  }

  /**
   * 状態変更リスナーを追加
   * @param listener リスナー関数
   */
  addStateListener(
    listener: (state: SyncState, result?: SyncResult) => void,
  ): void {
    this.listeners.push(listener);
  }

  /**
   * 状態変更リスナーを削除
   * @param listener リスナー関数
   */
  removeStateListener(
    listener: (state: SyncState, result?: SyncResult) => void,
  ): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 現在の同期状態を取得
   */
  getSyncState(): SyncState {
    return this.syncState;
  }

  /**
   * 最後の同期結果を取得
   */
  getLastSyncResult(): SyncResult | null {
    return this.lastSyncResult;
  }

  /**
   * 同期統計情報を取得
   */
  getSyncStats(): {
    state: SyncState;
    lastSync: SyncResult | null;
    retryCount: number;
    isOnline: boolean;
  } {
    return {
      state: this.syncState,
      lastSync: this.lastSyncResult,
      retryCount: this.retryCount,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    };
  }

  /**
   * デバッグログ出力
   * @param message ログメッセージ
   */
  private debugLog(message: string): void {
    if (this.options.debugMode) {
      console.log(`[BackgroundSyncManager] ${message}`);
    }
  }

  /**
   * リソースをクリーンアップ
   */
  destroy(): void {
    this.stop();
    this.listeners = [];

    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline.bind(this));
      window.removeEventListener("offline", this.handleOffline.bind(this));
    }
  }
}

// シングルトンインスタンス
export const backgroundSyncManager = new BackgroundSyncManager();
