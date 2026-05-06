# Google Cloud Service Account / WIF — 2026 年 5 月時点の最新調査

- **調査日**: 2026-05-06
- **調査者**: Claude（Web 検索結果に基づく）
- **きっかけ**: Cloud Console で SA キー発行時に「Workload Identity 連携の使用を推奨」警告が表示された
- **目的**: Service Account JSON キー方式が現在も妥当か、本プロジェクトで採るべき方針を確定する

---

## §0 結論（先に）

| 問い | 回答 |
|---|---|
| Service Account JSON キーは**廃止**された？ | **No**（廃止されていない） |
| Google Cloud は SA JSON キーを**推奨**している？ | **No**（強く非推奨。「最終手段」と位置づけ） |
| 推奨される代替は？ | **Workload Identity Federation (WIF)** |
| 本プロジェクト（Netlify Functions）で WIF は使える？ | **実質 No**（Netlify Functions に native OIDC トークン発行機能がない） |
| 結局どうするのが妥当か？ | **SA JSON キー方式を採用しつつ、追加セキュリティ対策を実装** |

---

## §1 最新の Google Cloud 推奨事項

### 1-1. 公式ドキュメントの記載

Google Cloud 公式 IAM ベストプラクティスより：

> Service account keys are **powerful credentials**, and can present a security risk if they are not managed correctly. **Avoid user-managed service account keys**. Use alternatives **whenever possible**.

(出典: [Best practices for managing service account keys](https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys))

### 1-2. SA キーの位置付け（2026 年現在）

| 項目 | 状態 |
|---|---|
| 廃止（Deprecation） | していない |
| 公式推奨度 | 「**最終手段**（last resort）」 |
| Cloud Console UI での挙動 | **発行時に警告表示**（ユーザーが見たもの） |
| 組織ポリシーで無効化可能 | Yes（`iam.disableServiceAccountKeyCreation`） |
| Free Tier 限定の制限 | なし |

### 1-3. SA キーが容認されるケース（公式ガイダンス）

公式は以下のケースのみ許容している：

1. より安全な代替手段が**実装不可能**な環境
2. 本番外環境（dev / staging）でのテスト
3. **キーベース認証しか受け付けないサードパーティツール**との連携 ← 本プロジェクトはこれに該当
4. 一時的アクセス（有効期限付き）

### 1-4. 推奨代替手段の階層

公式は以下の優先順位で代替手段を案内：

1. **第一推奨**: **Workload Identity Federation (WIF)**
   - OIDC または SAML 2.0 でフェデレーション
   - 短命トークン（1時間）で安全
2. **第二**: Service Account Impersonation（Cloud 内ワークロード間）
3. **第三**: GKE / Compute Engine の Managed Workload Identity
4. **最終手段**: SA JSON キー（本件）

---

## §2 Workload Identity Federation (WIF) とは

### 2-1. 仕組み

```
[外部 IdP]           [Google Cloud STS]      [GCP API]
External workload --> OIDC/SAML token -->    Federated
(GitHub Actions,     /  Exchange         \    OAuth 2.0
 GitLab CI,         /   (no SA key!)      \   token
 Vercel,           /                       \  (1h valid)
 ...)              -> verify identity ----->
```

外部 IdP（Identity Provider）が発行する OIDC トークンを Google Cloud STS（Security Token Service）が検証し、その代わりに**短命の Google Cloud アクセストークン**を発行する。SA JSON キーは存在しない。

(出典: [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation))

### 2-2. WIF が機能する前提

外部 IdP が以下を満たす必要がある：

- OpenID Connect 1.0 または SAML 2.0 のサポート
- 公開された Issuer URI（`https://issuer.example.com`）
- JWKS エンドポイント（`/.well-known/jwks.json`）公開
- 各ワークロード実行時に**短命の OIDC トークンを発行**できる

### 2-3. 既に WIF 対応している主な実行環境

| プラットフォーム | OIDC トークン発行 | Issuer URI 例 |
|---|---|---|
| GitHub Actions | ✅ ネイティブ | `https://token.actions.githubusercontent.com` |
| GitLab CI | ✅ ネイティブ | `https://gitlab.com` |
| Vercel Functions | ✅ ネイティブ（`@vercel/oidc`） | `https://oidc.vercel.com` |
| AWS Lambda（IAM Role 経由） | ✅ STS AssumeRole 経由 | （AWS STS） |
| Azure App Service | ✅ Managed Identity | （Azure AD） |
| **Netlify Functions** | ❌ **未対応** | なし |
| **Netlify Edge Functions** | ❌ **未対応** | なし |

### 2-4. Vercel の WIF 実装例（参考）

Vercel は Functions ランタイムから OIDC トークンを `getVercelOidcToken()` で取得可能。これを Google STS に渡してフェデレーション完結。

```ts
import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';

const authClient = ExternalAccountClient.fromJSON({
  type: 'external_account',
  audience: '//iam.googleapis.com/projects/.../workloadIdentityPools/vercel/providers/vercel',
  subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
  token_url: 'https://sts.googleapis.com/v1/token',
  service_account_impersonation_url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/...',
  subject_token_supplier: { getSubjectToken: getVercelOidcToken },
});
```

(出典: [Vercel docs - Connect to GCP](https://vercel.com/docs/oidc/gcp))

---

## §3 Netlify Functions の現状（2026 年 5 月時点）

### 3-1. ネイティブ OIDC トークン発行: **未実装**

調査結果：
- Netlify Functions / Edge Functions ランタイムは **OIDC トークンを発行しない**
- Netlify Identity（GoTrue）は**ユーザー認証用**であってワークロード ID ではない
- Netlify SDK / API にも `getOidcToken()` 相当が存在しない
- Netlify 公式ドキュメント・support フォーラム・GitHub issues に「ネイティブ OIDC で WIF」のサポート記載なし

### 3-2. なぜ Netlify は OIDC を発行しないのか（推測）

公式声明はないが：
- Netlify Functions は AWS Lambda 互換ランタイム上で動作
- ランタイムを「IdP として」運用するには発行・JWKS 公開・鍵ローテ等の運用負荷
- 主要競合（Vercel）が実装したのは比較的最近（2024〜2025）
- 競合追従が遅れている可能性

### 3-3. Netlify で WIF を実現する代替手段

**いずれも本プロジェクトには過剰投資**：

| 手段 | 実装難度 | 維持コスト |
|---|---|---|
| 自前 OIDC 発行サーバを別ホスティング | 大 | 中 |
| Auth0 / Okta 等を IdP として SA を借用 | 中 | 中（有償） |
| GitHub Actions 経由で deploy 時にトークン取得→Netlify に渡す | 中 | 大（短命トークンの再発行ループ） |

→ いずれも 200 ユーザーの内部勤怠アプリには大袈裟。

---

## §4 本プロジェクトでの方針（再判断）

### 4-1. 結論：**SA JSON キー方式を採用 + 追加セキュリティ対策**

理由：
1. WIF は Netlify Functions では native 不可
2. 公式 §1-3 で「キーベース認証しか受け付けないサードパーティ」は SA キー容認とされる
3. SA キーは「**未推奨だが廃止されておらず、適切な管理下では使える**」のが公式スタンス
4. プロジェクト規模（199 ユーザーの内部アプリ）で WIF のために実行環境を Vercel 等へ移行するのは過剰投資

### 4-2. 採用すべき**追加セキュリティ対策**（必須）

公式が SA キー利用時に求める mitigation を全て実装：

| # | 対策 | 実装方法 | 必須度 |
|---|---|---|---|
| 1 | **権限を最小化** | プロジェクトロール付与せず、Sheet 単位で「閲覧者」のみ | 必須 |
| 2 | **環境変数として保管** | Netlify env var、git にコミットしない | 必須 |
| 3 | **キーローテーション** | 90 日ごとに新キー発行→旧キー revoke | 推奨 |
| 4 | **キー使用ログ監視** | Cloud Logging でキー利用ログ監視（異常検知） | 推奨 |
| 5 | **組織ポリシー設定** | `iam.disableServiceAccountKeyCreation` で他 SA 鍵作成禁止 | 任意 |
| 6 | **GitHub secret scanning** | `.gitignore` 見直し + push protection 有効化 | 必須 |
| 7 | **侵害想定の playbook** | キー漏洩時の手順書（revoke + ローテ + 監査） | 推奨 |
| 8 | **専用 SA**（兼用しない） | この用途専用に SA を作成、他用途で使い回さない | 必須 |
| 9 | **キー無効化テスト** | 旧キー revoke 後にアクセス不可になることを確認 | 推奨 |

### 4-3. ロードマップ（将来の WIF 化）

以下のいずれかが起きたら WIF へ移行：

- Netlify が native OIDC トークン発行を実装（要 watch）
- アプリの実行環境を Vercel / GitHub Actions / Cloud Run に移す決定
- 利用ユーザー数が桁違いに増え、セキュリティ要件が引き上げられた

→ 計画書 `plan-auth-migration-from-gas.md` に「Phase X: WIF 移行（将来）」として記録予約。

---

## §5 計画書 `plan-auth-migration-from-gas.md` への反映点

以下の修正を行う（パッション承認後）：

1. §3 推奨方式 A の説明を更新：
   - 「SA キーは公式に**未推奨**だが、Netlify の制約上採用」と明記
   - WIF 不採用の理由（Netlify が OIDC 未発行）を追記
2. §5 Phase 1 の手順書 (`auth-migration-phase1-setup-guide.md`) を更新：
   - **§4-2 の 9 つの mitigation を実装手順に組み込む**
   - 特に必須項目（権限最小化、env 保管、専用 SA、git 除外、push protection）
3. §8 リスク表に「SA キー方式採用の理由・将来 WIF 化の条件」を追記

---

## §6 学習データと最新情報の差分まとめ

| 項目 | 学習データ | 最新（2026-05） | 影響 |
|---|---|---|---|
| SA キーの推奨度 | 「標準的な方法」 | **強く非推奨**（UI 警告あり） | 警告は無視せず、追加対策必須と認識 |
| WIF の存在 | 限定的に把握 | **第一推奨**（公式ガイド多数） | 本来検討すべきだった |
| Netlify Functions の OIDC 対応 | 未調査 | **未実装** | Netlify では結局 SA キー継続 |
| Vercel の OIDC 対応 | 未調査 | `@vercel/oidc` で実装済み | 将来の移行先候補 |
| `iam.disableServiceAccountKeyCreation` | 未調査 | 組織ポリシーで存在 | 任意で導入推奨 |

**反省**: SA キー方式を提案する際、最新の公式推奨度（強く非推奨）と WIF の存在を確認しなかった。提案前に Web 検索すべきだった。

---

## §7 出典（Sources）

- [Google Cloud Best practices for managing service account keys](https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys)
- [Google Cloud Workload Identity Federation overview](https://docs.cloud.google.com/iam/docs/workload-identity-federation)
- [Configure Workload Identity Federation with other identity providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
- [Best practices for using Workload Identity Federation](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)
- [Vercel Connect to Google Cloud (OIDC)](https://vercel.com/docs/oidc/gcp)
- [Disable and enable service account keys](https://docs.cloud.google.com/iam/docs/keys-disable-enable)
- [Goodbye, Service Account Keys! Workload Identity Federation guide (Medium)](https://medium.com/google-cloud/goodbye-service-account-keys-e009f3b8ffef)
- [Stop Using Service Account Keys: A Guide to WIF](https://blog.ogwilliam.com/post/gcp-workload-identity-federation-guide)
- [How to Replace Service Account Keys with WIF in GCP](https://oneuptime.com/blog/post/2026-02-17-how-to-replace-service-account-keys-with-workload-identity-federation-in-gcp/view)
- [Netlify Identity overview](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/overview/)
- [Use Identity in functions (Netlify)](https://docs.netlify.com/manage/security/secure-access-to-sites/identity/use-identity-in-functions/)
- [Use OpenID Connect for external identity providers · Issue #236 · netlify/gotrue](https://github.com/netlify/gotrue/issues/236)
