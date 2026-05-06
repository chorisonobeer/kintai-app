# 認証脱 GAS 化 — Phase 1 作業手順書

- **作成日**: 2026-05-06
- **更新日**: 2026-05-06（追加セキュリティ対策 9 項目組込み）
- **対象**: パッション（運用者）
- **目的**: Google Service Account を使い、Netlify Function から非公開 Sheet を読めるようにする
- **所要時間**: 45〜60 分（初回。追加対策含む）
- **前提知識**: 不要。画面どおりに進められれば OK
- **背景**: SA JSON キーは Google 公式に「強く非推奨」だが Netlify では WIF 不可のため採用。詳細 `docs/research-gcp-service-account-2026.md`

## 追加セキュリティ対策 9 項目（本手順書に組込み済み）

各 Step に対応番号を付与。完了確認は §10 のチェックリストで実施。

| # | 対策 | 該当 Step |
|---|---|---|
| **M1** | Sheet 単位の閲覧者のみ（プロジェクトロール禁止） | Step 3-3, 5 |
| **M2** | 環境変数管理（git 禁止） | Step 6 |
| **M3** | キーローテ運用（90 日） | Step 10（運用フロー） |
| **M4** | Cloud Logging で SA 監視 | Step 11（監視設定） |
| **M5** | 組織ポリシー（任意） | Step 12（任意） |
| **M6** | GitHub secret scanning + push protection | Step 13 |
| **M7** | 漏洩 playbook 作成 | Step 14 |
| **M8** | 専用 SA（兼用禁止） | Step 3-2 |
| **M9** | 旧キー revoke 後の動作不能確認 | Step 10-3 |

---

## 全体フロー（俯瞰図）

```
[Step 1] Google Cloud プロジェクト作成（既にあれば再利用）
  ↓
[Step 2] Google Sheets API を有効化
  ↓
[Step 3] Service Account 作成 + JSON 鍵ダウンロード（M8: 専用 SA）
  ↓
[Step 4] メンバー Sheet の ID / gid を控える
  ↓
[Step 5] Sheet を Service Account に共有（M1: 閲覧者権限のみ）
  ↓
[Step 6] Netlify 環境変数を 4 個登録（M2: env 保管）
  ↓
[Step 7] 検証スクリプトで読み取り確認
  ↓
[Step 8] Sheet「ウェブに公開」を停止
  ↓
[Step 9] Claude へ引き継ぎ報告
  ↓
─────── 以下、追加セキュリティ対策（必須・推奨・任意） ───────
[Step 10] キーローテーション運用フロー文書化（M3 + M9）
  ↓
[Step 11] Cloud Logging で SA 利用ログ監視設定（M4）
  ↓
[Step 12] 組織ポリシー設定（M5、任意）
  ↓
[Step 13] GitHub secret scanning + push protection 有効化（M6）
  ↓
[Step 14] キー漏洩 playbook 作成（M7）
  ↓ Phase 2 へ（Claude が実装）
```

**重要**: Step 8（公開停止）は **Step 7 検証 OK 後**に必ず行う。先に止めると CSV API も止まり、Step 7 検証ができなくなる。

---

## Step 1. Google Cloud プロジェクトを用意

### 1-1. Cloud Console を開く
- https://console.cloud.google.com/ にアクセス
- パッションの Google アカウントでログイン

### 1-2. 既存プロジェクトを使うか新規作成するか判断
- 上部のプロジェクト切替プルダウン（「プロジェクトを選択」）を確認
- 既に「kintai-app」等のプロジェクトがあれば**それを選ぶ**
- なければ「新しいプロジェクト」を押下し、以下で作成：
  - プロジェクト名: `kintai-app-auth`（任意。分かりやすければ何でも可）
  - 組織・場所: そのままでOK
  - 「作成」ボタン押下 → 30秒ほど待つ

### 1-3. プロジェクトが選択されているか確認
- 上部プロジェクト名が `kintai-app-auth`（または選んだもの）になっていればOK

✅ **完了条件**: 画面上部に対象プロジェクト名が表示されている

---

## Step 2. Google Sheets API を有効化

### 2-1. API ライブラリへ
- 左サイドバー「ハンバーガー」→ 「APIとサービス」→「ライブラリ」
- 直リンク: https://console.cloud.google.com/apis/library

### 2-2. Sheets API を検索
- 検索ボックスに `Google Sheets API` と入力
- 候補から「**Google Sheets API**」を選択

### 2-3. 有効化
- 「**有効にする**」ボタン押下
- 数秒待つ

⚠️ **注意**: 既に有効化済みの場合は「管理」と表示される。それなら何もしなくて OK。

✅ **完了条件**: ボタンが「管理」表示に変わる

---

## Step 3. Service Account 作成 + JSON 鍵ダウンロード

### 3-1. 認証情報ページへ
- 左サイドバー「APIとサービス」→「認証情報」
- 直リンク: https://console.cloud.google.com/apis/credentials

### 3-2. Service Account を作成
- 上部「**+ 認証情報を作成**」ボタン → 「**サービス アカウント**」を選択
- フォーム入力:
  - サービス アカウント名: `kintai-sheets-reader`
  - サービス アカウント ID: 自動入力されたものでOK（例: `kintai-sheets-reader-xxx`）
  - 説明: `Read member sheet from Netlify Function`（任意）
- 「**作成して続行**」ボタン

### 3-3. ロール付与（スキップでOK）
- 「ロールを選択」プルダウンが出るが、**何も選ばずに「続行」**
  - 理由: Sheet 単位での共有設定で権限を絞るため、プロジェクト全体のロールは不要

### 3-4. ユーザーアクセス（スキップでOK）
- 「完了」を押下

### 3-5. 作成された Service Account のメールアドレスをコピー
- 認証情報一覧画面に戻る
- 「サービス アカウント」セクションに `kintai-sheets-reader@<project>.iam.gserviceaccount.com` が表示される
- このメールアドレスを**メモ帳等にコピー**（後で Sheet 共有に使用）

### 3-6. JSON 鍵を発行
- 一覧の `kintai-sheets-reader@...` 行をクリック
- 上部タブ「**鍵**」をクリック
- 「**鍵を追加**」→「**新しい鍵を作成**」
- 鍵のタイプ: `JSON` を選択 → 「作成」
- → **JSON ファイルが自動ダウンロードされる**（例: `kintai-app-auth-abc123.json`）

⚠️ **重要**: このファイルは秘密情報。
- パスワードマネージャーや暗号化フォルダに保管
- **GitHub にコミットしない**（`.gitignore` 確認）
- 失くしたら再発行可能だが古い鍵は revoke すること

### 3-7. JSON ファイルの中身を確認
- ダウンロードしたファイルをテキストエディタで開く
- 以下のような構造のはず:
  ```json
  {
    "type": "service_account",
    "project_id": "kintai-app-auth",
    "private_key_id": "abc...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "kintai-sheets-reader@kintai-app-auth.iam.gserviceaccount.com",
    "client_id": "...",
    ...
  }
  ```
- **`client_email` と `private_key` の 2 値**を後で Netlify env に登録する

✅ **完了条件**:
- Service Account のメールアドレスを控えた
- JSON 鍵ファイルがローカルに保存された

---

## Step 4. メンバー Sheet の ID / gid を控える

### 4-1. 対象 Sheet を開く
- メンバーリストが入っている Google Sheets を開く
  - 旧 GAS が参照していた ID: `1XF8QIoudGmRSYavHZ4CkZQjlEUlaaEULxcuWZVOlIuE`
  - 直リンク: https://docs.google.com/spreadsheets/d/1XF8QIoudGmRSYavHZ4CkZQjlEUlaaEULxcuWZVOlIuE/edit

### 4-2. Sheet ID を URL から抽出
- ブラウザの URL バーを見る
- 形式: `https://docs.google.com/spreadsheets/d/【ここ】/edit#gid=【あれ】`
- 【ここ】が **Sheet ID**（44文字程度の英数字）
  - 上記の例なら `1XF8QIoudGmRSYavHZ4CkZQjlEUlaaEULxcuWZVOlIuE`

### 4-3. メンバーリストタブの gid を控える
- 画面下部のシートタブで「**メンバーリスト**」を選択
- URL バー末尾の `#gid=【数字】` の数字をコピー
- 旧 CSV URL から推測: `gid=623104700`（要確認）

✅ **完了条件**:
- Sheet ID を控えた
- gid を控えた
- 対象タブ名が「メンバーリスト」と一致することを目視確認

---

## Step 5. Sheet を Service Account に共有

### 5-1. 共有設定を開く
- Sheet 右上の「**共有**」ボタン押下

### 5-2. SA メールアドレスを追加
- 「ユーザーやグループを追加」入力欄に Step 3-5 でコピーした SA メールアドレスを貼付
  - 例: `kintai-sheets-reader@kintai-app-auth.iam.gserviceaccount.com`
- 権限プルダウン: 「**閲覧者**」を選択（編集者・コメント可は不要）
- 「**通知を送信**」のチェック: **外す**（人間ではないので不要）
- 「**共有**」ボタン押下

### 5-3. 共有先一覧に表示されているか確認
- 一覧に SA メールが「閲覧者」で表示されていれば OK

✅ **完了条件**: SA メールが Sheet の閲覧者として登録されている

---

## Step 6. Netlify 環境変数を登録

### 6-1. Netlify ダッシュボードを開く
- https://app.netlify.com/ にログイン
- 対象サイト（kintai-app）を選択

### 6-2. 環境変数ページへ
- 左サイドバー「**Site configuration**」 → 「**Environment variables**」
- 直リンク: `https://app.netlify.com/sites/<site-name>/settings/env`

### 6-3. 4 つの環境変数を追加

「**Add a variable**」ボタンから以下を 1 個ずつ追加：

| Key | Value | 取得元 |
|---|---|---|
| `GOOGLE_SA_CLIENT_EMAIL` | SA のメールアドレス | Step 3-5 でコピーしたもの |
| `GOOGLE_SA_PRIVATE_KEY` | JSON の `private_key` の値（`-----BEGIN…END-----\n` 全体）| Step 3-6 の JSON ファイル |
| `MEMBER_SHEET_ID` | Sheet ID | Step 4-2 で控えたもの |
| `MEMBER_SHEET_TAB_NAME` | `メンバーリスト` | 固定 |

#### 6-3-1. GOOGLE_SA_PRIVATE_KEY の入力時の注意

- **JSON 内の `private_key` 値をそのままコピー**:
  ```
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...\n-----END PRIVATE KEY-----\n"
  ```
- ダブルクォートで囲んだ状態のまま貼っても OK（実装側で剥がす）
- **Netlify UI に貼ると `\n` がリテラル文字列として保存される**ので、関数側で `replace(/\\n/g, '\n')` する（実装で対応する）

#### 6-3-2. Scope 設定
- 各変数の Scope（適用範囲）プルダウンで以下を確認:
  - **Functions**: ✅ 必須
  - Builds: ✅ 推奨（ビルド時にも参照する場合に備える）
  - Runtime / Post-processing: 不要

✅ **完了条件**: 4 つの env が一覧に表示されている

---

## Step 7. 検証スクリプトで読み取り確認

ここで **Phase 2 実装の前に** Service Account が本当に Sheet を読めるかをテストします。

### 7-1. 簡易検証スクリプトを Claude が用意
このステップは Claude が以下を行う前提:
- `scripts/verify-sa-access.mjs` を作成（オフライン実行用）
- 環境変数 4 つをローカル `.env.local` に設定
- `node scripts/verify-sa-access.mjs` を実行
- 期待出力:
  ```
  ✅ Sheet ID: 1XF8...
  ✅ Tab: メンバーリスト
  ✅ Rows fetched: 200 (1 header + 199 members)
  ✅ Sample header: 番号,ユニークID,ソルト,ハッシュ,名前,...
  ```

⚠️ **本ステップだけはパッション + Claude 共同作業**:
- パッションが Step 6 の env をローカル `.env.local` にもコピー（**コミット禁止**、`.gitignore` で除外確認済み）
- Claude が verify スクリプトを実行
- 結果をパッションに報告

✅ **完了条件**:
- スクリプトが行数 200 を返す
- ヘッダ列が CSV と一致する

---

## Step 8. Sheet「ウェブに公開」を停止

⚠️ **Step 7 で読み取り成功後にのみ実施**

### 8-1. Sheet の公開設定を開く
- Sheet 上部メニュー「ファイル」→「**共有**」→「**ウェブに公開**」

### 8-2. 公開を停止
- ダイアログ内に「公開済みのコンテンツとリンク」セクションがある
- 「**公開を停止**」ボタン押下
- 確認ダイアログで「**OK**」

### 8-3. 公開停止の確認
- 旧 CSV URL に curl でアクセス → **4xx/5xx エラー**になることを確認
  ```
  https://docs.google.com/spreadsheets/d/e/2PACX-1vRlLofHYI-tPLv5SMdUDUv4MRDKzbr_U1H5yEj0CryHu0gW0HXEwQRjlr90GmPP_zoOUMHtzuHSNb96/pub?gid=623104700&single=true&output=csv
  ```
- **同時に**、Step 7 の SA 経由読み取りが**継続して成功する**ことも確認

✅ **完了条件**:
- 匿名 CSV URL fetch が失敗
- SA 経由 fetch が成功

---

## Step 9. Phase 1 基本セットアップの引き継ぎ報告（中間チェックポイント）

以下の情報を Claude に共有（**鍵そのものは送らないこと**）：

```
[Phase 1 完了報告]
✅ Google Cloud プロジェクト: ___（プロジェクトID）
✅ Service Account メール: ___@___.iam.gserviceaccount.com
✅ Sheet ID: ___
✅ メンバーリスト gid: ___
✅ Netlify env 4 個登録済み
✅ ローカル .env.local も更新済み（Step 7 用）
✅ 検証スクリプト success
✅ ウェブ公開停止済み
```

→ Step 10〜14 の追加対策完了後、Claude が **Phase 2 実装**（`auth-login` Function 作成、ローカルテスト）に着手します。

---

## Step 10. キーローテーション運用フロー文書化（M3 + M9）

### 10-1. ローテ周期の決定
- 推奨：**90 日ごと**
- カレンダー or タスク管理ツールに「SA キーローテ」のリマインダ登録

### 10-2. ローテ手順（実施時の流れ）
```
1. Cloud Console → IAM → Service Accounts → kintai-sheets-reader → 鍵
2. 「鍵を追加」→ JSON 鍵を新規発行（旧鍵はまだ消さない）
3. 新鍵の private_key / client_email を控える
4. Netlify env var GOOGLE_SA_PRIVATE_KEY を新値に更新
5. Netlify Functions の動作確認（curl で smoke test）
6. 動作 OK なら、旧鍵を「削除」（revoke）
7. M9 検証: 旧鍵を使って Sheet 読み取り → 必ず失敗することを確認
8. ローテ実施日時を記録（`docs/key-rotation-log.md` に追記、別途作成）
```

### 10-3. 旧キー無効化テスト（M9）
- 旧 JSON 鍵が手元にある状態で `scripts/verify-sa-access.mjs` 同等の処理を実行
- → 認証エラーが返ることを確認 → 結果を `docs/key-rotation-log.md` に記録

✅ **完了条件**: ローテ手順書（本 Step）がチームで参照可能、初回ローテのリマインダ設定済み

---

## Step 11. Cloud Logging で SA 利用ログ監視（M4）

### 11-1. ログ閲覧確認
- Cloud Console → 「ロギング」→ 「ログ エクスプローラ」
- 直リンク: https://console.cloud.google.com/logs/query

### 11-2. SA 利用クエリ
以下を入力して Run:
```
protoPayload.authenticationInfo.principalEmail="kintai-sheets-reader@<project>.iam.gserviceaccount.com"
```

正常なログイン時に `getValues` などの API 呼出記録が表示されればOK。

### 11-3. アラート設定（推奨）
- ログエクスプローラ右上「アラートを作成」
- 条件: 1 分間に 100 件以上の SA 利用（異常頻度）
- 通知先: パッションのメール

✅ **完了条件**: ログクエリでSA利用が見える状態 + 異常時のアラート設定（任意）

---

## Step 12. 組織ポリシー設定（M5、任意）

⚠️ Google Workspace 組織管理者権限が必要。**個人の Google アカウントでは不可**。組織所属でなければスキップ。

### 12-1. 組織ポリシーの場所
- Cloud Console → 「IAM と管理」→「組織ポリシー」
- 直リンク: https://console.cloud.google.com/iam-admin/orgpolicies

### 12-2. 設定すべきポリシー
| 名前 | 効果 |
|---|---|
| `iam.disableServiceAccountKeyCreation` | 新規 SA 鍵の作成を禁止（既存の `kintai-sheets-reader` のローテだけ例外的に許可する運用） |
| `iam.disableServiceAccountKeyUpload` | 外部生成鍵のインポート禁止 |

### 12-3. 例外設定
本 SA だけはローテで新鍵作成が必要なので、ポリシー条件で `serviceAccount.email` 一致時のみ作成許可、を IAM 条件で設定する。
（複雑なので、個人運用ならこの Step スキップで OK）

✅ **完了条件**: 組織ポリシーが対象 SA を除き鍵作成禁止 OR 個人運用のためスキップ宣言

---

## Step 13. GitHub secret scanning + push protection 有効化（M6）

⚠️ 公開リポジトリは secret scanning が無料デフォルト有効。**プライベートリポジトリは GitHub Advanced Security か個別有効化が必要**。

### 13-1. リポジトリ設定を開く
- GitHub の対象リポジトリ → **Settings** → **Code security**

### 13-2. 有効化項目
| 機能 | 状態 |
|---|---|
| Secret scanning | ✅ Enable |
| Push protection（鍵 push を事前ブロック） | ✅ Enable |
| Dependency review | ✅ Enable（任意）|

### 13-3. .gitignore 確認
- リポジトリ root の `.gitignore` に以下が含まれているか確認:
  ```
  .env
  .env.local
  .env.production
  *.json
  service-account-*.json
  ```
- ⚠️ 既存に `*.json` 一括除外が無い場合、SA 鍵 JSON ファイル名（例 `kintai-app-auth-abc123.json`）を個別に追加

### 13-4. テスト
- 試しに dummy `private_key` を含むファイルを commit → push を試行
- Push protection が反応してブロックすれば動作確認 OK

✅ **完了条件**: secret scanning 有効 + push protection 有効 + .gitignore で SA 鍵ファイル除外

---

## Step 14. キー漏洩 playbook 作成（M7）

### 14-1. 別ファイル作成
- ファイルパス: `docs/security-playbook-sa-key-leak.md`
- 内容（テンプレ。パッションが具体化）:

```markdown
# SA キー漏洩時の対応 playbook

## 即時対応（30 分以内）
1. Cloud Console → IAM → Service Accounts → kintai-sheets-reader → 鍵
2. **漏洩したキー ID を即座に「削除（revoke）」**
3. 新キーを発行し、Netlify env var を更新
4. 動作確認（ログイン smoke test）

## 影響調査（24 時間以内）
1. Cloud Logging で漏洩キーの利用履歴を確認
   - `protoPayload.authenticationInfo.serviceAccountKeyName="<漏洩キーID>"`
2. 不審な API 呼出（時間帯・地理・頻度）を抽出
3. メンバーリスト読取以外のアクセスがあれば追加調査

## 復旧後監査（1 週間以内）
1. なぜ漏洩したか root cause 分析
2. 同種漏洩を防ぐ対策（手順改善 / ツール導入）
3. 全 SA キーの棚卸しと未使用キーの削除

## 連絡先
- Google Cloud サポート: ...
- Netlify サポート: ...
```

✅ **完了条件**: playbook ファイルがリポジトリにコミットされている

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `Permission denied` | Sheet の共有設定で SA に権限が無い | Step 5 を再確認。共有メールアドレスのタイプミスチェック |
| `invalid_grant: Invalid JWT Signature` | `private_key` の改行が壊れている | `\n` を実際の改行に置換しているか実装側で確認 |
| `API has not been used in project ... or it is disabled` | Step 2 を未実施 / 別プロジェクトに有効化 | Step 2 で対象プロジェクトを再確認 |
| `Sheet not found` | Sheet ID が間違っている | URL から再抽出。末尾の `/edit` 含めず ID 部分のみ |
| `RANGE_NOT_FOUND` | タブ名が違う / 改行・空白混入 | Step 4-3 で確認したタブ名と一致するか確認 |
| 検証スクリプトが localhost からしか動かない | 通常動作。検証用なので問題なし | 本番は Netlify Function から動くので別問題 |

---

## セキュリティ チェックリスト（追加対策 9 項目を含む完全版）

実施完了後、以下が**全て**満たされていることを確認：

### 基本（Step 1-9 に対応）
- [ ] JSON 鍵ファイルはローカル管理（git 未コミット）
- [ ] `.env.local` も git 未コミット（`.gitignore` で除外確認）
- [ ] Netlify env の Scope は最小限（Functions / Builds のみ）
- [ ] Sheet の「ウェブに公開」は停止状態
- [ ] Sheet の共有先に意図しない人物・SA が含まれていない
- [ ] JSON 鍵の `private_key_id` を控えた（revoke 操作用）

### M1 — Sheet 単位の閲覧者権限のみ
- [ ] SA にプロジェクト全体のロールを付与していない（IAM 一覧で SA 行が空）
- [ ] Sheet の共有設定で SA は「閲覧者」（編集者・コメント可ではない）

### M2 — 環境変数管理
- [ ] 4 つの env var が Netlify UI で設定済み
- [ ] env 値が repo の `.env.production` 等に**コピーされていない**

### M3 — キーローテ
- [ ] Step 10 のローテ手順書を読んだ
- [ ] 90 日後のリマインダを登録済み

### M4 — Cloud Logging 監視
- [ ] Step 11 のログクエリで SA 利用が見える
- [ ] アラート設定済み（任意）

### M5 — 組織ポリシー（任意）
- [ ] 適用済み OR 個人運用のためスキップ宣言

### M6 — GitHub secret scanning
- [ ] secret scanning 有効
- [ ] push protection 有効
- [ ] `.gitignore` で SA 鍵 JSON 除外

### M7 — 漏洩 playbook
- [ ] `docs/security-playbook-sa-key-leak.md` 作成済み

### M8 — 専用 SA
- [ ] `kintai-sheets-reader` は本用途のみで使用、他用途で兼用していない

### M9 — 旧キー無効化テスト
- [ ] 初回ローテ実施時に旧キー失敗を確認するルールを認識

---

## 関連ドキュメント

- 全体計画: `docs/plan-auth-migration-from-gas.md`
- 方式選定の根拠: `docs/research-gcp-service-account-2026.md`
- 次工程: Phase 2 実装（Claude 担当、Step 9 後の中間チェック → Step 10〜14 完了後に着手）

## 各 Step の優先度（パッションが先行できるもの）

| Step | 優先度 | 備考 |
|---|---|---|
| 1〜6 | **必須・最優先** | 基本動作のため |
| 7 | **必須** | Claude 共同作業 |
| 8 | **必須** | Step 7 OK 後 |
| 9 | **必須** | Phase 2 着手の前提 |
| 10 | 推奨 | 運用開始前に整備 |
| 11 | 推奨 | 監視はあとからでも可 |
| 12 | 任意 | 組織管理者権限が必要 |
| 13 | 必須 | git 漏洩防止 |
| 14 | 推奨 | 漏洩時即対応のため |

→ パッションは Step 1〜6 を進めて頂き、完了報告 → Claude が Step 7 実装 → 共同検証 → Step 8 → Step 9 中間チェック → 残りの追加対策（10〜14） → Phase 2 実装着手、の順序で進めます。
