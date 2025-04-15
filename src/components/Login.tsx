import React, { useState } from 'react';
import { login } from '../utils/apiService';

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await login(email, password);
      
      if (result.success) {
        onLoginSuccess();
      } else {
        setError(result.error || 'ログインに失敗しました');
      }
    } catch (err) {
      setError('通信エラーが発生しました');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="kintai-form">
      <h2 className="login-title">ログイン</h2>
      
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">メールアドレス</label>
          <div className="input-wrapper">
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
              className="login-input"
            />
          </div>
        </div>
        
        <div className="form-group">
          <label htmlFor="password">パスワード</label>
          <div className="input-wrapper">
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              className="login-input"
            />
          </div>
        </div>
        
        <div className="button-container">
          <button 
            type="submit" 
            className="btn"
            disabled={isLoading}
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;