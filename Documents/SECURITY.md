# 勤怠管理アプリ - セキュリティドキュメント

## 📋 目次

1. [セキュリティ概要](#セキュリティ概要)
2. [認証・認可](#認証認可)
3. [データ保護](#データ保護)
4. [通信セキュリティ](#通信セキュリティ)
5. [入力検証・サニタイゼーション](#入力検証サニタイゼーション)
6. [アクセス制御](#アクセス制御)
7. [監査・ログ](#監査ログ)
8. [脆弱性対策](#脆弱性対策)
9. [GDPR・プライバシー対応](#gdprプライバシー対応)
10. [インシデント対応](#インシデント対応)
11. [セキュリティ監査](#セキュリティ監査)
12. [セキュリティ設定](#セキュリティ設定)

## セキュリティ概要

### セキュリティ方針

勤怠管理アプリは、従業員の個人情報と勤務データを扱うため、以下のセキュリティ原則に基づいて設計・運用されています。

#### 基本原則

- **最小権限の原則**: ユーザーには必要最小限の権限のみを付与
- **多層防御**: 複数のセキュリティ層による包括的な保護
- **ゼロトラスト**: すべてのアクセスを検証・認証
- **データ最小化**: 必要最小限のデータのみを収集・保存
- **透明性**: セキュリティ対策とプライバシー保護の透明性確保

#### セキュリティ目標

```typescript
/**
 * セキュリティ目標定義
 */
const SECURITY_OBJECTIVES = {
  // CIA Triad
  confidentiality: {
    description: "機密性 - 認可されたユーザーのみがデータにアクセス可能",
    measures: ["暗号化による保護", "アクセス制御", "認証・認可メカニズム"],
  },

  integrity: {
    description: "完全性 - データの正確性と一貫性を保証",
    measures: ["デジタル署名", "ハッシュ検証", "バージョン管理", "監査ログ"],
  },

  availability: {
    description: "可用性 - 必要な時にシステムが利用可能",
    measures: ["冗長化", "バックアップ", "DDoS対策", "監視・アラート"],
  },

  // 追加目標
  accountability: {
    description: "説明責任 - すべての操作が追跡可能",
    measures: ["包括的な監査ログ", "ユーザー行動追跡", "変更履歴管理"],
  },

  privacy: {
    description: "プライバシー - 個人情報の適切な保護",
    measures: [
      "データ匿名化",
      "同意管理",
      "データ削除権",
      "プライバシーバイデザイン",
    ],
  },
} as const;
```

### 脅威モデル

```typescript
/**
 * 脅威分析
 */
interface ThreatModel {
  category: string;
  threats: Array<{
    name: string;
    description: string;
    likelihood: "Low" | "Medium" | "High";
    impact: "Low" | "Medium" | "High";
    risk: "Low" | "Medium" | "High" | "Critical";
    mitigations: string[];
  }>;
}

const THREAT_MODEL: ThreatModel[] = [
  {
    category: "認証・認可",
    threats: [
      {
        name: "不正ログイン",
        description: "認証情報の漏洩や総当たり攻撃による不正アクセス",
        likelihood: "Medium",
        impact: "High",
        risk: "High",
        mitigations: [
          "Google OAuth 2.0による強固な認証",
          "MFA（多要素認証）の実装",
          "アカウントロックアウト機能",
          "ログイン試行の監視",
        ],
      },
      {
        name: "権限昇格",
        description: "一般ユーザーが管理者権限を不正取得",
        likelihood: "Low",
        impact: "High",
        risk: "Medium",
        mitigations: [
          "ロールベースアクセス制御（RBAC）",
          "最小権限の原則",
          "権限変更の監査ログ",
          "定期的な権限レビュー",
        ],
      },
    ],
  },
  {
    category: "データ保護",
    threats: [
      {
        name: "データ漏洩",
        description: "個人情報や勤務データの外部流出",
        likelihood: "Medium",
        impact: "Critical",
        risk: "Critical",
        mitigations: [
          "データ暗号化（保存時・転送時）",
          "アクセス制御",
          "データ分類・ラベリング",
          "DLP（データ損失防止）対策",
        ],
      },
      {
        name: "データ改ざん",
        description: "勤務記録の不正な変更や削除",
        likelihood: "Low",
        impact: "High",
        risk: "Medium",
        mitigations: [
          "デジタル署名",
          "変更履歴の記録",
          "バックアップとリストア",
          "整合性チェック",
        ],
      },
    ],
  },
  {
    category: "アプリケーション",
    threats: [
      {
        name: "XSS攻撃",
        description: "悪意のあるスクリプトの実行",
        likelihood: "Medium",
        impact: "Medium",
        risk: "Medium",
        mitigations: [
          "入力値のサニタイゼーション",
          "CSP（Content Security Policy）",
          "HTTPOnly Cookieの使用",
          "出力エスケープ",
        ],
      },
      {
        name: "CSRF攻撃",
        description: "クロスサイトリクエストフォージェリ",
        likelihood: "Medium",
        impact: "Medium",
        risk: "Medium",
        mitigations: [
          "CSRFトークンの実装",
          "SameSite Cookieの使用",
          "Referrerヘッダーの検証",
          "カスタムヘッダーの要求",
        ],
      },
    ],
  },
];
```

## 認証・認可

### Google OAuth 2.0 認証

```typescript
/**
 * 認証セキュリティ設定
 */
const AUTH_SECURITY_CONFIG = {
  // OAuth 2.0設定
  oauth: {
    // PKCE（Proof Key for Code Exchange）を使用
    usePKCE: true,
    // 状態パラメータによるCSRF対策
    useStateParameter: true,
    // ノンスによるリプレイ攻撃対策
    useNonce: true,
    // セキュアなリダイレクトURI
    allowedRedirectUris: [
      "https://your-app-domain.com/auth/callback",
      "https://your-app-domain.netlify.app/auth/callback",
    ],
  },

  // トークン管理
  tokens: {
    // アクセストークンの有効期限
    accessTokenExpiry: 3600, // 1時間
    // リフレッシュトークンの有効期限
    refreshTokenExpiry: 2592000, // 30日
    // トークンローテーション
    rotateRefreshTokens: true,
    // セキュアストレージ
    secureStorage: true,
  },

  // セッション管理
  session: {
    // セッションタイムアウト
    timeout: 28800, // 8時間
    // アイドルタイムアウト
    idleTimeout: 1800, // 30分
    // セッション固定攻撃対策
    regenerateSessionId: true,
    // セキュアCookie設定
    secureCookies: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    },
  },
} as const;

/**
 * セキュアな認証実装
 */
class SecureAuthManager {
  private codeVerifier: string | null = null;
  private state: string | null = null;
  private nonce: string | null = null;

  /**
   * PKCE対応の認証URL生成
   * @returns 認証URL
   */
  async generateSecureAuthUrl(): Promise<string> {
    // PKCE code verifierを生成
    this.codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);

    // 状態パラメータを生成（CSRF対策）
    this.state = this.generateSecureRandom(32);

    // ノンスを生成（リプレイ攻撃対策）
    this.nonce = this.generateSecureRandom(32);

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: AUTH_SECURITY_CONFIG.oauth.allowedRedirectUris[0],
      scope:
        "openid email profile https://www.googleapis.com/auth/spreadsheets",
      response_type: "code",
      state: this.state,
      nonce: this.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    // 状態をセキュアに保存
    this.securelyStoreAuthState({
      state: this.state,
      nonce: this.nonce,
      codeVerifier: this.codeVerifier,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * 認証コールバックの検証
   * @param code 認証コード
   * @param state 状態パラメータ
   * @returns トークン情報
   */
  async handleAuthCallback(
    code: string,
    state: string
  ): Promise<TokenResponse> {
    // 状態パラメータの検証（CSRF対策）
    const storedState = this.getStoredAuthState();
    if (!storedState || storedState.state !== state) {
      throw new SecurityError("Invalid state parameter", "CSRF_PROTECTION");
    }

    // 認証コードをトークンに交換
    const tokens = await this.exchangeCodeForTokens(
      code,
      storedState.codeVerifier
    );

    // IDトークンの検証
    await this.validateIdToken(tokens.id_token, storedState.nonce);

    // セキュアにトークンを保存
    await this.securelyStoreTokens(tokens);

    // 認証状態をクリア
    this.clearAuthState();

    return tokens;
  }

  /**
   * IDトークンの検証
   * @param idToken IDトークン
   * @param expectedNonce 期待されるノンス
   */
  private async validateIdToken(
    idToken: string,
    expectedNonce: string
  ): Promise<void> {
    try {
      // JWTの署名検証
      const payload = await this.verifyJwtSignature(idToken);

      // 基本的なクレームの検証
      if (payload.iss !== "https://accounts.google.com") {
        throw new SecurityError("Invalid issuer", "TOKEN_VALIDATION");
      }

      if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
        throw new SecurityError("Invalid audience", "TOKEN_VALIDATION");
      }

      if (payload.exp < Date.now() / 1000) {
        throw new SecurityError("Token expired", "TOKEN_VALIDATION");
      }

      if (payload.nonce !== expectedNonce) {
        throw new SecurityError("Invalid nonce", "TOKEN_VALIDATION");
      }
    } catch (error) {
      throw new SecurityError(
        "ID token validation failed",
        "TOKEN_VALIDATION",
        error
      );
    }
  }

  /**
   * セキュアなランダム文字列生成
   * @param length 長さ
   * @returns ランダム文字列
   */
  private generateSecureRandom(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  /**
   * PKCE code verifier生成
   * @returns code verifier
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  /**
   * PKCE code challenge生成
   * @param verifier code verifier
   * @returns code challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(
      String.fromCharCode.apply(null, Array.from(new Uint8Array(digest)))
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }
}

/**
 * セキュリティエラークラス
 */
class SecurityError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: any
  ) {
    super(message);
    this.name = "SecurityError";
  }
}
```

### 多要素認証（MFA）

```typescript
/**
 * 多要素認証実装
 */
class MFAManager {
  /**
   * TOTP（Time-based One-Time Password）の生成
   * @param secret 共有秘密鍵
   * @returns TOTP
   */
  generateTOTP(secret: string): string {
    const time = Math.floor(Date.now() / 1000 / 30); // 30秒間隔
    const hmac = this.hmacSHA1(secret, time);
    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
      (((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)) %
      1000000;

    return code.toString().padStart(6, "0");
  }

  /**
   * TOTPの検証
   * @param token 入力されたトークン
   * @param secret 共有秘密鍵
   * @param window 時間窓（デフォルト1 = ±30秒）
   * @returns 検証結果
   */
  verifyTOTP(token: string, secret: string, window: number = 1): boolean {
    const currentTime = Math.floor(Date.now() / 1000 / 30);

    for (let i = -window; i <= window; i++) {
      const time = currentTime + i;
      const expectedToken = this.generateTOTPForTime(secret, time);
      if (token === expectedToken) {
        return true;
      }
    }

    return false;
  }

  /**
   * バックアップコードの生成
   * @returns バックアップコード配列
   */
  generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = this.generateSecureRandom(8);
      codes.push(code);
    }
    return codes;
  }
}
```

## データ保護

### 暗号化

```typescript
/**
 * データ暗号化管理
 */
class EncryptionManager {
  private readonly algorithm = "AES-GCM";
  private readonly keyLength = 256;

  /**
   * データを暗号化
   * @param data 平文データ
   * @param key 暗号化キー
   * @returns 暗号化されたデータ
   */
  async encrypt(data: string, key: CryptoKey): Promise<EncryptedData> {
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(data);

    // ランダムなIVを生成
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // データを暗号化
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv,
      },
      key,
      plaintext
    );

    return {
      ciphertext: new Uint8Array(ciphertext),
      iv: iv,
      algorithm: this.algorithm,
    };
  }

  /**
   * データを復号化
   * @param encryptedData 暗号化されたデータ
   * @param key 復号化キー
   * @returns 平文データ
   */
  async decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: encryptedData.algorithm,
        iv: encryptedData.iv,
      },
      key,
      encryptedData.ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  }

  /**
   * 暗号化キーを生成
   * @returns 暗号化キー
   */
  async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      true, // extractable
      ["encrypt", "decrypt"]
    );
  }

  /**
   * パスワードベースのキー導出
   * @param password パスワード
   * @param salt ソルト
   * @returns 導出されたキー
   */
  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // PBKDF2でキーを導出
    const baseKey = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000, // 10万回
        hash: "SHA-256",
      },
      baseKey,
      {
        name: this.algorithm,
        length: this.keyLength,
      },
      false,
      ["encrypt", "decrypt"]
    );
  }
}

/**
 * 暗号化データの型定義
 */
interface EncryptedData {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  algorithm: string;
}
```

### 個人情報保護

```typescript
/**
 * 個人情報保護管理
 */
class PIIProtectionManager {
  private readonly sensitiveFields = [
    "name",
    "email",
    "phone",
    "address",
    "employeeId",
  ];

  /**
   * 個人情報をマスク
   * @param data データオブジェクト
   * @returns マスクされたデータ
   */
  maskPII(data: Record<string, any>): Record<string, any> {
    const masked = { ...data };

    for (const field of this.sensitiveFields) {
      if (masked[field]) {
        masked[field] = this.maskValue(masked[field], field);
      }
    }

    return masked;
  }

  /**
   * 値をマスク
   * @param value 元の値
   * @param fieldType フィールドタイプ
   * @returns マスクされた値
   */
  private maskValue(value: string, fieldType: string): string {
    switch (fieldType) {
      case "email":
        const [local, domain] = value.split("@");
        return `${local.charAt(0)}***@${domain}`;

      case "phone":
        return value.replace(/.(?=.{4})/g, "*");

      case "name":
        return value.charAt(0) + "*".repeat(value.length - 1);

      default:
        return "*".repeat(value.length);
    }
  }

  /**
   * データ匿名化
   * @param data データオブジェクト
   * @returns 匿名化されたデータ
   */
  anonymizeData(data: Record<string, any>): Record<string, any> {
    const anonymized = { ...data };

    // 直接識別子を削除
    delete anonymized.name;
    delete anonymized.email;
    delete anonymized.employeeId;

    // 準識別子を一般化
    if (anonymized.birthDate) {
      anonymized.birthYear = new Date(anonymized.birthDate).getFullYear();
      delete anonymized.birthDate;
    }

    if (anonymized.address) {
      // 住所を市区町村レベルまで一般化
      anonymized.city = this.extractCity(anonymized.address);
      delete anonymized.address;
    }

    return anonymized;
  }

  /**
   * データ仮名化
   * @param data データオブジェクト
   * @param key 仮名化キー
   * @returns 仮名化されたデータ
   */
  async pseudonymizeData(
    data: Record<string, any>,
    key: string
  ): Promise<Record<string, any>> {
    const pseudonymized = { ...data };

    for (const field of this.sensitiveFields) {
      if (pseudonymized[field]) {
        pseudonymized[field] = await this.generatePseudonym(
          pseudonymized[field],
          key
        );
      }
    }

    return pseudonymized;
  }

  /**
   * 仮名を生成
   * @param value 元の値
   * @param key 仮名化キー
   * @returns 仮名
   */
  private async generatePseudonym(value: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value + key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
  }
}
```

## 通信セキュリティ

### HTTPS/TLS設定

```typescript
/**
 * TLS/SSL設定
 */
const TLS_CONFIG = {
  // 最小TLSバージョン
  minVersion: "TLSv1.2",

  // 推奨暗号スイート
  cipherSuites: [
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
  ],

  // HSTS設定
  hsts: {
    maxAge: 31536000, // 1年
    includeSubDomains: true,
    preload: true,
  },

  // 証明書ピニング
  certificatePinning: {
    enabled: true,
    pins: [
      "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    ],
  },
} as const;

/**
 * セキュアHTTPクライアント
 */
class SecureHttpClient {
  private readonly defaultHeaders = {
    "Strict-Transport-Security": `max-age=${TLS_CONFIG.hsts.maxAge}; includeSubDomains; preload`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  /**
   * セキュアなHTTPリクエスト
   * @param url リクエストURL
   * @param options リクエストオプション
   * @returns レスポンス
   */
  async secureRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    // HTTPSの強制
    if (!url.startsWith("https://")) {
      throw new SecurityError("HTTPS required", "INSECURE_PROTOCOL");
    }

    // セキュリティヘッダーを追加
    const secureOptions: RequestInit = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
      // 認証情報の送信を制限
      credentials: "same-origin",
      // リダイレクトの制限
      redirect: "error",
    };

    try {
      const response = await fetch(url, secureOptions);

      // レスポンスのセキュリティ検証
      await this.validateResponse(response);

      return response;
    } catch (error) {
      throw new SecurityError("Secure request failed", "REQUEST_FAILED", error);
    }
  }

  /**
   * レスポンスのセキュリティ検証
   * @param response HTTPレスポンス
   */
  private async validateResponse(response: Response): Promise<void> {
    // Content-Typeの検証
    const contentType = response.headers.get("Content-Type");
    if (contentType && !this.isAllowedContentType(contentType)) {
      throw new SecurityError(
        "Invalid content type",
        "CONTENT_TYPE_VALIDATION"
      );
    }

    // CSPヘッダーの検証
    const csp = response.headers.get("Content-Security-Policy");
    if (!csp) {
      console.warn("Missing Content-Security-Policy header");
    }

    // X-Frame-Optionsの検証
    const frameOptions = response.headers.get("X-Frame-Options");
    if (!frameOptions || frameOptions.toLowerCase() !== "deny") {
      console.warn("Missing or weak X-Frame-Options header");
    }
  }

  /**
   * 許可されたContent-Typeかチェック
   * @param contentType Content-Type
   * @returns 許可フラグ
   */
  private isAllowedContentType(contentType: string): boolean {
    const allowedTypes = [
      "application/json",
      "text/html",
      "text/css",
      "application/javascript",
      "image/png",
      "image/jpeg",
      "image/svg+xml",
    ];

    return allowedTypes.some((type) => contentType.startsWith(type));
  }
}
```

### Content Security Policy (CSP)

```typescript
/**
 * CSP設定
 */
const CSP_CONFIG = {
  // 基本ポリシー
  "default-src": ["'self'"],

  // スクリプトソース
  "script-src": [
    "'self'",
    "'unsafe-inline'", // 開発時のみ、本番では削除
    "https://apis.google.com",
    "https://accounts.google.com",
  ],

  // スタイルソース
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],

  // 画像ソース
  "img-src": ["'self'", "data:", "https:"],

  // フォントソース
  "font-src": ["'self'", "https://fonts.gstatic.com"],

  // 接続先
  "connect-src": [
    "'self'",
    "https://script.google.com",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
  ],

  // フレームソース
  "frame-src": ["https://accounts.google.com"],

  // オブジェクトソース
  "object-src": ["'none'"],

  // ベースURI
  "base-uri": ["'self'"],

  // フォーム送信先
  "form-action": ["'self'"],

  // フレーム祖先
  "frame-ancestors": ["'none'"],

  // アップグレード非セキュア要求
  "upgrade-insecure-requests": true,

  // ブロック時の報告先
  "report-uri": "/api/csp-report",
} as const;

/**
 * CSPヘッダー生成
 * @returns CSPヘッダー文字列
 */
function generateCSPHeader(): string {
  const directives: string[] = [];

  for (const [directive, sources] of Object.entries(CSP_CONFIG)) {
    if (directive === "upgrade-insecure-requests") {
      if (sources) {
        directives.push("upgrade-insecure-requests");
      }
    } else if (Array.isArray(sources)) {
      directives.push(`${directive} ${sources.join(" ")}`);
    } else {
      directives.push(`${directive} ${sources}`);
    }
  }

  return directives.join("; ");
}
```

## 入力検証・サニタイゼーション

```typescript
/**
 * 入力検証・サニタイゼーション
 */
class InputValidator {
  private readonly patterns = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    time: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
    employeeId: /^[A-Z0-9]{6,10}$/,
    name: /^[\p{L}\p{M}\s'-]{1,50}$/u,
  };

  private readonly maxLengths = {
    name: 50,
    email: 100,
    notes: 500,
    workLocation: 100,
  };

  /**
   * 入力値を検証
   * @param field フィールド名
   * @param value 入力値
   * @returns 検証結果
   */
  validate(field: string, value: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      sanitizedValue: value,
    };

    // null/undefined チェック
    if (value == null) {
      result.isValid = false;
      result.errors.push("Value is required");
      return result;
    }

    // 文字列の場合
    if (typeof value === "string") {
      // 長さチェック
      const maxLength = this.maxLengths[field as keyof typeof this.maxLengths];
      if (maxLength && value.length > maxLength) {
        result.isValid = false;
        result.errors.push(`Value exceeds maximum length of ${maxLength}`);
      }

      // パターンマッチング
      const pattern = this.patterns[field as keyof typeof this.patterns];
      if (pattern && !pattern.test(value)) {
        result.isValid = false;
        result.errors.push(`Invalid format for ${field}`);
      }

      // サニタイゼーション
      result.sanitizedValue = this.sanitizeString(value);
    }

    // 数値の場合
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        result.isValid = false;
        result.errors.push("Value must be a finite number");
      }

      // 範囲チェック
      if (field === "breakTime" && (value < 0 || value > 480)) {
        // 8時間まで
        result.isValid = false;
        result.errors.push("Break time must be between 0 and 480 minutes");
      }
    }

    return result;
  }

  /**
   * 文字列をサニタイズ
   * @param input 入力文字列
   * @returns サニタイズ済み文字列
   */
  private sanitizeString(input: string): string {
    return (
      input
        // HTMLエンティティエスケープ
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;")
        // 制御文字を削除
        .replace(/[\x00-\x1F\x7F]/g, "")
        // 先頭・末尾の空白を削除
        .trim()
    );
  }

  /**
   * SQLインジェクション対策
   * @param input 入力文字列
   * @returns エスケープ済み文字列
   */
  escapeSql(input: string): string {
    return input.replace(/'/g, "''");
  }

  /**
   * XSS対策
   * @param input 入力文字列
   * @returns エスケープ済み文字列
   */
  escapeHtml(input: string): string {
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML;
  }
}

/**
 * 検証結果の型定義
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue: any;
}
```

## アクセス制御

```typescript
/**
 * ロールベースアクセス制御（RBAC）
 */
class AccessControlManager {
  private readonly roles = {
    user: {
      permissions: [
        "kintai:read:own",
        "kintai:create:own",
        "kintai:update:own",
        "profile:read:own",
        "profile:update:own",
      ],
    },
    manager: {
      permissions: [
        "kintai:read:team",
        "kintai:approve:team",
        "report:read:team",
        "user:read:team",
      ],
      inherits: ["user"],
    },
    admin: {
      permissions: ["kintai:*", "user:*", "system:*", "audit:*"],
      inherits: ["manager"],
    },
    readonly: {
      permissions: ["kintai:read:own", "profile:read:own"],
    },
  };

  /**
   * 権限をチェック
   * @param user ユーザー情報
   * @param resource リソース
   * @param action アクション
   * @param context コンテキスト
   * @returns 許可フラグ
   */
  checkPermission(
    user: { id: string; role: string },
    resource: string,
    action: string,
    context?: { ownerId?: string; teamId?: string }
  ): boolean {
    const userPermissions = this.getUserPermissions(user.role);

    // 完全一致チェック
    const exactPermission = `${resource}:${action}`;
    if (userPermissions.includes(exactPermission)) {
      return true;
    }

    // ワイルドカードチェック
    const wildcardPermission = `${resource}:*`;
    if (userPermissions.includes(wildcardPermission)) {
      return true;
    }

    // スコープ付き権限チェック
    const ownPermission = `${resource}:${action}:own`;
    if (
      userPermissions.includes(ownPermission) &&
      context?.ownerId === user.id
    ) {
      return true;
    }

    const teamPermission = `${resource}:${action}:team`;
    if (
      userPermissions.includes(teamPermission) &&
      this.isInSameTeam(user.id, context?.ownerId)
    ) {
      return true;
    }

    return false;
  }

  /**
   * ユーザーの全権限を取得
   * @param role ユーザーロール
   * @returns 権限配列
   */
  private getUserPermissions(role: string): string[] {
    const roleConfig = this.roles[role as keyof typeof this.roles];
    if (!roleConfig) {
      return [];
    }

    let permissions = [...roleConfig.permissions];

    // 継承されたロールの権限を追加
    if (roleConfig.inherits) {
      for (const inheritedRole of roleConfig.inherits) {
        permissions = permissions.concat(
          this.getUserPermissions(inheritedRole)
        );
      }
    }

    return [...new Set(permissions)]; // 重複を除去
  }

  /**
   * 同じチームかチェック
   * @param userId1 ユーザーID1
   * @param userId2 ユーザーID2
   * @returns 同じチームフラグ
   */
  private isInSameTeam(userId1?: string, userId2?: string): boolean {
    if (!userId1 || !userId2) {
      return false;
    }

    // 実際の実装では、ユーザーのチーム情報を取得して比較
    // ここでは簡略化
    return true;
  }
}

/**
 * 属性ベースアクセス制御（ABAC）
 */
class AttributeBasedAccessControl {
  /**
   * ポリシーを評価
   * @param subject 主体（ユーザー）
   * @param resource リソース
   * @param action アクション
   * @param environment 環境
   * @returns 許可フラグ
   */
  evaluatePolicy(
    subject: Record<string, any>,
    resource: Record<string, any>,
    action: string,
    environment: Record<string, any>
  ): boolean {
    // 時間ベースの制御
    if (!this.checkTimeConstraints(environment.currentTime)) {
      return false;
    }

    // 場所ベースの制御
    if (!this.checkLocationConstraints(environment.clientIP)) {
      return false;
    }

    // データ分類ベースの制御
    if (!this.checkDataClassification(subject, resource)) {
      return false;
    }

    // リスクベースの制御
    if (!this.checkRiskLevel(subject, action, environment)) {
      return false;
    }

    return true;
  }

  /**
   * 時間制約をチェック
   * @param currentTime 現在時刻
   * @returns 許可フラグ
   */
  private checkTimeConstraints(currentTime: Date): boolean {
    const hour = currentTime.getHours();
    const day = currentTime.getDay();

    // 営業時間内（平日9-18時）のみ許可
    if (day >= 1 && day <= 5 && hour >= 9 && hour < 18) {
      return true;
    }

    return false;
  }

  /**
   * 場所制約をチェック
   * @param clientIP クライアントIP
   * @returns 許可フラグ
   */
  private checkLocationConstraints(clientIP: string): boolean {
    // 許可されたIPレンジ
    const allowedRanges = ["192.168.1.0/24", "10.0.0.0/8"];

    return allowedRanges.some((range) => this.isIPInRange(clientIP, range));
  }

  /**
   * IPが範囲内かチェック
   * @param ip IPアドレス
   * @param range IP範囲（CIDR記法）
   * @returns 範囲内フラグ
   */
  private isIPInRange(ip: string, range: string): boolean {
    // 簡略化された実装
    // 実際の実装では、適切なIPアドレス計算を行う
    return true;
  }
}
```

## 監査・ログ

```typescript
/**
 * セキュリティ監査ログ
 */
class SecurityAuditLogger {
  private readonly logLevels = {
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    CRITICAL: "critical",
  } as const;

  /**
   * セキュリティイベントをログ
   * @param event セキュリティイベント
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    const logEntry: SecurityLogEntry = {
      timestamp: new Date().toISOString(),
      eventId: this.generateEventId(),
      eventType: event.type,
      severity: event.severity,
      userId: event.userId,
      sessionId: event.sessionId,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      resource: event.resource,
      action: event.action,
      result: event.result,
      details: event.details,
      riskScore: this.calculateRiskScore(event),
    };

    // ログを永続化
    await this.persistLog(logEntry);

    // 重要度に応じてアラート
    if (event.severity === "critical" || event.severity === "high") {
      await this.sendSecurityAlert(logEntry);
    }

    // 異常検知
    await this.detectAnomalies(logEntry);
  }

  /**
   * ログイン試行をログ
   * @param attempt ログイン試行情報
   */
  async logLoginAttempt(attempt: LoginAttempt): Promise<void> {
    await this.logSecurityEvent({
      type: "authentication",
      severity: attempt.success ? "info" : "warn",
      userId: attempt.userId,
      sessionId: attempt.sessionId,
      ipAddress: attempt.ipAddress,
      userAgent: attempt.userAgent,
      resource: "auth",
      action: "login",
      result: attempt.success ? "success" : "failure",
      details: {
        method: attempt.method,
        failureReason: attempt.failureReason,
      },
    });
  }

  /**
   * データアクセスをログ
   * @param access データアクセス情報
   */
  async logDataAccess(access: DataAccess): Promise<void> {
    await this.logSecurityEvent({
      type: "data_access",
      severity: "info",
      userId: access.userId,
      sessionId: access.sessionId,
      ipAddress: access.ipAddress,
      userAgent: access.userAgent,
      resource: access.resource,
      action: access.action,
      result: "success",
      details: {
        recordCount: access.recordCount,
        dataClassification: access.dataClassification,
      },
    });
  }

  /**
   * 権限違反をログ
   * @param violation 権限違反情報
   */
  async logPermissionViolation(violation: PermissionViolation): Promise<void> {
    await this.logSecurityEvent({
      type: "authorization",
      severity: "high",
      userId: violation.userId,
      sessionId: violation.sessionId,
      ipAddress: violation.ipAddress,
      userAgent: violation.userAgent,
      resource: violation.resource,
      action: violation.action,
      result: "denied",
      details: {
        requiredPermission: violation.requiredPermission,
        userPermissions: violation.userPermissions,
      },
    });
  }

  /**
   * リスクスコアを計算
   * @param event セキュリティイベント
   * @returns リスクスコア（0-100）
   */
  private calculateRiskScore(event: SecurityEvent): number {
    let score = 0;

    // 重要度による基本スコア
    switch (event.severity) {
      case "critical":
        score += 80;
        break;
      case "high":
        score += 60;
        break;
      case "medium":
        score += 40;
        break;
      case "low":
        score += 20;
        break;
      default:
        score += 10;
    }

    // イベントタイプによる調整
    switch (event.type) {
      case "authentication":
        if (event.result === "failure") score += 20;
        break;
      case "authorization":
        if (event.result === "denied") score += 30;
        break;
      case "data_access":
        if (event.details?.dataClassification === "sensitive") score += 15;
        break;
    }

    // 時間帯による調整（営業時間外は+10）
    const hour = new Date().getHours();
    if (hour < 9 || hour > 18) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * 異常検知
   * @param logEntry ログエントリ
   */
  private async detectAnomalies(logEntry: SecurityLogEntry): Promise<void> {
    // 短時間での大量ログイン失敗
    if (
      logEntry.eventType === "authentication" &&
      logEntry.result === "failure"
    ) {
      const recentFailures = await this.getRecentLoginFailures(
        logEntry.userId,
        300
      ); // 5分間
      if (recentFailures >= 5) {
        await this.sendSecurityAlert({
          ...logEntry,
          severity: "critical",
          details: {
            ...logEntry.details,
            anomaly: "Multiple login failures detected",
            failureCount: recentFailures,
          },
        });
      }
    }

    // 異常な時間帯でのアクセス
    const hour = new Date().getHours();
    if ((hour < 6 || hour > 22) && logEntry.eventType === "data_access") {
      await this.sendSecurityAlert({
        ...logEntry,
        severity: "medium",
        details: {
          ...logEntry.details,
          anomaly: "Unusual access time detected",
        },
      });
    }
  }

  /**
   * イベントIDを生成
   * @returns イベントID
   */
  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * セキュリティイベントの型定義
 */
interface SecurityEvent {
  type:
    | "authentication"
    | "authorization"
    | "data_access"
    | "system"
    | "privacy";
  severity: "info" | "low" | "medium" | "high" | "critical";
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  result?: "success" | "failure" | "denied";
  details?: Record<string, any>;
}

interface SecurityLogEntry extends SecurityEvent {
  timestamp: string;
  eventId: string;
  eventType: string;
  riskScore: number;
}
```

## GDPR・プライバシー対応

```typescript
/**
 * GDPR対応管理
 */
class GDPRComplianceManager {
  /**
   * 同意管理
   * @param userId ユーザーID
   * @param consentType 同意タイプ
   * @param granted 同意フラグ
   */
  async recordConsent(
    userId: string,
    consentType: ConsentType,
    granted: boolean
  ): Promise<void> {
    const consentRecord: ConsentRecord = {
      userId,
      consentType,
      granted,
      timestamp: new Date().toISOString(),
      ipAddress: this.getCurrentIP(),
      userAgent: navigator.userAgent,
      version: "1.0",
    };

    await this.storeConsentRecord(consentRecord);
  }

  /**
   * データポータビリティ（データエクスポート）
   * @param userId ユーザーID
   * @returns ユーザーデータ
   */
  async exportUserData(userId: string): Promise<UserDataExport> {
    const userData = await this.collectUserData(userId);

    return {
      exportDate: new Date().toISOString(),
      userId,
      personalData: {
        profile: userData.profile,
        preferences: userData.preferences,
        kintaiRecords: userData.kintaiRecords,
      },
      metadata: {
        dataRetentionPeriod: "7 years",
        lastUpdated: userData.lastUpdated,
        dataClassification: "personal",
      },
    };
  }

  /**
   * 忘れられる権利（データ削除）
   * @param userId ユーザーID
   * @param reason 削除理由
   */
  async deleteUserData(userId: string, reason: string): Promise<void> {
    // 法的保持義務のチェック
    const retentionCheck = await this.checkLegalRetention(userId);
    if (retentionCheck.mustRetain) {
      throw new Error(`Cannot delete data: ${retentionCheck.reason}`);
    }

    // データ削除の実行
    await this.performDataDeletion(userId);

    // 削除ログの記録
    await this.logDataDeletion(userId, reason);
  }

  /**
   * データ修正権
   * @param userId ユーザーID
   * @param corrections 修正データ
   */
  async correctUserData(
    userId: string,
    corrections: Record<string, any>
  ): Promise<void> {
    // 修正前データのバックアップ
    const originalData = await this.backupUserData(userId);

    // データの修正
    await this.updateUserData(userId, corrections);

    // 修正ログの記録
    await this.logDataCorrection(userId, originalData, corrections);
  }

  /**
   * データ処理の制限
   * @param userId ユーザーID
   * @param restriction 制限タイプ
   */
  async restrictDataProcessing(
    userId: string,
    restriction: ProcessingRestriction
  ): Promise<void> {
    await this.updateProcessingRestrictions(userId, restriction);
    await this.logProcessingRestriction(userId, restriction);
  }
}

/**
 * 同意タイプ
 */
type ConsentType =
  | "data_processing"
  | "marketing"
  | "analytics"
  | "cookies"
  | "third_party_sharing";

/**
 * 同意記録
 */
interface ConsentRecord {
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  version: string;
}

/**
 * ユーザーデータエクスポート
 */
interface UserDataExport {
  exportDate: string;
  userId: string;
  personalData: {
    profile: any;
    preferences: any;
    kintaiRecords: any[];
  };
  metadata: {
    dataRetentionPeriod: string;
    lastUpdated: string;
    dataClassification: string;
  };
}
```

## インシデント対応

```typescript
/**
 * セキュリティインシデント対応
 */
class IncidentResponseManager {
  private readonly severityLevels = {
    P1: { name: "Critical", responseTime: 15, escalationTime: 30 }, // 分
    P2: { name: "High", responseTime: 60, escalationTime: 120 },
    P3: { name: "Medium", responseTime: 240, escalationTime: 480 },
    P4: { name: "Low", responseTime: 1440, escalationTime: 2880 },
  } as const;

  /**
   * インシデントを報告
   * @param incident インシデント情報
   */
  async reportIncident(incident: SecurityIncident): Promise<string> {
    const incidentId = this.generateIncidentId();

    const incidentRecord: IncidentRecord = {
      id: incidentId,
      ...incident,
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          timestamp: new Date().toISOString(),
          action: "incident_reported",
          description: "Incident reported and assigned ID",
          actor: incident.reportedBy,
        },
      ],
    };

    // インシデントを記録
    await this.storeIncident(incidentRecord);

    // 自動対応の実行
    await this.executeAutomaticResponse(incidentRecord);

    // 通知の送信
    await this.notifyIncidentTeam(incidentRecord);

    return incidentId;
  }

  /**
   * 自動対応の実行
   * @param incident インシデント記録
   */
  private async executeAutomaticResponse(
    incident: IncidentRecord
  ): Promise<void> {
    switch (incident.type) {
      case "brute_force_attack":
        await this.blockSuspiciousIP(incident.sourceIP);
        await this.lockUserAccount(incident.targetUser);
        break;

      case "data_breach":
        await this.isolateAffectedSystems(incident.affectedSystems);
        await this.enableEmergencyLogging();
        break;

      case "malware_detected":
        await this.quarantineAffectedFiles(incident.affectedFiles);
        await this.scanRelatedSystems();
        break;

      case "unauthorized_access":
        await this.revokeUserSessions(incident.targetUser);
        await this.requirePasswordReset(incident.targetUser);
        break;
    }
  }
}

/**
 * インシデント情報の型定義
 */
interface SecurityIncident {
  type:
    | "brute_force_attack"
    | "data_breach"
    | "malware_detected"
    | "unauthorized_access"
    | "system_compromise";
  severity: "P1" | "P2" | "P3" | "P4";
  description: string;
  reportedBy: string;
  sourceIP?: string;
  targetUser?: string;
  affectedSystems?: string[];
  affectedFiles?: string[];
  evidence?: string[];
}

interface IncidentRecord extends SecurityIncident {
  id: string;
  status: "open" | "investigating" | "contained" | "resolved" | "closed";
  createdAt: string;
  updatedAt: string;
  timeline: IncidentTimelineEntry[];
}

interface IncidentTimelineEntry {
  timestamp: string;
  action: string;
  description: string;
  actor: string;
}
```

## セキュリティ監査

### 定期監査

```typescript
/**
 * セキュリティ監査管理
 */
class SecurityAuditManager {
  /**
   * 包括的セキュリティ監査を実行
   * @returns 監査結果
   */
  async performComprehensiveAudit(): Promise<AuditReport> {
    const auditResults: AuditResult[] = [];

    // 認証・認可の監査
    auditResults.push(await this.auditAuthentication());
    auditResults.push(await this.auditAuthorization());

    // データ保護の監査
    auditResults.push(await this.auditDataProtection());
    auditResults.push(await this.auditEncryption());

    // アクセス制御の監査
    auditResults.push(await this.auditAccessControls());

    // ログ・監視の監査
    auditResults.push(await this.auditLogging());

    // 脆弱性の監査
    auditResults.push(await this.auditVulnerabilities());

    // コンプライアンスの監査
    auditResults.push(await this.auditCompliance());

    return this.generateAuditReport(auditResults);
  }

  /**
   * 認証システムの監査
   * @returns 監査結果
   */
  private async auditAuthentication(): Promise<AuditResult> {
    const findings: AuditFinding[] = [];

    // パスワードポリシーのチェック
    const passwordPolicy = await this.checkPasswordPolicy();
    if (!passwordPolicy.isCompliant) {
      findings.push({
        severity: "medium",
        category: "authentication",
        description: "Password policy does not meet security requirements",
        recommendation: "Implement stronger password requirements",
      });
    }

    // MFAの実装状況
    const mfaStatus = await this.checkMFAImplementation();
    if (!mfaStatus.isEnabled) {
      findings.push({
        severity: "high",
        category: "authentication",
        description: "Multi-factor authentication is not enabled",
        recommendation: "Implement MFA for all user accounts",
      });
    }

    // セッション管理
    const sessionSecurity = await this.checkSessionSecurity();
    if (!sessionSecurity.isSecure) {
      findings.push({
        severity: "medium",
        category: "authentication",
        description: "Session management has security weaknesses",
        recommendation: "Implement secure session management practices",
      });
    }

    return {
      category: "Authentication",
      status: findings.length === 0 ? "pass" : "fail",
      findings,
      score: this.calculateScore(findings),
    };
  }

  /**
   * データ保護の監査
   * @returns 監査結果
   */
  private async auditDataProtection(): Promise<AuditResult> {
    const findings: AuditFinding[] = [];

    // 暗号化の実装
    const encryptionStatus = await this.checkEncryptionImplementation();
    if (!encryptionStatus.isProperlyImplemented) {
      findings.push({
        severity: "critical",
        category: "data_protection",
        description: "Data encryption is not properly implemented",
        recommendation: "Implement end-to-end encryption for sensitive data",
      });
    }

    // データ分類
    const dataClassification = await this.checkDataClassification();
    if (!dataClassification.isImplemented) {
      findings.push({
        severity: "medium",
        category: "data_protection",
        description: "Data classification system is not implemented",
        recommendation: "Implement data classification and labeling",
      });
    }

    // バックアップセキュリティ
    const backupSecurity = await this.checkBackupSecurity();
    if (!backupSecurity.isSecure) {
      findings.push({
        severity: "high",
        category: "data_protection",
        description: "Backup data is not properly secured",
        recommendation:
          "Implement secure backup encryption and access controls",
      });
    }

    return {
      category: "Data Protection",
      status: findings.length === 0 ? "pass" : "fail",
      findings,
      score: this.calculateScore(findings),
    };
  }
}

/**
 * 監査結果の型定義
 */
interface AuditResult {
  category: string;
  status: "pass" | "fail" | "warning";
  findings: AuditFinding[];
  score: number;
}

interface AuditFinding {
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  description: string;
  recommendation: string;
}

interface AuditReport {
  auditDate: string;
  overallScore: number;
  status: "pass" | "fail";
  results: AuditResult[];
  summary: {
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
  };
  recommendations: string[];
}
```

## セキュリティ設定

### 環境別セキュリティ設定

```typescript
/**
 * 環境別セキュリティ設定
 */
const SECURITY_CONFIGS = {
  development: {
    // 開発環境設定
    encryption: {
      enabled: true,
      algorithm: "AES-256-GCM",
      keyRotationInterval: 86400000, // 24時間
    },
    authentication: {
      sessionTimeout: 28800, // 8時間
      mfaRequired: false,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
      },
    },
    logging: {
      level: "debug",
      auditEnabled: true,
      retentionDays: 30,
    },
    cors: {
      allowedOrigins: ["http://localhost:3000", "http://localhost:5173"],
      allowCredentials: true,
    },
  },

  production: {
    // 本番環境設定
    encryption: {
      enabled: true,
      algorithm: "AES-256-GCM",
      keyRotationInterval: 3600000, // 1時間
    },
    authentication: {
      sessionTimeout: 14400, // 4時間
      mfaRequired: true,
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 12,
      },
    },
    logging: {
      level: "info",
      auditEnabled: true,
      retentionDays: 2555, // 7年
    },
    cors: {
      allowedOrigins: ["https://your-domain.com"],
      allowCredentials: true,
    },
    rateLimit: {
      windowMs: 900000, // 15分
      maxRequests: 100,
      skipSuccessfulRequests: false,
    },
  },
} as const;

/**
 * セキュリティ設定の適用
 */
class SecurityConfigManager {
  private config: typeof SECURITY_CONFIGS.production;

  constructor(environment: "development" | "production") {
    this.config = SECURITY_CONFIGS[environment];
  }

  /**
   * セキュリティヘッダーを設定
   * @returns セキュリティヘッダー
   */
  getSecurityHeaders(): Record<string, string> {
    return {
      "Strict-Transport-Security":
        "max-age=31536000; includeSubDomains; preload",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
      "Content-Security-Policy": this.generateCSP(),
    };
  }

  /**
   * CSPヘッダーを生成
   * @returns CSP文字列
   */
  private generateCSP(): string {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://script.google.com https://accounts.google.com",
      "frame-src https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ];

    return cspDirectives.join("; ");
  }
}
```

## まとめ

### セキュリティチェックリスト

- [ ] **認証・認可**

  - [ ] Google OAuth 2.0の実装
  - [ ] PKCE（Proof Key for Code Exchange）の使用
  - [ ] 多要素認証（MFA）の実装
  - [ ] セッション管理の強化
  - [ ] ロールベースアクセス制御（RBAC）

- [ ] **データ保護**

  - [ ] 保存時暗号化（AES-256-GCM）
  - [ ] 転送時暗号化（TLS 1.2以上）
  - [ ] 個人情報のマスキング・匿名化
  - [ ] データ分類・ラベリング
  - [ ] セキュアなキー管理

- [ ] **通信セキュリティ**

  - [ ] HTTPS/TLSの強制
  - [ ] セキュリティヘッダーの設定
  - [ ] Content Security Policy（CSP）
  - [ ] CORS設定の適切な制限

- [ ] **入力検証**

  - [ ] 入力値のサニタイゼーション
  - [ ] SQLインジェクション対策
  - [ ] XSS攻撃対策
  - [ ] CSRF攻撃対策

- [ ] **監査・ログ**

  - [ ] 包括的な監査ログ
  - [ ] セキュリティイベントの監視
  - [ ] 異常検知システム
  - [ ] インシデント対応プロセス

- [ ] **GDPR・プライバシー**

  - [ ] 同意管理システム
  - [ ] データポータビリティ
  - [ ] 忘れられる権利
  - [ ] データ修正権

- [ ] **定期監査**
  - [ ] セキュリティ監査の実施
  - [ ] 脆弱性スキャン
  - [ ] ペネトレーションテスト
  - [ ] コンプライアンスチェック

### セキュリティ連絡先

- **セキュリティチーム**: security@company.com
- **インシデント報告**: incident@company.com
- **緊急連絡先**: +81-XX-XXXX-XXXX

### 関連ドキュメント

- [API仕様ドキュメント](./API_SPECIFICATION.md)
- [データ管理ドキュメント](./DATA_MANAGEMENT.md)
- [トラブルシューティング](./TROUBLESHOOTING.md)
- [セットアップ・運用ドキュメント](./SETUP_OPERATIONS.md)
