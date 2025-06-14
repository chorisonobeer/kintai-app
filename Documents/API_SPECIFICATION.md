# 勤怠管理アプリ - API仕様ドキュメント

## 📋 目次

1. [API概要](#api概要)
2. [Google Apps Script API](#google-apps-script-api)
3. [認証・認可](#認証認可)
4. [エンドポイント仕様](#エンドポイント仕様)
5. [データ形式](#データ形式)
6. [エラーハンドリング](#エラーハンドリング)
7. [レート制限・制約事項](#レート制限制約事項)
8. [セキュリティ](#セキュリティ)
9. [監視・ログ](#監視ログ)
10. [バージョニング](#バージョニング)

## API概要

### システム構成

```
┌─────────────────┐    HTTPS    ┌─────────────────┐    Apps Script    ┌─────────────────┐
│                 │   Request   │                 │     Execution     │                 │
│  React Frontend │ ──────────► │ Google Apps     │ ─────────────────► │ Google Sheets   │
│                 │             │ Script (GAS)    │                   │                 │
│                 │ ◄────────── │                 │ ◄───────────────── │                 │
└─────────────────┘   Response  └─────────────────┘      Data I/O      └─────────────────┘
```

### 主要特徴

- **サーバーレス**: Google Apps Scriptによる完全サーバーレス構成
- **リアルタイム同期**: Google Sheetsとの直接連携
- **認証統合**: Google OAuth 2.0による認証
- **スケーラビリティ**: Googleインフラによる自動スケーリング
- **コスト効率**: 従量課金制による低コスト運用

### 技術スタック

- **バックエンド**: Google Apps Script (JavaScript ES6+)
- **データベース**: Google Sheets
- **認証**: Google OAuth 2.0
- **通信プロトコル**: HTTPS
- **データ形式**: JSON

### 環境別エンドポイント

| 環境         | エンドポイント                                        | 説明                           |
| ------------ | ----------------------------------------------------- | ------------------------------ |
| **開発環境** | `/api/gas`                                            | Vite開発サーバーのプロキシ経由 |
| **本番環境** | `/.netlify/functions/kintai-api`                      | Netlify Functions経由          |
| **直接接続** | `https://script.google.com/macros/s/{SCRIPT_ID}/exec` | GAS直接呼び出し（非推奨）      |

## Google Apps Script API

### 基本情報

```typescript
// API基本設定
const API_CONFIG = {
  baseUrl: "https://script.google.com/macros/s/{SCRIPT_ID}/exec",
  version: "v1",
  timeout: 30000, // 30秒
  retryAttempts: 3,
  retryDelay: 1000, // 1秒
} as const;

// リクエストヘッダー
const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
} as const;
```

### APIクライアント実装

```typescript
/**
 * Google Apps Script APIクライアント
 */
class GASApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(scriptId: string) {
    this.baseUrl = `https://script.google.com/macros/s/${scriptId}/exec`;
  }

  /**
   * 認証トークンを設定
   * @param token アクセストークン
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * APIリクエストを実行
   * @param method HTTPメソッド
   * @param action アクション名
   * @param data リクエストデータ
   * @returns レスポンスデータ
   */
  async request<T = any>(
    method: "GET" | "POST",
    action: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    const url =
      method === "GET"
        ? `${this.baseUrl}?action=${action}&${new URLSearchParams(data).toString()}`
        : this.baseUrl;

    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const requestOptions: RequestInit = {
      method,
      headers,
      mode: "cors",
      credentials: "include",
    };

    if (method === "POST") {
      requestOptions.body = JSON.stringify({
        action,
        data: data || {},
      });
    }

    try {
      const response = await this.executeWithRetry(url, requestOptions);
      const result = await response.json();

      if (!response.ok) {
        throw new ApiError(
          result.error?.message || "API request failed",
          response.status,
          result.error?.code
        );
      }

      return result;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        "Network error or unexpected response",
        0,
        "NETWORK_ERROR",
        error
      );
    }
  }

  /**
   * リトライ機能付きリクエスト実行
   * @param url リクエストURL
   * @param options リクエストオプション
   * @returns レスポンス
   */
  private async executeWithRetry(
    url: string,
    options: RequestInit,
    attempt: number = 1
  ): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        API_CONFIG.timeout
      );

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (attempt < API_CONFIG.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, API_CONFIG.retryDelay * attempt)
        );
        return this.executeWithRetry(url, options, attempt + 1);
      }

      throw error;
    }
  }
}

/**
 * APIエラークラス
 */
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * APIレスポンス型
 */
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    version: string;
    requestId: string;
  };
}
```

## 認証・認可

### Google OAuth 2.0 フロー

```typescript
/**
 * Google OAuth 2.0 認証設定
 */
const OAUTH_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  redirectUri: `${window.location.origin}/auth/callback`,
  scope: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ].join(" "),
  responseType: "code",
  accessType: "offline",
  prompt: "consent",
} as const;

/**
 * 認証マネージャー
 */
class AuthManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * 認証URLを生成
   * @returns 認証URL
   */
  generateAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: OAUTH_CONFIG.clientId,
      redirect_uri: OAUTH_CONFIG.redirectUri,
      scope: OAUTH_CONFIG.scope,
      response_type: OAUTH_CONFIG.responseType,
      access_type: OAUTH_CONFIG.accessType,
      prompt: OAUTH_CONFIG.prompt,
      state: this.generateState(),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * 認証コードからトークンを取得
   * @param code 認証コード
   * @returns トークン情報
   */
  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: OAUTH_CONFIG.clientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: OAUTH_CONFIG.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to exchange code for tokens");
    }

    const tokens = await response.json();

    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    // トークンをローカルストレージに保存
    this.saveTokens(tokens);

    return tokens;
  }

  /**
   * トークンを更新
   * @returns 新しいトークン情報
   */
  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: OAUTH_CONFIG.clientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh access token");
    }

    const tokens = await response.json();

    this.accessToken = tokens.access_token;
    this.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    // 新しいリフレッシュトークンがある場合は更新
    if (tokens.refresh_token) {
      this.refreshToken = tokens.refresh_token;
    }

    this.saveTokens(tokens);

    return tokens;
  }

  /**
   * 有効なアクセストークンを取得
   * @returns アクセストークン
   */
  async getValidAccessToken(): Promise<string> {
    if (!this.accessToken || !this.tokenExpiry) {
      throw new Error("No access token available");
    }

    // トークンの有効期限をチェック（5分前にリフレッシュ）
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (this.tokenExpiry <= fiveMinutesFromNow) {
      await this.refreshAccessToken();
    }

    return this.accessToken!;
  }

  /**
   * 認証状態をチェック
   * @returns 認証済みフラグ
   */
  isAuthenticated(): boolean {
    return !!(
      this.accessToken &&
      this.tokenExpiry &&
      this.tokenExpiry > new Date()
    );
  }

  /**
   * ログアウト
   */
  logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;

    // ローカルストレージからトークンを削除
    localStorage.removeItem("auth_tokens");
  }

  /**
   * トークンを保存
   * @param tokens トークン情報
   */
  private saveTokens(tokens: TokenResponse): void {
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || this.refreshToken,
      expires_at: this.tokenExpiry?.toISOString(),
    };

    localStorage.setItem("auth_tokens", JSON.stringify(tokenData));
  }

  /**
   * 保存されたトークンを読み込み
   */
  loadSavedTokens(): void {
    const saved = localStorage.getItem("auth_tokens");
    if (saved) {
      try {
        const tokenData = JSON.parse(saved);
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;
        this.tokenExpiry = tokenData.expires_at
          ? new Date(tokenData.expires_at)
          : null;
      } catch (error) {
        console.error("Failed to load saved tokens:", error);
        this.logout();
      }
    }
  }

  /**
   * ランダムな状態文字列を生成
   * @returns 状態文字列
   */
  private generateState(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}

/**
 * トークンレスポンス型
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}
```

### 認証フロー

```typescript
// 1. ログイン
POST /api/gas
{
  "action": "login",
  "payload": {
    "name": "ユーザー名",
    "password": "パスワード"
  },
  "debug": true
}

// 2. レスポンス
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "user123",
  "userName": "山田太郎",
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "version": "v2025-01-27-001"
}
```

### トークン管理

```typescript
// ローカルストレージキー
const TOKEN_KEY = "kintai_token";
const USER_ID_KEY = "kintai_user_id";
const USER_NAME_KEY = "kintai_user_name";
const SHEET_ID_KEY = "kintai_spreadsheet_id";

// 認証状態チェック
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem(TOKEN_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);
  const userName = localStorage.getItem(USER_NAME_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);

  return (
    token !== null &&
    userId !== null &&
    userName !== null &&
    spreadsheetId !== null
  );
};
```

### セッション管理

- **トークン有効期限**: 24時間（GAS側で管理）
- **自動ログアウト**: トークン期限切れ時
- **セッション継続**: ページリロード時の自動認証チェック

## 📡 API エンドポイント

### 共通リクエスト形式

```typescript
interface ApiRequest {
  action: string; // API アクション名
  payload: object; // リクエストデータ
  token?: string; // 認証トークン（認証が必要な場合）
  debug?: boolean; // デバッグモード
}
```

### 共通レスポンス形式

```typescript
// 成功レスポンス
interface ApiSuccess<T = unknown> {
  success: true;
  ok?: true;
  data?: T;
  token?: string;
  userId?: string;
  userName?: string;
  spreadsheetId?: string;
  version?: string;
  debug?: unknown;
}

// エラーレスポンス
interface ApiError {
  success: false;
  ok?: false;
  error?: string;
  err?: string;
  version?: string;
  debug?: unknown;
}
```

### 1. 認証API

#### ログイン

```http
POST /api/gas
Content-Type: text/plain

{
  "action": "login",
  "payload": {
    "name": "string",
    "password": "string"
  },
  "debug": true
}
```

**レスポンス:**

```json
{
  "success": true,
  "token": "string",
  "userId": "string",
  "userName": "string",
  "spreadsheetId": "string",
  "version": "string"
}
```

#### ログアウト

```http
POST /api/gas
Content-Type: text/plain

{
  "action": "logout",
  "payload": {},
  "token": "string",
  "debug": true
}
```

**レスポンス:**

```json
{
  "success": true
}
```

### 2. 勤怠データAPI

#### 勤怠データ保存

```http
POST /api/gas
Content-Type: text/plain

{
  "action": "saveKintai",
  "payload": {
    "date": "2025-01-27",
    "startTime": "09:00",
    "breakTime": "01:00",
    "endTime": "18:00",
    "location": "オフィス",
    "spreadsheetId": "string",
    "userId": "string"
  },
  "token": "string",
  "debug": true
}
```

**レスポンス:**

```json
{
  "success": true
}
```

#### 月間データ取得

```http
POST /api/gas
Content-Type: text/plain

{
  "action": "getMonthlyData",
  "payload": {
    "spreadsheetId": "string",
    "userId": "string",
    "year": 2025,
    "month": 1
  },
  "token": "string",
  "debug": true
}
```

**レスポンス:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-01-27",
      "startTime": "2025-01-27T09:00:00.000Z",
      "breakTime": "01:00",
      "endTime": "2025-01-27T18:00:00.000Z",
      "location": "オフィス",
      "workingTime": "08:00"
    }
  ]
}
```

#### 履歴データ取得

```http
POST /api/gas
Content-Type: text/plain

{
  "action": "getHistory",
  "payload": {
    "spreadsheetId": "string",
    "userId": "string",
    "year": 2025,
    "month": 1
  },
  "token": "string",
  "debug": true
}
```

**レスポンス:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-01-27",
      "startTime": "2025-01-27T09:00:00.000Z",
      "breakTime": "01:00",
      "endTime": "2025-01-27T18:00:00.000Z",
      "location": "オフィス",
      "workingTime": "08:00"
    }
  ]
}
```

### 3. バージョン管理API

#### バージョン情報取得

```http
POST /api/gas
Content-Type: text/plain

{
  "action": "getVersion",
  "payload": {},
  "debug": true
}
```

**レスポンス:**

```json
{
  "success": true,
  "data": {
    "version": "v2025-01-27-001",
    "timestamp": "2025-01-27T10:30:00.000Z",
    "description": "勤怠管理システム v1.0.0"
  }
}
```

#### バージョン履歴取得

```http
POST /api/gas
Content-Type: text/plain

{
  "action": "getVersionHistory",
  "payload": {},
  "debug": true
}
```

**レスポンス:**

```json
{
  "success": true,
  "data": [
    {
      "version": "v2025-01-27-001",
      "date": "2025-01-27",
      "description": "初回リリース"
    }
  ]
}
```

## 🔄 データ型定義

### TypeScript型定義

```typescript
// 勤怠データ（フロントエンド）
export interface KintaiData {
  date: string; // YYYY-MM-DD形式
  startTime: string; // HH:mm形式
  breakTime: string; // HH:mm形式
  endTime: string; // HH:mm形式
  location?: string; // 勤務場所
  workingTime?: string; // 計算された勤務時間（HH:mm形式）
}

// 勤怠レコード（サーバーレスポンス）
export interface KintaiRecord {
  date: string; // YYYY-MM-DD形式
  startTime: string | Date; // ISO文字列またはDateオブジェクト
  breakTime: string; // HH:mm形式
  endTime: string | Date; // ISO文字列またはDateオブジェクト
  location?: string; // 勤務場所
  workingTime?: string; // 計算された勤務時間
}

// バージョン情報
export interface VersionInfo {
  version: string;
  timestamp: string;
  description: string;
}

// バージョン履歴項目
export interface VersionHistoryItem {
  version: string;
  date: string;
  description: string;
}
```

### 時間形式の変換

```typescript
// ISO文字列からHH:mm形式への変換
function extractHHMM(timeValue: string | Date | undefined): string {
  if (
    !timeValue ||
    (typeof timeValue === "string" && timeValue.trim() === "")
  ) {
    return "";
  }

  try {
    const date = new Date(timeValue);
    const hours = date.getUTCHours().toString().padStart(2, "0");
    const minutes = date.getUTCMinutes().toString().padStart(2, "0");

    if (
      Number.isNaN(parseInt(hours, 10)) ||
      Number.isNaN(parseInt(minutes, 10))
    ) {
      if (typeof timeValue === "string") {
        const match = timeValue.match(/(\d{2}):(\d{2})/);
        if (match && match.length > 2) return `${match[1]}:${match[2]}`;
      }
      return "";
    }

    return `${hours}:${minutes}`;
  } catch (e) {
    return "";
  }
}
```

## ⚡ パフォーマンス最適化

### リクエスト重複防止

```typescript
// リクエスト重複防止のためのキャッシュ
const pendingRequests = new Map<string, Promise<ApiOk<any>>>();

async function callGAS<T = unknown>(
  action: string,
  payload: object = {},
  withToken = false
): Promise<ApiOk<T>> {
  // リクエストの重複チェック用キー
  const requestKey = `${action}-${JSON.stringify(payload)}-${withToken}`;

  // 同じリクエストが進行中の場合は待機
  if (pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey)!;
  }

  // リクエスト実行とキャッシュ管理
  const requestPromise = executeRequest<T>(action, payload, withToken);
  pendingRequests.set(requestKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    pendingRequests.delete(requestKey);
  }
}
```

### タイムアウト・リトライ機能

```typescript
// タイムアウト付きfetch
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 10000
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    fetch(url, { ...options, signal: controller.signal })
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

// リトライ付きfetch
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  timeout = 10000
): Promise<Response> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 5000); // 指数バックオフ
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
```

### データキャッシュ

```typescript
// 月間データキャッシュ
const MONTHLY_DATA_KEY = "kintai_monthly_data";
const MONTHLY_DATA_TIMESTAMP_KEY = "kintai_monthly_data_timestamp";
const CACHE_DURATION = 30 * 60 * 1000; // 30分

// キャッシュから月間データを取得
function getMonthlyDataFromCache(cacheKey: string): KintaiRecord[] | null {
  try {
    const cachedDataJson = sessionStorage.getItem(MONTHLY_DATA_KEY);
    if (!cachedDataJson) return null;

    const cachedDataMap = JSON.parse(cachedDataJson);
    const cachedData = cachedDataMap[cacheKey];
    if (!cachedData) return null;

    // キャッシュ期限チェック
    const timestamp = parseInt(
      sessionStorage.getItem(`${MONTHLY_DATA_TIMESTAMP_KEY}_${cacheKey}`) ||
        "0",
      10
    );
    const now = Date.now();
    const cacheAge = now - timestamp;

    if (cacheAge > CACHE_DURATION) {
      return null; // キャッシュ期限切れ
    }

    return cachedData;
  } catch (e) {
    return null;
  }
}

// キャッシュに月間データを保存
function saveMonthlyDataToCache(cacheKey: string, data: KintaiRecord[]): void {
  try {
    const cachedDataJson = sessionStorage.getItem(MONTHLY_DATA_KEY);
    const cachedDataMap = cachedDataJson ? JSON.parse(cachedDataJson) : {};

    cachedDataMap[cacheKey] = data;

    sessionStorage.setItem(MONTHLY_DATA_KEY, JSON.stringify(cachedDataMap));
    sessionStorage.setItem(
      `${MONTHLY_DATA_TIMESTAMP_KEY}_${cacheKey}`,
      Date.now().toString()
    );
  } catch (e) {
    // キャッシュ保存エラーは無視
  }
}
```

## ❌ エラーハンドリング

### HTTPステータスコード

| ステータス | 説明             | 対応                       |
| ---------- | ---------------- | -------------------------- |
| **200**    | 成功             | 正常処理                   |
| **400**    | リクエストエラー | バリデーションエラー表示   |
| **401**    | 認証エラー       | ログイン画面へリダイレクト |
| **403**    | 権限エラー       | エラーメッセージ表示       |
| **429**    | レート制限       | リトライ待機               |
| **500**    | サーバーエラー   | エラーメッセージ表示       |
| **503**    | サービス利用不可 | リトライ実行               |

### カスタムエラーコード

```typescript
enum ApiErrorCode {
  // 認証関連
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",

  // データ関連
  VALIDATION_ERROR = "VALIDATION_ERROR",
  DATA_NOT_FOUND = "DATA_NOT_FOUND",
  DATA_CONFLICT = "DATA_CONFLICT",

  // システム関連
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
}
```

### エラーレスポンス例

```json
{
  "success": false,
  "error": "認証に失敗しました",
  "code": "INVALID_CREDENTIALS",
  "details": {
    "field": "password",
    "message": "パスワードが正しくありません"
  },
  "version": "v2025-01-27-001"
}
```

### エラー処理戦略

```typescript
// エラー処理の統一化
const handleApiError = (
  error: Error
): {
  shouldRetry: boolean;
  userMessage: string;
  logLevel: "info" | "warn" | "error";
} => {
  if (error.message.includes("timeout")) {
    return {
      shouldRetry: true,
      userMessage: "タイムアウトが発生しました。再試行してください。",
      logLevel: "warn",
    };
  }

  if (error.message.includes("Network")) {
    return {
      shouldRetry: true,
      userMessage: "ネットワークエラーが発生しました。",
      logLevel: "warn",
    };
  }

  if (error.message.includes("認証")) {
    return {
      shouldRetry: false,
      userMessage: "ログインが必要です。",
      logLevel: "info",
    };
  }

  return {
    shouldRetry: false,
    userMessage: "システムエラーが発生しました。",
    logLevel: "error",
  };
};
```

## 🔒 セキュリティ

### CORS設定

```javascript
// Google Apps Script側のCORS設定
function doPost(e) {
  // CORS ヘッダーの設定
  const response = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };

  // プリフライトリクエストの処理
  if (e.parameter.method === "OPTIONS") {
    return ContentService.createTextOutput("")
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(response);
  }

  // 実際のリクエスト処理
  const result = processRequest(e);

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(response);
}
```

### データ暗号化

```typescript
// 機密データの暗号化（実装例）
const encryptSensitiveData = (data: string): string => {
  // 実際のプロジェクトでは適切な暗号化ライブラリを使用
  return btoa(data); // Base64エンコード（例）
};

const decryptSensitiveData = (encryptedData: string): string => {
  return atob(encryptedData); // Base64デコード（例）
};
```

### レート制限

```typescript
// クライアント側レート制限
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindow: number;

  constructor(maxRequests = 60, timeWindowMs = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  canMakeRequest(): boolean {
    const now = Date.now();

    // 時間窓外のリクエストを削除
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.timeWindow
    );

    return this.requests.length < this.maxRequests;
  }

  recordRequest(): void {
    this.requests.push(Date.now());
  }
}

const rateLimiter = new RateLimiter();
```

## 📊 監視・ログ

### デバッグモード

```typescript
// デバッグ情報の収集
const DEBUG_MODE = import.meta.env.DEV;

const logApiCall = (action: string, payload: object, response: any) => {
  if (DEBUG_MODE) {
    console.group(`🔗 API Call: ${action}`);
    console.log("📤 Request:", payload);
    console.log("📥 Response:", response);
    console.log("⏱️ Timestamp:", new Date().toISOString());
    console.groupEnd();
  }
};
```

### パフォーマンス監視

```typescript
// API呼び出し時間の測定
const measureApiPerformance = async <T>(
  apiCall: () => Promise<T>,
  actionName: string
): Promise<T> => {
  const startTime = performance.now();

  try {
    const result = await apiCall();
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`⚡ ${actionName}: ${duration.toFixed(2)}ms`);

    // パフォーマンス閾値チェック
    if (duration > 5000) {
      console.warn(
        `🐌 Slow API call detected: ${actionName} took ${duration.toFixed(2)}ms`
      );
    }

    return result;
  } catch (error) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    console.error(
      `❌ ${actionName} failed after ${duration.toFixed(2)}ms:`,
      error
    );
    throw error;
  }
};
```

## 🔄 バージョン管理

### バージョン互換性チェック

```typescript
// バージョン互換性の確認
export const checkVersionCompatibility = (): {
  compatible: boolean;
  message?: string;
} => {
  const serverVersion = getServerVersion();
  const clientVersion = getClientVersion();

  if (!serverVersion) {
    return { compatible: true };
  }

  const serverMajor = parseInt(serverVersion.split("-")[0].replace("v", ""));
  const clientMajor = parseInt(clientVersion.split(".")[0]);

  if (Math.abs(serverMajor - clientMajor * 10) > 5) {
    return {
      compatible: false,
      message: `バージョンの互換性に問題があります。サーバー: ${serverVersion}, クライアント: ${clientVersion}`,
    };
  }

  return { compatible: true };
};
```

### API変更履歴

| バージョン          | 日付       | 変更内容               |
| ------------------- | ---------- | ---------------------- |
| **v2025-01-27-001** | 2025-01-27 | 初回リリース           |
| **v2025-01-27-002** | 2025-01-27 | 勤務場所フィールド追加 |
| **v2025-01-27-003** | 2025-01-27 | バージョン管理API追加  |

---

**最終更新**: 2025-01-27  
**バージョン**: 1.0.0  
**関連ドキュメント**:

- [システム概要](./SYSTEM_OVERVIEW.md)
- [データ管理](./DATA_MANAGEMENT.md)
- [ビジネスロジック](./BUSINESS_LOGIC.md)
