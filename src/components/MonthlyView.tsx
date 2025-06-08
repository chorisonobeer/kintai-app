/**
 * /src/components/MonthlyView.tsx
 * 2025-05-05T15:45+09:00
 * 変更概要: 更新 - ヘッダー部分を共通Headerコンポーネントに移行、ユーザー情報表示の削除
 */
import React, { useState } from "react";
import { useKintai } from "../contexts/KintaiContext";

const MonthlyView: React.FC = () => {
  const {
    monthlyData,
    isDataLoading,
    currentYear,
    currentMonth,
    setCurrentYear,
    setCurrentMonth,
    refreshData,
  } = useKintai();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // 前月・翌月に移動する関数
  const goToPreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // 曜日の日本語名を取得
  const getDayOfWeekName = (dateStr: string): string => {
    try {
      // 複数の日付形式に対応
      const formattedDate = normalizeDateForDisplay(dateStr);
      const date = new Date(formattedDate);

      if (Number.isNaN(date.getTime())) {
        return "";
      }
      const days = ["日", "月", "火", "水", "木", "金", "土"];
      return days[date.getDay()];
    } catch (e) {
      return "";
    }
  };

  // 曜日に応じたクラス名を取得
  const getDayClass = (dateStr: string): string => {
    try {
      // 複数の日付形式に対応
      const formattedDate = normalizeDateForDisplay(dateStr);
      const date = new Date(formattedDate);

      if (Number.isNaN(date.getTime())) {
        return "";
      }
      const day = date.getDay();
      if (day === 0) return "day-sunday";
      if (day === 6) return "day-saturday";
      return "";
    } catch (e) {
      return "";
    }
  };

  // 日付表示のフォーマット（例：3（水））
  const formatDay = (dateStr: string): string => {
    try {
      // 複数の日付形式に対応
      const formattedDate = normalizeDateForDisplay(dateStr);
      const date = new Date(formattedDate);

      if (Number.isNaN(date.getTime())) {
        // 無効な日付の場合、正規化された文字列から日を抽出
        const normalized = normalizeDateForDisplay(dateStr); // 正規化を試みる
        const match = normalized.match(/^\d{4}-\d{2}-(\d{2})$/);
        return match && match[1] ? `${parseInt(match[1])}（?）` : "エラー";
      }
      const dayOfWeek = getDayOfWeekName(dateStr);
      return `${date.getDate()}（${dayOfWeek}）`;
    } catch (e) {
      return "エラー";
    }
  };

  /**
   * 複数の日付形式を統一して処理する関数
   * YYYY/MM/DD、YYYY-MM-DD、YYYY年MM月DD日 などの形式に対応
   */
  const normalizeDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return "";

    // すでにYYYY-MM-DD形式の場合はそのまま返す
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // YYYY/MM/DD形式の場合はYYYY-MM-DD形式に変換
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }

    // 日本語形式（YYYY年MM月DD日）の場合はYYYY-MM-DD形式に変換
    const jpMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jpMatch && jpMatch.length === 4) {
      const [_, year, month, day] = jpMatch;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    // その他の形式の場合はDateオブジェクトを使って変換
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      }
    } catch (e) {
      // 日付変換エラーは無視
    }

    // 変換に失敗した場合は元の文字列を返すか、エラーを示す値を返す
    return dateStr; // または適切なエラー表示
  };

  // 時刻のフォーマット（例：9:00）
  const formatTime = (timeStr: string): string => {
    try {
      if (!timeStr) return "";

      // ISO形式の日付時刻文字列の場合
      if (timeStr.includes("T")) {
        const date = new Date(timeStr);
        if (!isNaN(date.getTime())) {
          return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
        }
      }

      // すでにHH:MM形式の場合はそのまま返す
      const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        // 時間や分が1桁の場合に0埋めする (例: 9:5 -> 09:05)
        const hours = timeMatch[1].padStart(2, "0");
        const minutes = timeMatch[2].padStart(2, "0");
        return `${hours}:${minutes}`;
      }

      // 変換できなかった場合は元の文字列を返す
      return timeStr;
    } catch (e) {
      return timeStr;
    }
  };

  /**
   * 勤務時間の表示形式を統一する
   * ISO形式、h付き数値、時:分形式など様々な形式に対応
   */
  const formatWorkTime = (workTimeStr: string): string => {
    if (!workTimeStr) return "-";

    try {
      // 既にHH:MM形式の場合
      const timeMatch = workTimeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        return `${timeMatch[1]}:${timeMatch[2]}`; // そのまま返す
      }

      // ISO形式のタイムスタンプの場合 (例: 1899-12-30T08:30:00.000Z)
      // Excel等で時間だけ入力した場合にこのような形式になることがある
      if (workTimeStr.includes("T") && workTimeStr.includes("Z")) {
        const isoTimeMatch = workTimeStr.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (isoTimeMatch && isoTimeMatch.length === 4) {
          const [_, hours, minutes] = isoTimeMatch;
          // Excel由来の場合、日付部分がずれていることがあるため時間だけ抽出
          return `${parseInt(hours)}:${minutes}`;
        }
      }

      // "8.5h" や "8h" のような形式の場合
      const hourMatch = workTimeStr.match(/^(\d+)(?:\.(\d+))?h?$/);
      if (hourMatch) {
        const hours = parseInt(hourMatch[1]);
        let minutes = 0;
        if (hourMatch[2]) {
          // 小数点以下を60倍して分に変換 (例: 0.5 -> 30分)
          const decimalPart = parseFloat(`0.${hourMatch[2]}`);
          minutes = Math.round(decimalPart * 60);
        }
        return `${hours}:${minutes.toString().padStart(2, "0")}`;
      }

      // 数値（分単位）の場合 - 文字列として渡される可能性も考慮
      const minutesOnly = parseInt(workTimeStr, 10);
      if (!Number.isNaN(minutesOnly) && minutesOnly >= 0) {
        const hours = Math.floor(minutesOnly / 60);
        const minutes = minutesOnly % 60;
        return `${hours}:${minutes.toString().padStart(2, "0")}`;
      }

      // その他の形式の場合は変換できないので元の値を返すか、エラー表示
      return workTimeStr; // または '-' など
    } catch (e) {
      return "-";
    }
  };

  /**
   * 休憩時間の表示フォーマット
   * 数値（分）、文字列（HH:mm）、undefined/null に対応
   */
  const formatBreakTime = (
    breakTime: number | string | undefined | null,
  ): string => {
    // undefinedやnullの場合は空文字を返す
    if (breakTime === undefined || breakTime === null) return "";

    // 0の場合は「0:00」を表示
    if (breakTime === 0 || breakTime === "0" || breakTime === "0:00")
      return "0:00";

    // 既に文字列でHH:mm形式の場合はそのまま返す
    if (typeof breakTime === "string") {
      const timeMatch = breakTime.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        return `${timeMatch[1]}:${timeMatch[2]}`;
      }

      // 文字列だが数値として解釈できる場合は分数として処理
      const numericValue = parseInt(breakTime, 10);
      if (!Number.isNaN(numericValue)) {
        const hours = Math.floor(numericValue / 60);
        const mins = numericValue % 60;
        return `${hours}:${mins.toString().padStart(2, "0")}`;
      }

      // その他の文字列形式は空文字を返す
      return "";
    }

    // 数値の場合は分数からHH:mm形式に変換
    if (typeof breakTime === "number") {
      if (breakTime < 0) return "";
      const hours = Math.floor(breakTime / 60);
      const mins = breakTime % 60;
      return `${hours}:${mins.toString().padStart(2, "0")}`;
    }

    // その他の型の場合は空文字を返す
    return "";
  };

  /**
   * 勤務時間文字列から分数を取得
   * 様々な形式に対応し、計算用に分数に変換
   */
  const getMinutesFromWorkTime = (workTimeStr: string): number => {
    if (!workTimeStr) return 0;

    try {
      // 時:分形式 (例: 8:30)
      const timeMatch = workTimeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch && timeMatch.length === 3) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
          return hours * 60 + minutes;
        }
      }

      // ISO形式のタイムスタンプの場合 (例: 1899-12-30T08:30:00.000Z)
      if (workTimeStr.includes("T") && workTimeStr.includes("Z")) {
        const isoTimeMatch = workTimeStr.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (isoTimeMatch && isoTimeMatch.length === 4) {
          const hours = parseInt(isoTimeMatch[1], 10);
          const minutes = parseInt(isoTimeMatch[2], 10);
          if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
            return hours * 60 + minutes;
          }
        }
      }

      // "8.5h" や "8h" のような形式の場合
      const hourMatch = workTimeStr.match(/^(\d+)(?:\.(\d+))?h?$/);
      if (hourMatch) {
        const hours = parseInt(hourMatch[1], 10);
        let totalMinutes = 0;
        if (!Number.isNaN(hours)) {
          totalMinutes = hours * 60;
          if (hourMatch[2]) {
            const decimalPart = parseFloat(`0.${hourMatch[2]}`);
            if (!Number.isNaN(decimalPart)) {
              totalMinutes += Math.round(decimalPart * 60);
            }
          }
          return totalMinutes;
        }
      }

      // 数値（分単位）の場合 - 文字列として渡される可能性も考慮
      const minutesOnly = parseInt(workTimeStr, 10);
      if (!Number.isNaN(minutesOnly) && minutesOnly >= 0) {
        return minutesOnly;
      }

      // その他の形式では0を返す
      return 0;
    } catch (e) {
      return 0;
    }
  };

  // データリフレッシュ
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } catch (error) {
      // データ更新エラーは無視
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000); // 視覚的フィードバック用
    }
  };

  // 月次データを日付順にソート（複数の日付形式に対応）
  const sortedMonthlyData = [...monthlyData].sort((a, b) => {
    // 日付を正規化してから比較
    const dateA = normalizeDateForDisplay(a.date);
    const dateB = normalizeDateForDisplay(b.date);
    return dateA.localeCompare(dateB);
  });

  // 総勤務時間の計算（修正版 - 分単位で計算後、時:分形式で表示）
  const calculateTotalHours = (): string => {
    const totalMinutes = monthlyData.reduce((total, record) => {
      const minutes = getMinutesFromWorkTime(record.workingTime);
      return total + minutes;
    }, 0);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  return (
    <div className="monthly-content">
      {/* 月選択と更新ボタン */}
      <div className="month-control">
        <div className="month-selector">
          <button
            onClick={goToPreviousMonth}
            className="month-nav-button"
            aria-label="前月"
          >
            ＜
          </button>
          <h2>
            {currentYear}年{currentMonth}月
          </h2>
          <button
            onClick={goToNextMonth}
            className="month-nav-button"
            aria-label="翌月"
          >
            ＞
          </button>
        </div>
        <button
          onClick={handleRefresh}
          className={`refresh-button ${isRefreshing ? "refreshing" : ""}`}
          disabled={isRefreshing || isDataLoading}
          aria-label="データを更新"
        >
          {isRefreshing ? "更新中..." : "更新"}
        </button>
      </div>

      {/* サマリー情報 */}
      <div className="monthly-summary">
        <div>
          勤務日数:{" "}
          <span className="summary-value">{monthlyData.length}日</span>
        </div>
        <div>
          総勤務時間:{" "}
          <span className="summary-value">{calculateTotalHours()}時間</span>
        </div>
      </div>

      {/* テーブル表示 */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-date">日付</th>
              <th className="col-time">出勤</th>
              <th className="col-time">退勤</th>
              <th className="col-break">休憩</th>
              <th className="col-worktime">勤務時間</th>
              <th className="col-location">勤務場所</th>
            </tr>
          </thead>
          <tbody>
            {sortedMonthlyData.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data-message">
                  {isDataLoading
                    ? "データを読み込み中..."
                    : "この月のデータはありません"}
                </td>
              </tr>
            ) : (
              sortedMonthlyData.map((record) => {
                const dayOfWeek = getDayOfWeekName(record.date);
                const dayCssClass = getDayClass(record.date);

                return (
                  <tr key={record.date} className={dayCssClass}>
                    <td className="col-date">
                      {formatDay(record.date)}{" "}
                      <span className="day-of-week">({dayOfWeek})</span>
                    </td>
                    <td className="col-time">{formatTime(record.startTime)}</td>
                    <td className="col-time">{formatTime(record.endTime)}</td>
                    {/* 休憩時間の表示処理 - 型に応じて適切にフォーマット */}
                    <td className="col-break">
                      {formatBreakTime(record.breakTime)}
                    </td>
                    <td className="col-worktime">
                      {formatWorkTime(record.workingTime)}
                    </td>
                    <td className="col-location">{record.location || "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ローディングオーバーレイ */}
      {(isDataLoading || isRefreshing) && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">データを読み込み中...</div>
        </div>
      )}
    </div>
  );
};

export default MonthlyView;
