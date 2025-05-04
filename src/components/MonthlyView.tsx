/**
 * /src/components/MonthlyView.tsx
 * 2025-05-04T12:25+09:00
 * 変更概要: 更新 - 未使用の useEffect インポートと fetchMonthlyData 関数を削除
 */
import React, { useState /*, useEffect */ } from 'react'; // useEffect を削除
import { useKintai } from '../contexts/KintaiContext';
import { getUserName, logout } from '../utils/apiService';

interface MonthlyViewProps {
  onLogout?: () => void;
}

const MonthlyView: React.FC<MonthlyViewProps> = ({ onLogout }) => {
  const {
    monthlyData,
    isDataLoading,
    currentYear,
    currentMonth,
    setCurrentYear,
    setCurrentMonth,
    refreshData
  } = useKintai();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // ユーザー名の取得
  const userName = getUserName();

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
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return '';
      }
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      return days[date.getDay()];
    } catch (e) {
      console.error('曜日取得エラー:', e);
      return '';
    }
  };

  // 曜日に応じたクラス名を取得
  const getDayClass = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return '';
      }
      const day = date.getDay();
      if (day === 0) return 'day-sunday';
      if (day === 6) return 'day-saturday';
      return '';
    } catch (e) {
      return '';
    }
  };

  // 日付表示のフォーマット（例：3日）
  const formatDay = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        // 無効な日付の場合
        const match = dateStr.match(/\d+$/);
        return match ? `${parseInt(match[0])}日` : 'エラー';
      }
      return `${date.getDate()}日`;
    } catch (e) {
      console.error('日付フォーマットエラー:', e);
      return 'エラー';
    }
  };

  // 時刻のフォーマット（例：9:00）
  const formatTime = (timeStr: string): string => {
    try {
      if (!timeStr) return '';
      
      // ISO形式の日付時刻文字列の場合
      if (timeStr.includes('T')) {
        const date = new Date(timeStr);
        if (!isNaN(date.getTime())) {
          return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
      }
      
      // すでにHH:MM形式の場合はそのまま返す
      if (timeStr.match(/^\d{1,2}:\d{2}$/)) {
        return timeStr;
      }
      
      return timeStr;
    } catch (e) {
      return timeStr;
    }
  };

  // データリフレッシュ
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } catch (error) {
      console.error('データ更新エラー:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000); // 視覚的フィードバック用
    }
  };

  // 日次入力画面へ移動
  const goToDailyInput = () => {
    window.location.href = '/';
  };

  // ログアウト処理
  const handleLogout = async () => {
    if (onLogout) {
      await logout();
      onLogout();
    }
  };

  // 月次データを日付順にソート
  const sortedMonthlyData = [...monthlyData].sort((a, b) => {
    return a.date.localeCompare(b.date);
  });

  // 総勤務時間の計算
  const calculateTotalHours = () => {
    return monthlyData.reduce((total, record) => {
      let hours = 0;
      if (record.workingTime) {
        const match = record.workingTime.match(/(\d+(\.\d+)?)/);
        if (match) {
          hours = parseFloat(match[1]);
        }
      }
      return total + (isNaN(hours) ? 0 : hours);
    }, 0).toFixed(1);
  };

  return (
    <div className="monthly-view">
      {/* ヘッダー - 簡素化 */}
      <div className="monthly-header">
        <h1>勤怠管理</h1>
        {userName && (
          <div className="user-info">
            <span className="user-name">{userName}</span>
          </div>
        )}
      </div>
      
      {/* ナビゲーションタブ */}
      <div className="nav-tabs">
        <button className="tab-button" onClick={goToDailyInput}>日次入力</button>
        <button className="tab-button active">月間ビュー</button>
      </div>
      
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
          <h2>{currentYear}年{currentMonth}月</h2>
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
          className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`}
          disabled={isRefreshing || isDataLoading}
          aria-label="データを更新"
        >
          {isRefreshing ? '更新中...' : '更新'}
        </button>
      </div>
      
      {/* サマリー情報 */}
      <div className="monthly-summary">
        <div>勤務日数: <span className="summary-value">{monthlyData.length}日</span></div>
        <div>総勤務時間: <span className="summary-value">{calculateTotalHours()}時間</span></div>
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
            </tr>
          </thead>
          <tbody>
            {sortedMonthlyData.length === 0 ? (
              <tr>
                <td colSpan={4} className="no-data-message">
                  {isDataLoading ? 'データを読み込み中...' : 'この月のデータはありません'}
                </td>
              </tr>
            ) : (
              sortedMonthlyData.map((record) => {
                const dayOfWeek = getDayOfWeekName(record.date);
                const dayCssClass = getDayClass(record.date);
                
                return (
                  <tr key={record.date} className={dayCssClass}>
                    <td className="col-date">
                      {formatDay(record.date)} <span className="day-of-week">({dayOfWeek})</span>
                    </td>
                    <td className="col-time">{formatTime(record.startTime)}</td>
                    <td className="col-time">{formatTime(record.endTime)}</td>
                    <td className="col-break">{formatTime(record.breakTime)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* フッターナビゲーション */}
      <div className="footer-navigation">
        <button 
          className="nav-button"
          onClick={goToDailyInput}
        >
          日次入力へ戻る
        </button>
        <button 
          className="logout-button"
          onClick={handleLogout}
        >
          ログアウト
        </button>
      </div>
      
      {/* ローディングオーバーレイ */}
      {(isDataLoading || isRefreshing) && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">データを読み込み中...</div>
        </div>
      )}
    </div>
  );
};

export default MonthlyView;

// 月間データを取得する関数（現在は未使用）
/* // 未使用のためコメントアウト
const fetchMonthlyData = async (year: number, month: number): Promise<KintaiData[]> => {
  // ここでAPIからデータを取得するロジックを実装
  console.log(`Fetching data for ${year}-${month}`);
  // ダミーデータを返す
  return []; 
};
*/