/** 
 * /src/components/Header.tsx
 * 2025-05-05T15:30+09:00
 * 変更概要: 新規追加 - 共通ヘッダーコンポーネント
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getUserName } from '../utils/apiService';

interface HeaderProps {
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLogout }) => {
  const location = useLocation();
  const userName = getUserName();

  return (
    <div className="app-header">
      {/* 1行目：ユーザー名、タイトル、ログアウト */}
      <div className="top-header">
        <div className="user-info">
          <span className="user-name">{userName}</span>
        </div>
        <h1>勤怠管理</h1>
        <button className="logout-button" onClick={onLogout}>ログアウト</button>
      </div>
      
      {/* 2行目：ナビゲーション */}
      <div className="nav-tabs">
        <Link 
          to="/" 
          className={`tab-button ${location.pathname === '/' ? 'active' : ''}`}
        >
          日次入力
        </Link>
        <Link 
          to="/monthly" 
          className={`tab-button ${location.pathname === '/monthly' ? 'active' : ''}`}
        >
          月次ビュー
        </Link>
      </div>
    </div>
  );
};

export default Header;