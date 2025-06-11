# Join画面 サーバー名検索時の詳細デバッグフロー

`join-flow.md` で説明した処理フローにおいて、実際にどのようなデータが送受信され、どこでエラーが発生しているかを特定するための具体的なデバッグ手順を以下に示します。

提供されたエラーログの画像からは、主にCORS (Cross-Origin Resource Sharing) ポリシー違反によって、ブラウザからGoogle Apps Scriptへのリクエストがブロックされていることが読み取れます。この問題を解決するためには、リクエストとレスポンスのヘッダー情報を詳細に確認する必要があります。

## 1. ブラウザのデベロッパーツールでの確認

最も直接的な情報を得られるのは、ブラウザのデベロッパーツールです。

1.  **デベロッパーツールを開く**: Chromeであれば、画面を右クリックして「検証」を選択するか、`F12`キーを押します。
2.  **「ネットワーク」タブを選択**: ネットワークリクエストのログが表示されます。
3.  **操作を実行**: Join画面でサーバー名（例: `apple`）を入力し、「サーバーを検索」ボタンをクリックします。
4.  **リクエストの確認**: 「ネットワーク」タブに複数のリクエストが表示されます。エラーが発生しているリクエスト（赤字で表示されることが多い）や、`master-config` または `script.googleusercontent.com` へのリクエストを探します。
    *   **プリフライトリクエスト (OPTIONS)**: CORSが関わる場合、実際のPOSTリクエストの前にOPTIONSメソッドによるプリフライトリクエストが送信されることがあります。このリクエストとレスポンスヘッダー（特に `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`）を確認してください。
    *   **実際のリクエスト (POST)**: プリフライトが成功した後、実際のPOSTリクエストが送信されます。このリクエストの「ヘッダー」タブで以下を確認します。
        *   **リクエストURL**: 正しいエンドポイント (`/.netlify/functions/master-config-api` または開発時は `/api/master-config`、そしてそれがリダイレクトされて `script.googleusercontent.com/...`) になっているか。
        *   **リクエストメソッド**: `POST` になっているか。
        *   **リクエストヘッダー**: `Content-Type: application/json` など、期待されるヘッダーが含まれているか。
        *   **リクエストペイロード (リクエストボディ)**: 「ペイロード」タブ（または「ソース」タブなど、ブラウザによって名称が異なる場合があります）で、送信されているJSONデータ（例: `{"action":"findCustomerByCode","payload":{"customerCode":"apple"},"debug":true}`）が正しいか確認します。
    *   **レスポンスヘッダー**: サーバーからのレスポンスヘッダーを確認します。特に `Access-Control-Allow-Origin` ヘッダーが重要です。エラーメッセージに「No 'Access-Control-Allow-Origin' header is present on the requested resource」とある場合、このヘッダーがGASまたはNetlify Functionのレスポンスに含まれていないか、値が期待するものと異なっている可能性があります。
    *   **レスポンスボディ**: 「レスポンス」タブまたは「プレビュー」タブで、サーバーからの実際のレスポンス内容を確認します。エラーメッセージや、期待しないデータが返ってきていないか確認します。
5.  **「コンソール」タブの確認**: CORSエラーに関する詳細なメッセージや、JavaScriptの実行時エラーが表示されている可能性があります。

## 2. Netlify Function のログ確認

Netlify Function (`master-config-api.cjs`) は、フロントエンドとGoogle Apps Scriptの中継役です。ここでのログを確認することで、GASへのリクエスト内容やGASからのレスポンスを把握できます。

1.  **Netlifyにログイン**: [Netlify](https://app.netlify.com/) にアクセスし、該当のサイトを選択します。
2.  **「Functions」メニューへ移動**: サイドバーから「Functions」を選択します。
3.  **該当のFunctionを選択**: `master-config-api` (または実際のFunction名) を選択します。
4.  **ログを確認**: Functionの実行ログが表示されます。`master-config-api.cjs` には詳細なデバッグログ (`console.log`) が仕込まれているため、以下の情報を確認できるはずです。
    *   受信したリクエストボディ (`event.body`)
    *   GASに送信するリクエストオプションとデータ
    *   GASからのレスポンスステータスコードとボディ
    *   フロントエンドに返すレスポンスヘッダーとボディ

    特に、GASからのレスポンスに `Access-Control-Allow-Origin` が含まれているか、またその値が正しいかを確認してください。Netlify Function側でこのヘッダーを正しく設定し直しているかもポイントです。

## 3. Google Apps Script のログ確認

最終的な処理を行うGoogle Apps Script (`MasterConfig.gs`) のログも重要です。

1.  **Apps Scriptエディタを開く**: Google Driveなどから該当のApps Scriptプロジェクトを開きます。
2.  **「実行数」メニューへ移動**: 左側のメニューから「実行数」を選択します。
3.  **ログを確認**: `doPost` 関数や `findCustomerByCode` 関数の実行ログが表示されます。`console.log` で出力した内容を確認できます。
    *   受信したPOSTデータ (`e.postData.contents`)
    *   パースされたパラメータ (`params.action`, `params.payload.customerCode`)
    *   スプレッドシート検索の結果
    *   返却するJSONレスポンスの内容

    GAS側で `ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON)` を使ってレスポンスを作成する際に、CORS関連のヘッダーを適切に設定しているか（`doOptions` 関数や `doPost` 関数のレスポンスヘッダー設定部分）を確認してください。
    `MasterConfig.gs` の `doOptions` 関数と `doPost` 関数の末尾にある `JSON.stringify(response)` の前に、以下のようなヘッダー設定があるはずです。

    ```javascript
    // 例: MasterConfig.gs の doPost の最後の方
    return ContentService.createTextOutput(JSON.stringify(output))
        .setMimeType(ContentService.MimeType.JSON)
        .withHeaders({
            'Access-Control-Allow-Origin': '*' // または特定のオリジン
            // 他の必要なCORSヘッダー
        });
    ```
    この `'Access-Control-Allow-Origin'` の設定が正しいか、あるいはNetlify Function側で上書きされている場合はそちらの設定が正しいかを確認します。

これらの手順で情報を収集することで、どの段階で問題が発生しているのか、具体的にどのようなデータが期待と異なっているのかを特定できるはずです。