# 動作調査結果

## アプリ概要
- React + TypeScript 製の勤怠入力アプリ。src/App.tsx で BrowserRouter を用い、/login・/・/monthly の 3 ルートを提供。KintaiProvider が勤怠データ取得とキャッシュを司り、認証済みかどうかは ProtectedRoute で判定。
- ブラウザ起動時に initializeServiceWorker を実行し、Service Worker 登録とバックグラウンド同期登録・バージョン更新通知のリスナーを初期化。

## 認証とデータ取得
- src/utils/apiService.ts に GAS/Netlify Functions との通信処理を集約。login でトークン・ユーザー情報を localStorage に保存し、logout でクリア。isAuthenticated が ProtectedRoute やフォーム初期化で参照される。
- 勤怠保存は saveKintaiToServer が担当し、成功後に clearMonthlyDataCache を呼んで月次データの再取得を促す。getMonthlyData は sessionStorage に 30 分間キャッシュしてリクエストを抑制。
- KintaiContext (src/contexts/KintaiContext.tsx) が月次データを取得し、ntryStatusManager に展開して「入力済み/未入力」の状態を端末側に保持。年月変更や efreshData 呼び出しで再取得する。

## 画面別の挙動
- ログイン画面 (src/components/Login.tsx) は氏名とパスワードを入力、未入力や API エラー時に日本語メッセージを表示。
- 日次入力画面 (src/components/KintaiForm.tsx)
  - MobileDatePicker で過去 20 日 (EDITABLE_DAYS) までの日付を選択。古い日付は警告を表示し、保存ボタンを無効化。
  - MobileTimePicker/MobileBreakPicker で時刻を入力すると calculateWorkingTime が自動で労働時間を再計算。
  - 保存済みデータは長押し (1 秒) で編集モードに切り替え。保存時は saveKintaiToServer → efreshData を呼んで一覧を更新。削除は入力値をクリアするローカル動作。
  - ロケーション必須、開始≦終了のバリデーション結果を画面に表示。
- 月次一覧 (src/components/MonthlyView.tsx)
  - 前月/翌月ボタンで年月を切替、efreshData ボタンで強制再取得。
  - 月間稼働日数と総労働時間を算出し表示。テーブルは曜日ごとに土日を色分け、データがなければメッセージを表示。
- Header (src/components/Header.tsx) はログアウトボタンとタブナビゲーションを提供。バージョン更新中は進捗バーを表示し、タイトル長押しでバージョンモーダル、タップで DeployInfoModal を開きビルド情報を確認可能。

## バックグラウンド動作・オフライン対応
- ackgroundSyncManager (src/utils/backgroundSync.ts) が定期同期のスケジューリングとリトライ制御、オンライン/オフライン検知を担当。Service Worker からの PERFORM_SYNC 要求を受けて manualSync を呼び出す設計。
- Service Worker (public/sw.js) は初回 install で主要アセットをキャッシュし、/version.json のタイムスタンプ比較で新ビルドを検知。新バージョン時は全キャッシュ削除後、クライアントへ NEW_VERSION_AVAILABLE を送信しリロードを促す。fetch ハンドラでオフライン時はキャッシュを返却。バックグラウンド同期タグ登録や push 通知の下地も備える。
- クライアント (App.tsx・src/main.tsx) 側は Service Worker からの VERSION_UPDATE_*/NEW_VERSION_AVAILABLE/PERFORM_SYNC メッセージを監視して UI の進捗表示や手動同期を実行。

## テスト・運用補助
- src/test/entryStatusTest.ts にはブラウザコンソールから window.entryStatusTest.runAllTests() を実行する手動テストセットがあり、入力判定ロジックとキャッシュ整合性を検証可能。
- DeployInfoModal は環境変数 (VITE_*) からデプロイ情報を表示し、デバッグ用途でのみ利用する注記付き。

以上の通り、ログイン後に日次勤怠入力と月次一覧確認ができ、Service Worker とバックグラウンド同期でオフライン時の整合性とバージョン更新検知を行う構成になっている。
