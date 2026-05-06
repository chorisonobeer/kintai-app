import React, { useState } from "react";
import styled, { keyframes } from "styled-components";
import { login } from "../utils/apiService";

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        setError(result.error || "ログインに失敗しました / Login failed");
      }
    } catch (err) {
      setError("通信エラーが発生しました / Communication error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Page>
      <Card>
        <Brand>
          <BrandIcon viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7Z"
            />
          </BrandIcon>
          <BrandTitle>勤怠管理</BrandTitle>
          <BrandSubtitle>Sign in to your account</BrandSubtitle>
        </Brand>

        <Form onSubmit={handleSubmit} noValidate>
          {error && (
            <ErrorBox role="alert">
              <ErrorIcon viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2 1 21h22Zm0 6 7.5 13h-15Zm-1 4v4h2v-4Zm0 6v2h2v-2Z"
                />
              </ErrorIcon>
              <span>{error}</span>
            </ErrorBox>
          )}

          <Field>
            <FieldLabel htmlFor="name">名前 / Name</FieldLabel>
            <InputWrapper>
              <FieldIcon viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5Z"
                />
              </FieldIcon>
              <Input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                autoComplete="name"
                placeholder="山田 太郎"
              />
            </InputWrapper>
          </Field>

          <Field>
            <FieldLabel htmlFor="password">パスワード / Password</FieldLabel>
            <InputWrapper>
              <FieldIcon viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-9-2a3 3 0 0 1 6 0v2H9Z"
                />
              </FieldIcon>
              <Input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <ToggleButton
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? "パスワードを隠す" : "パスワードを表示"
                }
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      fill="currentColor"
                      d="M2 5.3 3.3 4 20 20.7 18.7 22l-3-3a12 12 0 0 1-3.7.6c-5.5 0-9.5-4-11-7.6a11.6 11.6 0 0 1 3.5-4.5Zm10 11.7a4 4 0 0 0 4-4 4 4 0 0 0-.4-1.7l-1.5 1.5a2 2 0 0 1-2.4 2.4l-1.5 1.5A4 4 0 0 0 12 17ZM23 12c-1.5 3.7-5.5 7.6-11 7.6h-.4l2.1-2.1A5.6 5.6 0 0 0 17 12a5 5 0 0 0-5-5 5.6 5.6 0 0 0-3.5 1.3L7 6.8A12 12 0 0 1 12 6c5.5 0 9.5 4 11 6Z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      fill="currentColor"
                      d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 7.6 17 4.5 12 4.5Zm0 12.5a5 5 0 1 1 5-5 5 5 0 0 1-5 5Zm0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z"
                    />
                  </svg>
                )}
              </ToggleButton>
            </InputWrapper>
          </Field>

          <SubmitButton type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Spinner />
                <span>Signing in...</span>
              </>
            ) : (
              <span>ログイン / Sign in</span>
            )}
          </SubmitButton>
        </Form>

        <Footer>勤怠管理アプリ &middot; v12</Footer>
      </Card>
    </Page>
  );
};

export default Login;

/* ──────────────────────────────────────────────
   Styled components
   ────────────────────────────────────────────── */

const Page = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
    "Yu Gothic UI", sans-serif;
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Card = styled.div`
  width: 100%;
  max-width: 400px;
  background: #ffffff;
  border-radius: 16px;
  padding: 40px 32px 28px;
  box-shadow:
    0 20px 60px rgba(15, 23, 42, 0.25),
    0 4px 14px rgba(15, 23, 42, 0.1);
  animation: ${fadeIn} 0.35s ease-out;
`;

const Brand = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28px;
`;

const BrandIcon = styled.svg`
  width: 44px;
  height: 44px;
  color: #4f46e5;
  margin-bottom: 12px;
`;

const BrandTitle = styled.h1`
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
`;

const BrandSubtitle = styled.p`
  margin: 0;
  font-size: 13px;
  color: #64748b;
  letter-spacing: 0.02em;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: #334155;
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const FieldIcon = styled.svg`
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  color: #94a3b8;
  pointer-events: none;
`;

const Input = styled.input`
  width: 100%;
  height: 44px;
  padding: 0 40px 0 40px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 15px;
  color: #0f172a;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    box-shadow 0.15s;
  -webkit-appearance: none;
  appearance: none;

  &::placeholder {
    color: #cbd5e1;
  }

  &:focus {
    outline: none;
    background: #ffffff;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ToggleButton = styled.button`
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 6px;
  transition:
    color 0.15s,
    background-color 0.15s;

  &:hover {
    color: #475569;
    background: rgba(15, 23, 42, 0.05);
  }
`;

const SubmitButton = styled.button`
  margin-top: 8px;
  width: 100%;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
  transition:
    transform 0.08s,
    box-shadow 0.15s,
    opacity 0.15s;

  &:hover:not(:disabled) {
    box-shadow: 0 8px 22px rgba(79, 70, 229, 0.45);
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Spinner = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
`;

const ErrorBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-left: 3px solid #ef4444;
  border-radius: 8px;
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.4;
`;

const ErrorIcon = styled.svg`
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin-top: 1px;
`;

const Footer = styled.p`
  margin: 24px 0 0;
  text-align: center;
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 0.04em;
`;
