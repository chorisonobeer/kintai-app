/** 
 * /src/App.tsx
 * 2025-05-04T23:00+09:00
 * 変更概要: 更新 - onLogout型エラーの修正、コンポーネントの適切なプロパティ設定
 */
/** 
 * /src/App.tsx
 * 2025-05-05T00:10+09:00
 * 変更概要: 修正 - LoginコンポーネントにonLoginSuccessプロパティを追加、未使用のuseStateを削除
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import KintaiForm from './components/KintaiForm';
import Login from './components/Login';
import MonthlyView from './components/MonthlyView';
import { isAuthenticated } from './utils/apiService';
import { KintaiProvider } from './contexts/KintaiContext';

// 認証保護ルート用のラッパーコンポーネント
const ProtectedRoute: React.FC<{ element: React.ReactNode }> = ({ element }) => {
  return isAuthenticated() ? <>{element}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  // ログアウト処理を一元管理
  const handleLogout = () => {
    // ログアウト後の状態管理をここで行うこともできる
    // 既存のlogout関数はapiService内にあるので、ここでは空の関数としておく
  };

  return (
    <div className="container">
      <header className="header">
        <h1>勤怠管理</h1>
      </header>
      
      <BrowserRouter>
        <KintaiProvider>
          <Routes>
            {/* TODO: ログイン成功時の処理を実装する */}
            <Route path="/login" element={<Login onLoginSuccess={() => { /* ログイン成功時の処理 */ }} />} />
            <Route 
              path="/" 
              element={<ProtectedRoute element={<KintaiForm />} />} 
            />
            <Route 
              path="/monthly" 
              element={<ProtectedRoute element={<MonthlyView onLogout={handleLogout} />} />} 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </KintaiProvider>
      </BrowserRouter>
    </div>
  );
};

export default App;