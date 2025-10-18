# UI日本語→英語併記 修正案一覧

目的: 画面上に表示される日本語テキストを「日本語 / 英語」併記へ統一するための提案集です。各項目は元の日本語と、画面に表示する併記案（日本語 / English）のペアを記載しています。

---

## components/Header.tsx
- 勤怠管理 → 勤怠管理
- ログアウト → Logout
- 日次入力 → 日次入力 / Daily
- 月次ビュー → 月次ビュー / Monthly


## components/MonthlyView.tsx
- 更新 → Refresh
- 更新中... → 更新中... / Refreshing...
- 勤務日数: → Working Days:
- {calculateWorkingDays()}日 → {calculateWorkingDays()}日 / Days
- 総勤務時間: → Total Time:
- テーブル見出し「日付」→ Date
- テーブル見出し「出勤」→ In
- テーブル見出し「退勤」→ Out
- テーブル見出し「休憩」→ Break
- テーブル見出し「勤務時間」→ Work Time
- テーブル見出し「勤務場所」→ Task
- データを読み込み中... → データを読み込み中... / Loading data...
- この月のデータはありません → この月のデータはありません / No data for this month
- 曜日表示（例: （日））→ (Sun), (Mon), (Tue), (Wed), (Thu), (Fri), (Sat)

## components/KintaiForm.tsx
- 📅 データを読み込み中... → 📅 データを読み込み中... / Loading data...
- ⚠️ {EDITABLE_DAYS}日以上前の日付は編集できません → ⚠️ {EDITABLE_DAYS}日以上前の日付は編集できません / Dates older than {EDITABLE_DAYS} days cannot be edited
- 出勤時間（ラベル）→ 出勤時間 / Clock‑in Time
- 休憩時間（ラベル）→ 休憩時間 / Break Time
- 退勤時間（ラベル）→ 退勤時間 / Clock‑out Time
- 勤務時間（ラベル）→ 勤務時間 / Working Time
- 勤務場所（ラベル）→ 勤務場所 / Work Location
- セレクト「未選択」→ 未選択 / Not selected
- 勤務場所の選択肢「田んぼ」→ 田んぼ / Rice field
- 勤務場所の選択肢「柿農園」→ 柿農園 / Persimmon farm
- 勤務場所の選択肢「事務所」→ 事務所 / Office
- 勤務場所の選択肢「その他」→ その他 / Other
- エラー「勤務場所を選択してください」→ 勤務場所を選択してください / Please select a work location
- エラー「退勤時間は出勤時間より後にしてください」→ 退勤時間は出勤時間より後にしてください / End time must be after start time
- エラー「エラーが発生しました」→ エラーが発生しました / An error occurred
- エラー「保存中にエラーが発生しました」→ 保存中にエラーが発生しました / An error occurred while saving
- ボタン「保存する」→ 保存する / Save
- ボタン「削除」→ 削除 / Delete
- ボタン「キャンセル」→ キャンセル / Cancel
- 削除確認「データを削除しますか？」→ データを削除しますか？ / Delete this data?
- 削除説明「出勤時間、休憩時間、退勤時間、勤務場所のデータが削除されます。」→ 出勤時間、休憩時間、退勤時間、勤務場所のデータが削除されます。 / Clock‑in, break, clock‑out, and location data will be deleted.
- ステータス「編集不可（{EDITABLE_DAYS}日以上前）」→ 編集不可（{EDITABLE_DAYS}日以上前） / Not editable (older than {EDITABLE_DAYS} days)
- ステータス「入力済み 長押しで編集」→ 入力済み（長押しで編集） / Entered (long‑press to edit)

## components/MobileDatePicker.tsx
- 日付（ラベル）→ 日付 / Date
- 前日（aria）→ 前日 / Previous day
- 翌日（aria）→ 翌日 / Next day
- 日付表示（例: 2025/06/14（日））→ 2025/06/14（日） / 2025/06/14 (Sun)

## components/MobileBreakPicker.tsx
- 休憩時間（ラベル）→ 休憩時間 / Break Time
- 未入力（option）→ 未入力 / Not entered

## components/drumtimepicker.tsx
- 未入力（値表示）→ 未入力 / Not entered
- 時（列ラベル）→ 時 / Hours
- 分（列ラベル）→ 分 / Minutes
- 確定（ボタン）→ 確定 / Confirm

## components/Login.tsx
- ログイン（見出し・ボタン）→ ログイン / Login
- ログイン中... → ログイン中... / Logging in...
- 名前（ラベル）→ 名前 / Name
- パスワード（ラベル）→ パスワード / Password
- エラー「名前とパスワードを入力してください」→ 名前とパスワードを入力してください / Please enter name and password
- エラー「ログインに失敗しました」→ ログインに失敗しました / Login failed
- エラー「通信エラーが発生しました」→ 通信エラーが発生しました / Network error occurred

## components/InstallPromptBanner.tsx
- インストール手順（aria）→ インストール手順 / Install Guide
- ホーム画面に追加（見出し・ボタン・aria）→ ホーム画面に追加 / Add to Home Screen
- Safariの共有ボタンから「ホーム画面に追加」を選択してください。→ Safariの共有ボタンから「ホーム画面に追加」を選択してください。 / From Safari’s Share button, select “Add to Home Screen”.
- 閉じる（ボタン）→ 閉じる / Close
- インストール（title）→ インストール / Install
- 手順を表示（title）→ 手順を表示 / Show guide

## main.tsx
- 新しいバージョンが利用可能です。ページを更新しますか？ → 新しいバージョンが利用可能です。ページを更新しますか？ / A new version is available. Reload the page?

---

備考:
- 「日本語 / 英語」併記の統一ルール: ラベルやボタンは「日本語 / English」、メッセージは原文を保ちつつ末尾に英語補足を付ける方針を推奨。
- 動的値（{EDITABLE_DAYS}など）は英語側にも同じプレースホルダで表記しています。
- 記載のない日本語はコメントやログ出力など画面非表示のものです（対象外）。