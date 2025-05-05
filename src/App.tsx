/** 
 * /src/App.tsx
 * 2025-05-05T15:30+09:00
 * 変更概要: 更新 - 共通ヘッダーコンポーネントの追加、レイアウト統一
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import KintaiForm from './components/KintaiForm';
import Login from './components/Login';
import MonthlyView from './components/MonthlyView';
import Header from './components/Header';
import { isAuthenticated, logout } from './utils/apiService';
import { KintaiProvider } from './contexts/KintaiContext';

// 認証保護ルート用のラッパーコンポーネント
const ProtectedRoute: React.FC<{ element: React.ReactNode }> = ({ element }) => {
  return isAuthenticated() ? <>{element}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  // ログアウト処理を一元管理
  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className="container">
      <BrowserRouter>
        <KintaiProvider>
          <Routes>
            {/* ログイン画面 - ヘッダーなし */}
            <Route path="/login" element={<Login onLoginSuccess={() => window.location.href = '/'} />} />
            
            {/* 認証保護されたルート - ヘッダーあり */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute
                  element={
                    <>
                      <Header onLogout={handleLogout} />
                      <KintaiForm />
                    </>
                  }
                />
              } 
            />
            <Route 
              path="/monthly" 
              element={
                <ProtectedRoute
                  element={
                    <>
                      <Header onLogout={handleLogout} />
                      <MonthlyView />
                    </>
                  }
                />
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </KintaiProvider>
      </BrowserRouter>
    </div>
  );
};

export default App;