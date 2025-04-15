import React, { useState, useEffect } from 'react';
import KintaiForm from './components/KintaiForm';
import Login from './components/Login';
import { isAuthenticated } from './utils/apiService';

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
        <header className="header">
          <h1>勤怠管理</h1>
        </header>
        <div className="kintai-form" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div>読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1>勤怠管理</h1>
      </header>
      {isLoggedIn ? (
        <KintaiForm onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
};

export default App;