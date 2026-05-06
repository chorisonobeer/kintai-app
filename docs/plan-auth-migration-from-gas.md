# 認証経路の脱 GAS 化 — 計画書

- **作成日**: 2026-05-06
- **作成者**: Claude (パッション承認待ち)
- **ステータス**: 🟡 提案中（実装着手禁止）
- **対象ブランチ**: `fix/dev-server-sw-csp` から派生する新ブランチ（後述）

---

## §0 厳格ルール（CLAUDE.md §3.5 適用）

本計画は型定義 / 既存顧客データのマイグレーション / 2 ファイル以上の変更を伴うため、**§3.5 全適用**。

- **§3.5.1 契約ファースト**: 実装前に falsifiable な不変条件をリスト化し、パッションの署名を得る
- **§3.5.2 全数検証**: 199 ユーザー全員での検証パスを定義
- **§3.5.3 Phase Gate**: `(audit 全緑) AND (証拠コミット) AND (パッション承認)` の AND
- **§3.5.4 自己フィードバックループ**: 各 Phase 完了前に audit 全実行 → delta=0 まで反復
- **§3.5.5 嘘カテゴリ 6 種**: 意味論すり替え / 検証欠落 / 部分達成 / Happy path 劇場 / 対称性片側 / メモリ喪失 — 全て予防策を組み込む

---

## §1 ゴール（優先度順）

| 優先度 | ゴール | 完了条件 |
|---|---|---|
| **P0** | 名前 + パスワードでログイン成功（GAS 非経由） | 既存ユーザー全員（199 名）で名前 + パスワードを送ると 200 + token が返る。誤入力で 401 が返る |
| **P0** | メンバーリストが**公開状態でない** | Google Sheets「ウェブに公開」を停止。匿名 URL fetch で 4xx になる |
| **P1** | ログイン応答時間の改善 | warm 時 < 1s（現状 1.6–4.4s） |
| **P2** | パスワードハッシュ照合への移行 | 列 D（hash）と列 C（salt）で照合。列 N（平文）破棄 |
| **P3** | GAS から kintai データ読書も移行 | 別計画で扱う（本計画スコープ外） |

**スコープ厳守**: 本計画で**実装するのは P0 のみ**。P1 は計測のみ実施し、P2/P3 は別計画。

---

## §2 制約・前提

- 既存ユーザー数: **199 名**（CSV 行数より）
- 既存ユーザーの**追加・編集頻度は低**い想定（要確認）
- メンバーリスト列スキーマ（CSV 観察により確定）:
  ```
  A: 番号  B: ユニークID  C: ソルト  D: ハッシュ  E: 名前
  F: 電話番号  G: 連絡手段  H: 住所  I: ファイルURL（個人勤怠 sheet URL）
  J: 時給  K: 甲乙  L: 扶養人数  M: 外国人  N: パスワード（平文）
  ```
- **認証要件**: P0 は「列 E（名前）と列 N（平文パスワード）の一致」で認証成功とする
- **CSV パーサ要件**: 列 J「時給」が `¥1,200` のようにカンマを含むため、quoted field 対応の CSV パーサが必須
- **Token 互換**: 既存フロントは `{ ok, token, userId, userName, spreadsheetId }` を期待（`apiService.ts` ログイン処理）
- **kintai データ系の API（saveKintai / getMonthlyData 等）は引き続き GAS**: 本計画ではログイン処理だけ脱 GAS

---

## §3 方式の比較

### A. Netlify Function + Google Service Account 直読
- Netlify Function が Google Sheets API v4 経由でプライベート sheet を読む
- 認証は Service Account JSON（Netlify 環境変数に格納）
- メンバーリストはメモリ or Netlify Blobs にキャッシュ

### B. メンバーリストを CSV として **Netlify Blobs に手動アップロード**
- 運用者が必要時に Sheets → CSV エクスポート → `netlify blobs:set` でアップロード
- Function は Blobs から読むだけ
- Sheet は依然 SoT（Source of Truth）。Blobs はそのコピー

### C. メンバーリスト JSON を Netlify 環境変数に格納
- 運用者が CSV → JSON 変換 → 環境変数 1 個に格納
- 199 名 × 1 行 ≒ 30 KB なので Netlify env var (32KB 上限) ギリギリ収まる

### 比較表

| 観点 | A. Service Account | B. Blobs 手動 | C. env var |
|---|---|---|---|
| 初期セットアップ | △（SA 作成 / 共有 / env） | ○ | ◎ |
| 運用（メンバー追加時） | ◎（自動同期） | △（CLI コマンド） | △（env 更新 + 再デプロイ） |
| 速度 | △（API 呼出 200ms + キャッシュ） | ◎（Blobs ~50ms） | ◎（メモリ ~1ms） |
| セキュリティ | ◎ | ◎ | ○（env も保護されるが量が大きい） |
| Sheet が SoT のままか | ◎ | △（Sheet がマスタ、Blobs がコピー） | △（Sheet がマスタ、env がコピー） |
| 実装複雑度 | 中 | 低 | 低 |
| Free 枠制限 | Google API 100req/100s（十分） | Netlify Blobs Free 枠あり | Netlify env 32KB |

### 採用：**A. Service Account JSON キー直読（追加セキュリティ対策 9 項目付き）**

**経緯**: 当初 B 案を推奨したが、パッションから「メンバー増減があるので手動アップロードはクソ」との却下。自動同期を最優先とする A 案に変更。

**SA JSON キー方式の現状認識（重要）**:
- 公式 Google Cloud は **SA JSON キーを「強く非推奨」とし「最終手段」と位置付け**
- 推奨代替は **Workload Identity Federation (WIF)** だが、Netlify Functions に native OIDC トークン発行機能がないため**実装不可**
- 公式は「キーベース認証しか受け付けないサードパーティ連携」は SA キー容認とする立場 ← **本プロジェクトはこれに該当**
- 詳細は `docs/research-gcp-service-account-2026.md`

**追加セキュリティ対策 9 項目（必須実装）**:

| # | 対策 | 必須度 |
|---|---|---|
| 1 | Sheet 単位の閲覧者権限のみ（プロジェクトロール付与禁止） | 必須 |
| 2 | 環境変数管理（git コミット禁止） | 必須 |
| 3 | キーローテーション（90 日ごと） | 推奨 |
| 4 | Cloud Logging で SA 利用ログ監視 | 推奨 |
| 5 | 組織ポリシー `iam.disableServiceAccountKeyCreation` で他 SA の鍵作成禁止 | 任意 |
| 6 | GitHub secret scanning + push protection 有効化 | 必須 |
| 7 | キー漏洩 playbook 作成 | 推奨 |
| 8 | 用途専用 SA（他用途で兼用禁止） | 必須 |
| 9 | 旧キー revoke 後の動作不能確認テスト | 推奨 |

→ Phase 1 セットアップ手順書 (`auth-migration-phase1-setup-guide.md`) で全項目を実装。

**将来 WIF 化の条件**:
- Netlify が native OIDC トークン発行を実装したとき
- アプリ実行環境を Vercel / GitHub Actions / Cloud Run に移す決定があったとき
- ユーザー数が桁違いに増え、セキュリティ要件が引き上げられたとき

---

## §4 不変条件（契約定義 / §3.5.1 falsifiable）

実装前に audit スクリプトで検証可能な形で定義：

| ID | 不変条件 | 検証方法 |
|---|---|---|
| **I1** | 全 199 ユーザーで「名前 + 列 N」入力で 200 + token が返る | audit スクリプトで全行ループ |
| **I2** | 各ユーザーの返却 `userId` は CSV 列 B と一致 | 同上 |
| **I3** | 各ユーザーの返却 `userName` は CSV 列 E と一致 | 同上 |
| **I4** | 各ユーザーの返却 `spreadsheetId` は CSV 列 I の URL から抽出した ID と一致 | 同上 |
| **I5** | 名前一致 + パスワード**不一致**で 401 + token なし | 攻撃テスト |
| **I6** | 存在しない名前で 401 + token なし | 攻撃テスト |
| **I7** | 空入力（name 空 / password 空 / 両方空）で 400 | 境界テスト |
| **I8** | 同一トークンで 2 回目以降の API 呼出が認証通過する | session テスト |
| **I9** | Sheet「ウェブに公開」停止後、匿名 CSV URL fetch で 4xx | 公開状態 audit |
| **I10** | Netlify Function の応答時間 warm < 1s（メンバー数 199 件において） | perf audit |
| **I11** | フロント `apiService.login()` の戻り値が GAS 時代と互換（`{ success, error? }`） | 型互換テスト |
| **I12** | 列 N 平文パスワード以外の機密列（C salt, D hash, F 電話, H 住所等）はレスポンスに**含まれない** | レスポンス漏洩監査 |

---

## §5 Phase 構成

### Phase 0: 準備（実装ゼロ）
1. 本計画にパッション署名を得る（§9 署名欄）
2. 不変条件 I1–I12 へのレビュー・追加要件確認
3. メンバー追加頻度の確認（B 案維持の前提条件）

### Phase 1: 環境セットアップ（運用者作業中心）
1. **Sheet「ウェブに公開」停止**（パッション実施）
2. **CSV を Sheet からダウンロード**（パッション実施）
3. CSV を Netlify Blobs にアップロード:
   ```
   netlify blobs:set kintai-config members.csv --input=./members.csv
   ```
4. Netlify Function ローカルから Blobs アクセスできるか smoke test
5. **Phase 1 Gate**: smoke test pass → Phase 2 へ

### Phase 2: Netlify Function 実装
1. 新ファイル `netlify/functions/auth-login.cjs` 作成
2. ロジック:
   ```
   ① Blobs から members.csv を取得
   ② quoted-field 対応 CSV パース
   ③ 列 E === payload.name を全行 scan（199 行 → O(n)、199 件なら数 ms）
   ④ ヒットなければ 401
   ⑤ 列 N === payload.password 比較（タイミング攻撃対策に crypto.timingSafeEqual）
   ⑥ ミスマッチで 401
   ⑦ token 生成（HMAC-SHA256 with NETLIFY_AUTH_SECRET、payload に userId/exp）
   ⑧ 返却 {ok, token, userId, userName, spreadsheetId}
   ```
4. Netlify env var `NETLIFY_AUTH_SECRET` を Netlify UI で設定（HMAC 鍵）
5. ローカルで curl 動作確認

### Phase 3: Frontend 切替
1. `src/utils/apiService.ts` の `login()` 内で `callGAS("login", ...)` 呼出を `/.netlify/functions/auth-login` 直叩きに変更
2. レスポンス形状 `{ ok, token, userId, userName, spreadsheetId }` は同一仕様で吸収
3. Token をその後の GAS 呼出に引き続き使えるようにするには？ → **要設計判断**（§7 に再掲）

### Phase 4: 検証 (audit 全緑判定)
1. audit スクリプト `scripts/audit-auth-migration.mjs` 作成
   - I1–I12 を機械判定
2. 全 199 ユーザーで I1–I4 を実行
3. 攻撃ケース I5–I7 を実行
4. 公開停止確認 I9 を実行
5. レスポンス漏洩監査 I12 を実行
6. 期待値: **全 audit 緑（delta = 0）**
7. 結果を `docs/evidence/auth-migration/phase-4/` 配下にコミット

### Phase 5: ロールアウト
1. 本ブランチ → main マージ
2. Netlify 本番デプロイ
3. 本番 smoke test（管理者 1 名でログイン）
4. 段階的に他ユーザーへ周知

---

## §6 検証定義（成功とは何か）

| 観点 | 期待値 | 計測方法 |
|---|---|---|
| 機能 | 全 199 ユーザー login 成功 | audit スクリプト exit=0 |
| セキュリティ | CSV public 不可 | 匿名 curl で 4xx |
| 性能 | warm < 1s | k6 or curl `time_total` で 10 連続平均 |
| 互換性 | フロント `login()` 戻り値の型変更ゼロ | tsc --noEmit pass |
| 漏洩 | レスポンスに salt/hash/電話等を含まない | I12 audit |

---

## §7 オープン質問（パッション判断待ち）

### Q1. 方式選択 — ✅ **確定: 案 A（SA キー + 追加対策 9 項目、Netlify 継続）**

### Q2〜Q6 — ✅ **確定: 全て推奨デフォルト**

- **Q2 Token 互換**: (α) Netlify と GAS で**共有秘密鍵 HMAC-SHA256** で検証
- **Q3 パスワード照合**: 平文列 N で開始（hash 移行は P2 別計画）
- **Q4 GAS handleLogin**: 残す（緊急 fallback。frontend からは呼ばない）
- **Q5 メンバー追加運用**: SA 経由で**変更直後反映**（特別フローなし）
- **Q6 ロールアウト**: 内部 199 ユーザーなので**一斉切替**

承認日: 2026-05-06、承認者: パッション

### Q2. Token と GAS 呼出の関係
ログイン後、`saveKintai` 等は引き続き GAS を叩く。GAS 側 `Auth.checkToken` は Netlify が発行した HMAC token を検証できない。選択肢:
- **(α)** Netlify と GAS で**共有秘密鍵**を持ち、両者で同じ HMAC 検証する（GAS にも `NETLIFY_AUTH_SECRET` を共有）
- **(β)** ログイン時に Netlify と GAS の両方でトークン発行 → フロントは両方保持して使い分ける（複雑）
- **(γ)** GAS 側のトークン検証を「**信用する**」（GAS 側 `Auth.checkToken` を bypass する設計に変更、認証は Netlify のみで実施）→ GAS 側は token を**ユーザー識別情報**としてのみ使う
- **推奨**: (α)。シンプルで安全

### Q3. 平文パスワード列 N について
P0 は「列 E + 列 N」で照合（最速実装）。これでよいか？
- 別案: 最初から hash 照合に移行する（P2 を P0 に統合）→ 工数増だが移行回数削減

### Q4. 既存 GAS の handleLogin の扱い
新フロー稼働後、GAS 側 `Auth.handleLogin` は呼ばれなくなる。残すか、削除するか？
- **推奨**: 残す（緊急 fallback として）。ただし frontend からは呼ばない

### Q5. メンバー追加・変更時の運用フロー
B 案採用の場合の運用手順を文書化する必要あり。誰が・いつ・どう更新するか？

### Q6. ロールアウト戦略
全員一斉切替か、フィーチャーフラグで段階切替か？

---

## §8 リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Blobs に古い CSV がある | 退職者が login できる | 運用フロー徹底（更新時に必ず差分確認） |
| HMAC 秘密鍵漏洩 | 全ユーザー impersonate | Netlify env var で保護、定期ローテーション |
| CSV パーサバグで列ずれ | 認証失敗 / 漏洩 | papaparse 等の枯れたライブラリ使用 + 列数 14 の不変条件 audit |
| Phase 3 切替時の不整合 | 一部ユーザーが login 不可 | Feature flag で段階的切替 |
| Token 互換問題 | kintai 操作不可 | Q2 の方式 (α) で事前合意 + 統合テスト |
| メンバー数増加で 199 → 数千 | スキャン遅延 | Index 化 / Map 化（Phase 2 で初期実装に含める） |

---

## §9 意味論合意書（パッション署名欄）

以下に**サインで承認**いただいた上で実装着手します。

```
私 [パッション] は以下に同意します:

[ ] §1 ゴール優先順位（P0–P3）
[ ] §3 推奨方式 B（Netlify Blobs 手動）
    └ 別案 A 希望なら明記:
[ ] §4 不変条件 I1–I12
[ ] §5 Phase 構成
[ ] §7 オープン質問への回答:
    Q1: ___
    Q2: (α) / (β) / (γ)
    Q3: 平文 N で開始 / 最初から hash
    Q4: 残す / 削除
    Q5: 運用フロー文書を別途作成
    Q6: 一斉 / 段階

サイン: ___________  日付: ___________
```

---

## §10 次のステップ

**実装着手前にパッションの判断が必要**:
1. 上記 §7 Q1–Q6 への回答
2. §9 署名

承認が得られたら以下に進む:
- 新ブランチ `feat/auth-migration-from-gas` を `fix/dev-server-sw-csp` から派生
- Phase 1 環境セットアップ（運用者作業）
- Phase 2 以降の実装（Claude）

承認なき実装着手は**禁止**（CLAUDE.md §3.5 / Anti-Lie）。
