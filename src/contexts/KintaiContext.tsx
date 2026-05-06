/**
 * /src/contexts/KintaiContext.tsx
 * 2025-01-XX
 * 変更概要: Phase 2 - 新しい入力判定ロジック統合と並行運用
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { getMonthlyData, overlayPendingOnto } from "../utils/apiService";
import { KintaiRecord } from "../types";
import { entryStatusManager } from "../utils/entryStatusManager";

interface KintaiContextType {
  monthlyData: KintaiRecord[];
  isDataLoading: boolean;
  fetchMonthlyData: (
    year: number,
    month: number,
    forceRefresh?: boolean,
  ) => Promise<void>;
  isDateEntered: (date: Date) => boolean;
  isDateEnteredNew: (date: Date) => boolean; // 新しい判定ロジック
  getKintaiDataByDate: (dateString: string) => KintaiRecord | null;
  currentYear: number;
  currentMonth: number;
  setCurrentYear: (year: number) => void;
  setCurrentMonth: (month: number) => void;
  refreshData: () => Promise<void>;
  // 並行運用のための機能
  compareLogics: (date: Date) => {
    legacy: boolean;
    new: boolean;
    match: boolean;
  };
  initializeEntryStatusCache: () => Promise<void>;
}

const KintaiContext = createContext<KintaiContextType | undefined>(undefined);

export const KintaiProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [monthlyData, setMonthlyData] = useState<KintaiRecord[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // 現在表示中の年月を管理
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);

  // 重複リクエスト防止のためのフラグ
  const [lastFetchKey, setLastFetchKey] = useState<string>("");

  // 月間データ取得関数
  const fetchMonthlyData = useCallback(
    async (year: number, month: number, forceRefresh = false) => {
      const fetchKey = `${year}-${month}-${forceRefresh}`;

      // 同じリクエストが進行中の場合はスキップ
      if (isDataLoading && lastFetchKey === fetchKey && !forceRefresh) {
        // 重複データ取得をスキップ
        return;
      }

      try {
        setIsDataLoading(true);
        setLastFetchKey(fetchKey);
        // データ取得開始
        performance.mark(`kintai:fetch-start-${year}-${month}`);

        const data = await getMonthlyData(year, month, forceRefresh);
        performance.mark(`kintai:fetch-end-${year}-${month}`);
        setMonthlyData(data);
        // データ取得完了

        // 新しい入力判定ロジック用のキャッシュを初期化（取得したデータを直接渡す）
        // fire-and-forget で UI レンダリングをブロックしない（batch1 の軽量化）
        void initializeEntryStatusCache(data);
      } catch (error) {
        // データ取得エラー
        setMonthlyData([]);
      } finally {
        setIsDataLoading(false);
      }
    },
    [isDataLoading, lastFetchKey, currentYear, currentMonth],
  );

  // 新しい入力判定ロジック用キャッシュの初期化
  const initializeEntryStatusCache = useCallback(
    async (data?: KintaiRecord[]) => {
      try {
        const yearMonth = `${currentYear}-${currentMonth.toString().padStart(2, "0")}`;

        // 引数で渡されたデータを使用、なければmonthlyDataを使用
        const sourceData = data || monthlyData;

        // KintaiRecord[] を KintaiData[] に変換
        const convertedData = sourceData.map((record) => ({
          date: record.date,
          startTime: record.startTime,
          breakTime: record.breakTime, // 元の値をそのまま渡す（空文字列やnullも保持）
          endTime: record.endTime,
          location: record.location || "",
          tasks: record.tasks || [],
          workingTime: record.workingTime,
        }));

        await entryStatusManager.initializeMonth(yearMonth, convertedData);
        // EntryStatusManager初期化完了
      } catch (error) {
        // EntryStatusManager初期化エラー
      }
    },
    [currentYear, currentMonth, monthlyData],
  );

  // 年月が変更されたら自動的にデータを再取得
  useEffect(() => {
    const fetchKey = `${currentYear}-${currentMonth}-false`;

    // 既に同じデータを取得済みの場合はスキップ
    if (lastFetchKey === fetchKey && monthlyData.length > 0) {
      // 既存データを使用
      return;
    }

    fetchMonthlyData(currentYear, currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  // Phase E-1: SWR revalidate 完了イベントを購読
  // getMonthlyData の裏タスクが成功すると kintai:data-updated が発火される
  // v12: queue 内 pending を overlay してから state 更新（楽観値を維持）
  useEffect(() => {
    const onUpdated = (e: Event) => {
      const ce = e as CustomEvent<{
        year: number;
        month: number;
        data: KintaiRecord[];
      }>;
      if (!ce.detail) return;
      if (ce.detail.year === currentYear && ce.detail.month === currentMonth) {
        const merged = overlayPendingOnto(
          ce.detail.data,
          ce.detail.year,
          ce.detail.month,
        );
        setMonthlyData(merged);
        void initializeEntryStatusCache(merged);
      }
    };
    const onStale = (e: Event) => {
      const ce = e as CustomEvent<{ year: number; month: number }>;
      // eslint-disable-next-line no-console
      console.warn(
        `[kintai] 表示中のデータは最新でない可能性があります (${ce.detail?.year}-${ce.detail?.month})`,
      );
    };

    // v12 楽観的更新: 楽観適用 → sessionStorage cache から最新を読んで state 更新
    //                  + 「保存しました」トースト発火（0.8 秒）
    const onOptimistic = (e: Event) => {
      const ce = e as CustomEvent<{
        year: number;
        month: number;
        date: string;
      }>;
      if (!ce.detail) return;
      if (ce.detail.year !== currentYear || ce.detail.month !== currentMonth)
        return;
      try {
        const raw = sessionStorage.getItem("kintai_monthly_data");
        if (raw) {
          const map = JSON.parse(raw) as Record<string, KintaiRecord[]>;
          const list = map[`${ce.detail.year}-${ce.detail.month}`];
          if (Array.isArray(list)) {
            setMonthlyData(list);
            void initializeEntryStatusCache(list);
          }
        }
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("kintai:toast", { detail: "保存しました" }),
      );
    };

    // v12 楽観的更新: 失敗で rollback された cache を state に反映
    const onFailed = (e: Event) => {
      const ce = e as CustomEvent<{
        year: number;
        month: number;
        date: string;
        error: string;
        entryId: string;
      }>;
      if (!ce.detail) return;
      if (ce.detail.year !== currentYear || ce.detail.month !== currentMonth)
        return;
      try {
        const raw = sessionStorage.getItem("kintai_monthly_data");
        if (raw) {
          const map = JSON.parse(raw) as Record<string, KintaiRecord[]>;
          const list = map[`${ce.detail.year}-${ce.detail.month}`];
          if (Array.isArray(list)) {
            setMonthlyData(list);
            void initializeEntryStatusCache(list);
          }
        }
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[kintai] 保存に失敗しました (${ce.detail.date}): ${ce.detail.error}`,
      );
    };

    window.addEventListener("kintai:data-updated", onUpdated);
    window.addEventListener("kintai:data-stale", onStale);
    window.addEventListener("kintai:save-optimistic", onOptimistic);
    window.addEventListener("kintai:save-failed", onFailed);
    return () => {
      window.removeEventListener("kintai:data-updated", onUpdated);
      window.removeEventListener("kintai:data-stale", onStale);
      window.removeEventListener("kintai:save-optimistic", onOptimistic);
      window.removeEventListener("kintai:save-failed", onFailed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  // 現在の年月でデータをリフレッシュ
  const refreshData = useCallback(async () => {
    await fetchMonthlyData(currentYear, currentMonth, true);
  }, [fetchMonthlyData, currentYear, currentMonth]);

  // 日付の入力済み状態確認関数（既存ロジック）
  const isDateEntered = useCallback(
    (date: Date): boolean => {
      const dateStr = formatDateForComparison(date);
      const record = monthlyData.find((record) => record.date === dateStr);

      if (!record) {
        return false;
      }

      // 実際にデータが入力されているかを確認
      // 出勤時間または退勤時間が入力されていれば「入力済み」とする
      // 休憩時間は0の可能性もあるため、入力判定には使用しない
      const hasStartTime = record.startTime && record.startTime.trim() !== "";
      const hasEndTime = record.endTime && record.endTime.trim() !== "";

      return !!(hasStartTime || hasEndTime);
    },
    [monthlyData],
  );

  // 日付の入力済み状態確認関数（新しいロジック）
  const isDateEnteredNew = useCallback((date: Date): boolean => {
    const dateStr = formatDateForComparison(date);
    const result = entryStatusManager.isDateEntered(dateStr);
    return result.hasEntry;
  }, []);

  // 既存ロジックと新ロジックの比較
  const compareLogics = useCallback(
    (date: Date): { legacy: boolean; new: boolean; match: boolean } => {
      const legacyResult = isDateEntered(date);
      const newResult = isDateEnteredNew(date);
      const match = legacyResult === newResult;

      // 不整合がある場合はログ出力
      if (!match) {
        // 入力判定ロジック不整合検出（デバッグ用）
      }

      return { legacy: legacyResult, new: newResult, match };
    },
    [isDateEntered, isDateEnteredNew],
  );

  // monthlyDataから特定日のデータを取得する関数
  const getKintaiDataByDate = useCallback(
    (dateString: string) => {
      const record = monthlyData.find((record) => record.date === dateString);
      return record || null;
    },
    [monthlyData],
  );

  // 比較用の日付フォーマット（YYYY-MM-DD）
  const formatDateForComparison = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const value: KintaiContextType = {
    monthlyData,
    isDataLoading,
    fetchMonthlyData,
    isDateEntered,
    isDateEnteredNew,
    getKintaiDataByDate,
    currentYear,
    currentMonth,
    setCurrentYear,
    setCurrentMonth,
    refreshData,
    compareLogics,
    initializeEntryStatusCache,
  };

  return (
    <KintaiContext.Provider value={value}>{children}</KintaiContext.Provider>
  );
};

// カスタムフック
function useKintai() {
  const context = useContext(KintaiContext);
  if (context === undefined) {
    throw new Error("useKintai must be used within a KintaiProvider");
  }
  return context;
}

export { useKintai };
