/**
 * /src/App.tsx
 * 2025-05-04T12:20+09:00
 * 変更概要: 更新 - 未使用の getUserName インポートを削除
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import KintaiForm from './components/KintaiForm';
import MonthlyView from './components/MonthlyView';
import Login from './components/Login';
import { isAuthenticated, getUserName } from './utils/apiService';
import { KintaiProvider } from './contexts/KintaiContext';
import './styles_monthly.css';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // アプリ起動時に認証状態を確認
  useEffect(() => {
    // トークンの有無を確認
    const authStatus = isAuthenticated();
    setIsLoggedIn(authStatus);
    setIsLoading(false);
  }, []);

  // ログイン成功時のハンドラー
  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
  };

  // ログアウト時のハンドラー
  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading-center">
          <div>読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* ヘッダーはここで出力しない - 各コンポーネントに任せる */}
      {isLoggedIn ? (
        <KintaiProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<KintaiForm onLogout={handleLogout} />} />
              <Route path="/monthly" element={<MonthlyView onLogout={handleLogout} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </KintaiProvider>
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
};

export default App;