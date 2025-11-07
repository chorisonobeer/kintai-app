import React, { useState } from "react";
import { login } from "../utils/apiService";

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !password) {
      setError(
        "名前とパスワードを入力してください / Please enter your name and password",
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await login(name, password);

      if (result.success) {
        onLoginSuccess();
      } else {
        -setError(result.error || "ログインに失敗しました");
        +setError(result.error || "ログインに失敗しました / Login failed");
      }
    } catch (err) {
      -setError("通信エラーが発生しました");
      +setError("通信エラーが発生しました / Communication error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="kintai-form">
      - <h2 className="login-title">ログイン</h2>+{" "}
      <h2 className="login-title">ログイン / Login</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">名前 / Name</label>
          <div className="input-wrapper">
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              autoComplete="name"
              className="login-input"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="password">パスワード / Password</label>
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
          <button type="submit" className="btn" disabled={isLoading}>
            - {isLoading ? "ログイン中..." : "ログイン"}+{" "}
            {isLoading ? "ログイン中... / Logging in..." : "ログイン / Login"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;
