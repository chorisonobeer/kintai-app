/**
 * /src/contexts/KintaiContext.tsx
 * 2025-05-04T12:00+09:00
 * 変更概要: 新規追加 - 勤怠データ共有のためのコンテキスト
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { getMonthlyData } from "../utils/apiService";
import { KintaiRecord } from "../types";

interface KintaiContextType {
  monthlyData: KintaiRecord[];
  isDataLoading: boolean;
  fetchMonthlyData: (
    year: number,
    month: number,
    forceRefresh?: boolean,
  ) => Promise<void>;
  isDateEntered: (date: Date) => boolean;
  getKintaiDataByDate: (dateString: string) => KintaiRecord | null;
  currentYear: number;
  currentMonth: number;
  setCurrentYear: (year: number) => void;
  setCurrentMonth: (month: number) => void;
  refreshData: () => Promise<void>;
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
  const fetchMonthlyData = async (
    year: number,
    month: number,
    forceRefresh = false,
  ) => {
    const fetchKey = `${year}-${month}-${forceRefresh}`;

    // 同じリクエストが進行中の場合はスキップ
    if (isDataLoading && lastFetchKey === fetchKey && !forceRefresh) {
      console.log(`重複データ取得をスキップ: ${year}年${month}月`);
      return;
    }

    try {
      setIsDataLoading(true);
      setLastFetchKey(fetchKey);
      console.log(
        `データ取得開始: ${year}年${month}月 (forceRefresh: ${forceRefresh})`,
      );

      const data = await getMonthlyData(year, month, forceRefresh);
      setMonthlyData(data);
      console.log(`データ取得完了: ${data.length}件`);
    } catch (error) {
      console.error(`データ取得エラー: ${year}年${month}月`, error);
      setMonthlyData([]);
    } finally {
      setIsDataLoading(false);
    }
  };

  // 年月が変更されたら自動的にデータを再取得
  useEffect(() => {
    const fetchKey = `${currentYear}-${currentMonth}-false`;

    // 既に同じデータを取得済みの場合はスキップ
    if (lastFetchKey === fetchKey && monthlyData.length > 0) {
      console.log(`既存データを使用: ${currentYear}年${currentMonth}月`);
      return;
    }

    fetchMonthlyData(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  // 現在の年月でデータをリフレッシュ
  const refreshData = async () => {
    await fetchMonthlyData(currentYear, currentMonth, true);
  };

  // 日付の入力済み状態確認関数
  const isDateEntered = (date: Date): boolean => {
    const dateStr = formatDateForComparison(date);
    const record = monthlyData.find((record) => record.date === dateStr);

    if (!record) {
      return false;
    }

    // 実際にデータが入力されているかを確認
    // 出勤時間、休憩時間、退勤時間のいずれかが入力されていれば「入力済み」とする
    const hasStartTime = record.startTime && record.startTime.trim() !== "";
    const hasBreakTime =
      record.breakTime !== undefined &&
      record.breakTime !== null &&
      record.breakTime > 0;
    const hasEndTime = record.endTime && record.endTime.trim() !== "";

    return !!(hasStartTime || hasBreakTime || hasEndTime);
  };

  // monthlyDataから特定日のデータを取得する関数
  const getKintaiDataByDate = (dateString: string) => {
    const record = monthlyData.find((record) => record.date === dateString);
    return record || null;
  };

  // 比較用の日付フォーマット（YYYY-MM-DD）
  const formatDateForComparison = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const value = {
    monthlyData,
    isDataLoading,
    fetchMonthlyData,
    isDateEntered,
    getKintaiDataByDate,
    currentYear,
    currentMonth,
    setCurrentYear,
    setCurrentMonth,
    refreshData,
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
