# Googleスプレッドシートから「勤務場所・仕事内容」を取得する実装の検討

## 結論
- 実現可能です。
- 既存のGAS経由のAPI呼び出しとフロントエンド構成（`apiService.ts` の `callGAS`、Netlify Functions の中継）を活用し、対象シートの A 列を読み込む新アクションを追加すれば、`KintaiForm.tsx` の `<select>` を動的に差し替えできます。
- 推奨アプローチは「GAS に新しいアクション（例: `getLocationOptions`）を追加」→「フロント側で `apiService.ts` に取得関数を追加」→「`KintaiForm.tsx` で初回ロード時に取得・キャッシュして `<option>` を生成」です。

## 対象
- 取得元シート: `https://docs.google.com/spreadsheets/d/1XF8QIoudGmRSYavHZ4CkZQjlEUlaaEULxcuWZVOlIuE/edit?gid=55512795#gid=55512795`
- 取得範囲: A 列（ヘッダ除外、空行除外、重複除外を推奨）
- 表示先: `KintaiForm.tsx` の「勤務場所・仕事内容」選択（現在は固定 `<option>`）

## 現状構成の把握（要点）
- フロント→GAS呼び出しは `src/utils/apiService.ts` の `callGAS` を利用。
  - 開発: `DEV_PROXY_URL = "/api/gas"`
  - 本番: `FUNC_URL = "/.netlify/functions/kintai-api"`
  - 認証用 `token`、`spreadsheetId`、`userId` は `localStorage` に保存。
- Netlify Functions (`netlify/functions/kintai-api.cjs`) は GAS WebApp を中継。
- GAS (`GAS/Code.gs`) は `action` の `switch` で各処理を分岐。現在 `getMonthlyData` 等があり、同様にアクション追加が容易です。
- `KintaiForm.tsx` の該当箇所は `<select>` に固定オプション（「田んぼ」「柿農園」「事務所」「その他」）を直書き。

## 実現アプローチ（選択肢）
- A: GAS に `getLocationOptions` を追加して A 列配列を返す（推奨）
  - 長所: 既存の認証・中継機構に乗る。シートが公開不要。権限管理が容易。
  - 短所: GASの軽微な改修が必要。
- B: シートを Web 公開し、`gviz/tq` の JSON 形式で直接取得（公開設定が必要）
  - 長所: サーバ改修不要。
  - 短所: 公開前提（情報公開リスク）、CORS・形式解析の調整が必要。
- C: Google Sheets API＋OAuth（フロントまたはサーバ）
  - 長所: 標準APIで柔軟。
  - 短所: 実装コスト・認可フローが重い。既存構成と合わない。

結論として、A（GASアクション追加）が最も安全・低コストで既存設計にフィットします。

## 推奨アプローチの具体案

### GAS側（`Code.gs`）
1) `doPost` の `switch(action)` に `getLocationOptions` を追加。
2) 実装は指定 `spreadsheetId` と `sheetGid`（= 55512795）から対象シートを取得し、A列を配列で返却。

例（イメージコード）:
```gs
function handleGetLocationOptions(payload, token, debug, diagInfo) {
  try {
    const spreadsheetId = payload.spreadsheetId;
    const targetGid = Number(payload.sheetGid); // 55512795

    // 認証検証（必要に応じて token → ユーザ検証を行う）

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheets().find(s => s.getSheetId() === targetGid);
    if (!sheet) {
      return Utils.createResponse({ ok: false, err: '対象シートが見つかりません' });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return Utils.createResponse({ ok: true, data: [] });
    }

    // A2:A から値を取得（A1はヘッダ想定）
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const list = values
      .map(r => String(r[0]).trim())
      .filter(v => v && v !== '');

    // 重複除去
    const uniq = Array.from(new Set(list));

    return Utils.createResponse({ ok: true, data: uniq });
  } catch (e) {
    return Utils.createResponse({ ok: false, err: String(e) });
  }
}

// doPost の router 例
switch (parsedRequest.action) {
  // ...既存...
  case 'getLocationOptions':
    return handleGetLocationOptions(parsedRequest.payload, parsedRequest.token, parsedRequest.debug, diagInfo);
}
```

### フロントエンド側（`apiService.ts` / `KintaiForm.tsx`）
- `apiService.ts` に取得関数を追加：
```ts
export async function getLocationOptions(): Promise<string[]> {
  const spreadsheetId = localStorage.getItem('kintai_spreadsheet_id');
  const r = await callGAS<string[]>(
    'getLocationOptions',
    { spreadsheetId, sheetGid: 55512795 },
    true
  );
  return (r.data as string[]) || [];
}
```
- `KintaiForm.tsx` に `locationOptions` state を追加し、初回レンダリングまたは編集開始時に取得。`sessionStorage` などにキャッシュ（例: TTL 30分）。
- `<select>` の固定 `<option>` を動的配列で置換。先頭に `未選択`、末尾に `その他` を残すなどのUIポリシーを維持可能。
- 取得失敗時は固定リストにフォールバック＆簡易エラーメッセージ表示。

### 権限・公開設定
- シートが公開不要でも GAS から `openById` で参照可能であることが前提。
- GAS スクリプトの実行ユーザ（デプロイ設定）に参照権限が必要。
- クライアントから `spreadsheetId` を渡す設計の場合、IDはURLに含まれるため秘匿性は低いが、読み取り可否は GAS 側権限で制御されるため問題は限定的。
- 固定の別シートを使う場合は GAS 側にハードコードまたはプロパティストアで管理も可。

### キャッシュとエラー処理
- `sessionStorage` に `location_options` を保存し、TTL（例: 30分）を設けて再取得を抑制。
- ネットワークエラー時は固定オプションにフォールバックし、目立たないトーストやメッセージで通知。
- 重複リクエスト防止は既存の `pendingRequests` と相性が良い（`callGAS` 内で処理済）。

### 代替案の比較
- 直接取得（`gviz/tq`）: 公開が必要・CORS/パース注意。迅速だが情報公開リスク。
- Sheets API: OAuth導入・運用が重い。柔軟だが本プロジェクトの簡潔な構成に合致しない。

## リスクと対策
- シート構造変更（A列が別用途に変更）→ GAS側で列名・ヘッダ検証とバリデーションを追加。
- 取得対象が大量（数百〜数千）→ 一定件数上限、プレフィックス検索などUI最適化（必要なら `<select>` を `typeahead` 化）。
- 権限不足（GASが参照不可）→ シートの共有設定/スクリプトの実行ユーザ権限を確認・修正。

## 作業見積もり（目安）
- GAS改修（新アクション追加・テスト）: 0.5〜1.0 時間
- フロント改修（API追加・`KintaiForm` 差し替え・キャッシュ）: 1.0〜1.5 時間
- 動作確認（開発サーバでUI確認・フォールバック確認）: 0.5 時間
- 合計: 約 2〜3 時間

## 次アクション
1) GAS に `getLocationOptions` を追加・デプロイ。
2) `apiService.ts` に取得関数追加。
3) `KintaiForm.tsx` の `<select>` を動的配列に差し替え（初回ロードで取得＋キャッシュ＋フォールバック）。
4) 開発サーバで UI を確認し、想定通り A 列の値が表示されることを検証。