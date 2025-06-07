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

  // 年月が変更されたら自動的にデータを再取得
  useEffect(() => {
    fetchMonthlyData(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  // 月間データ取得関数
  const fetchMonthlyData = async (
    year: number,
    month: number,
    forceRefresh = false,
  ) => {
    try {
      setIsDataLoading(true);
      const data = await getMonthlyData(year, month, forceRefresh);
      setMonthlyData(data);
    } catch (error) {
      setMonthlyData([]);
    } finally {
      setIsDataLoading(false);
    }
  };

  // 現在の年月でデータをリフレッシュ
  const refreshData = async () => {
    await fetchMonthlyData(currentYear, currentMonth, true);
  };

  // 日付の入力済み状態確認関数
  const isDateEntered = (date: Date): boolean => {
    const dateStr = formatDateForComparison(date);
    return monthlyData.some((record) => record.date === dateStr);
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
export const useKintai = () => {
  const context = useContext(KintaiContext);
  if (context === undefined) {
    throw new Error("useKintai must be used within a KintaiProvider");
  }
  return context;
};
