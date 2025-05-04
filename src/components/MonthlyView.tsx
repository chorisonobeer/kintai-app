/** 
 * /src/components/MonthlyView.tsx
 * 2025-05-04T16:30+09:00
 * 変更概要: 更新 - 勤務時間表示の正規化(時:分形式)、総勤務時間計算の修正、複数データ形式対応の強化
 */
import React, { useState } from 'react';
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
      // 複数の日付形式に対応
      const formattedDate = normalizeDateForDisplay(dateStr);
      const date = new Date(formattedDate);
      
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
      // 複数の日付形式に対応
      const formattedDate = normalizeDateForDisplay(dateStr);
      const date = new Date(formattedDate);
      
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
      // 複数の日付形式に対応
      const formattedDate = normalizeDateForDisplay(dateStr);
      const date = new Date(formattedDate);
      
      if (isNaN(date.getTime())) {
        // 無効な日付の場合、直接文字列から日を抽出
        const match = dateStr.match(/(\d+)(?:\/|-|年)(\d+)(?:\/|-|月)(\d+)(?:日)?/);
        return match ? `${parseInt(match[3])}日` : 'エラー';
      }
      return `${date.getDate()}日`;
    } catch (e) {
      console.error('日付フォーマットエラー:', e, dateStr);
      return 'エラー';
    }
  };

  /**
   * 複数の日付形式を統一して処理する関数
   * YYYY/MM/DD、YYYY-MM-DD、YYYY年MM月DD日 などの形式に対応
   */
  const normalizeDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    
    // すでにYYYY-MM-DD形式の場合はそのまま返す
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // YYYY/MM/DD形式の場合はYYYY-MM-DD形式に変換
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // 日本語形式（YYYY年MM月DD日）の場合はYYYY-MM-DD形式に変換
    const jpMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (jpMatch) {
      const [_, year, month, day] = jpMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // その他の形式の場合はDateオブジェクトを使って変換
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
    } catch (e) {
      console.error('日付変換エラー:', e);
    }
    
    // 変換に失敗した場合は元の文字列を返す
    return dateStr;
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

  /**
   * 勤務時間の表示形式を統一する
   * ISO形式、h付き数値、時:分形式など様々な形式に対応
   */
  const formatWorkTime = (workTimeStr: string): string => {
    if (!workTimeStr) return '-';
    
    try {
      // 既に時:分形式の場合
      if (/^\d{1,2}:\d{2}$/.test(workTimeStr)) {
        return workTimeStr;
      }
      
      // ISO形式のタイムスタンプの場合 (1899-12-29T22:57:00.000Z)
      if (workTimeStr.includes('1899-12-') && workTimeStr.includes('T')) {
        const timeMatch = workTimeStr.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          const [_, hours, minutes] = timeMatch;
          return `${parseInt(hours)}:${minutes}`;
        }
      }
      
      // "12.8h"のような形式の場合
      const hourMatch = workTimeStr.match(/^(\d+)\.?(\d*)h?$/);
      if (hourMatch) {
        const hours = parseInt(hourMatch[1]);
        let minutes = 0;
        
        // 小数部分があれば分に変換
        if (hourMatch[2]) {
          // 小数点以下を60倍して分に変換
          minutes = Math.round(parseFloat(`0.${hourMatch[2]}`) * 60);
        }
        
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
      }
      
      // その他の形式の場合は変換できないので元の値を返す
      return workTimeStr;
    } catch (e) {
      console.error('勤務時間フォーマットエラー:', e, workTimeStr);
      return '-';
    }
  };

  /**
   * 勤務時間文字列から分数を取得
   * 様々な形式に対応し、計算用に分数に変換
   */
  const getMinutesFromWorkTime = (workTimeStr: string): number => {
    if (!workTimeStr) return 0;
    
    try {
      // 時:分形式 (8:30) の場合
      const timeMatch = workTimeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        return hours * 60 + minutes;
      }
      
      // ISO形式のタイムスタンプの場合 (1899-12-29T22:57:00.000Z)
      if (workTimeStr.includes('1899-12-') && workTimeStr.includes('T')) {
        const timeMatch = workTimeStr.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          const [_, hours, minutes] = timeMatch;
          return parseInt(hours) * 60 + parseInt(minutes);
        }
      }
      
      // "12.8h"のような形式の場合
      const hourMatch = workTimeStr.match(/^(\d+)\.?(\d*)h?$/);
      if (hourMatch) {
        const hours = parseInt(hourMatch[1]);
        let minutes = 0;
        
        // 小数部分があれば分に変換
        if (hourMatch[2]) {
          // 小数点以下を60倍して分に変換
          minutes = Math.round(parseFloat(`0.${hourMatch[2]}`) * 60);
        }
        
        return hours * 60 + minutes;
      }
      
      // その他の形式では0を返す
      return 0;
    } catch (e) {
      console.error('勤務時間計算エラー:', e, workTimeStr);
      return 0;
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
    
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
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
              <th className="col-worktime">勤務時間</th>
              <th className="col-location">勤務場所</th>
            </tr>
          </thead>
          <tbody>
            {sortedMonthlyData.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data-message">
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
                    <td className="col-worktime">{formatWorkTime(record.workingTime)}</td>
                    <td className="col-location">{record.location || '-'}</td>
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