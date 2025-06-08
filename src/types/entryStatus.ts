/**
 * /src/types/entryStatus.ts
 * 2025-01-XX
 * 変更概要: 新規追加 - 入力判定専用テーブルの型定義
 */

// ————————————————————————————————
// 日付ごとの入力状態を管理する型
export interface DateEntryStatus {
  /** 日付（YYYY-MM-DD形式） */
  date: string;
  /** データ入力済みかどうか */
  hasEntry: boolean;
  /** 最終更新タイムスタンプ */
  lastUpdated: number;
}

// ————————————————————————————————
// 月間の入力状態キャッシュを管理する型
export interface MonthlyEntryCache {
  /** 年月（YYYY-MM形式） */
  yearMonth: string;
  /** 日付ごとの入力状態マップ */
  entries: Map<string, DateEntryStatus>;
  /** 最終同期タイムスタンプ */
  lastSync: number;
}

// ————————————————————————————————
// ローカルストレージ保存用の型（MapはJSONシリアライズできないため）
export interface SerializableMonthlyEntryCache {
  /** 年月（YYYY-MM形式） */
  yearMonth: string;
  /** 日付ごとの入力状態の配列 */
  entries: DateEntryStatus[];
  /** 最終同期タイムスタンプ */
  lastSync: number;
}

// ————————————————————————————————
// 入力判定の設定オプション
export interface EntryStatusOptions {
  /** 自動クリーンアップを有効にするか */
  autoCleanup?: boolean;
  /** キャッシュの有効期限（ミリ秒） */
  cacheExpiry?: number;
  /** デバッグモードを有効にするか */
  debugMode?: boolean;
}

// ————————————————————————————————
// 入力判定結果の型
export interface EntryStatusResult {
  /** 入力済みかどうか */
  hasEntry: boolean;
  /** 判定に使用したデータソース */
  source: "cache" | "api" | "unknown";
  /** 最終更新日時 */
  lastUpdated?: number;
}
