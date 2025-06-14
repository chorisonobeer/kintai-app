# Androidブラウザキャッシュ問題解決戦略

## 問題の概要
Androidブラウザで古いバージョンのデプロイが表示され、最新バージョンに更新されない問題を解決するための多層的なキャッシュ制御戦略を実装しました。

## 実装した解決策

### 1. HTTPヘッダーレベルでのキャッシュ制御

**ファイル**: `netlify.toml`

- **HTML/JS/JSONファイル**: 完全にキャッシュを無効化
  ```
  Cache-Control: no-cache, no-store, must-revalidate, max-age=0
  Pragma: no-cache
  Expires: 0
  ETag: off
  ```

- **静的アセット**: 長期キャッシュ（変更時にファイル名が変わるため安全）
  ```
  Cache-Control: public, max-age=31536000, immutable
  ```

### 2. Service Workerによるバージョン管理

**ファイル**: `public/sw.js`

- **自動バージョンチェック**: 30秒間隔でバージョン情報を確認
- **キャッシュ強制更新**: 新バージョン検出時に全キャッシュを削除
- **ユーザー通知**: 新バージョン利用可能時にリロードを促す

```javascript
// バージョンチェック機能
async function checkForUpdates() {
  const response = await fetch('/version.json?t=' + Date.now(), {
    cache: 'no-cache',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
  
  const versionData = await response.json();
  const storedVersion = await caches.match('/version.json');
  
  if (versionData.buildTime !== storedVersionData.buildTime) {
    // 新バージョン検出 → キャッシュクリア
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }
}
```

### 3. アプリケーションレベルでのバージョン管理

**ファイル**: `src/main.tsx`

- **Service Worker登録**: アプリ起動時に自動登録
- **メッセージ監視**: Service Workerからの更新通知を受信
- **可視性変更監視**: ページがアクティブになった時にバージョンチェック

```javascript
// ページの可視性変更時にバージョンチェック
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    fetch('/version.json?t=' + Date.now(), {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
  }
});
```

### 4. HTMLメタタグによるキャッシュ制御

**ファイル**: `index.html`

```html
<!-- 強化されたキャッシュ制御メタタグ -->
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate, max-age=0">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="cache-control" content="no-cache">
<meta name="expires" content="0">
<meta name="pragma" content="no-cache">

<!-- バージョン管理用メタタグ -->
<meta name="app-version" content="1.0.0">
<meta name="build-time" content="2025-06-13T03:42:05.002Z">
```

### 5. ビルド時のバージョン情報更新

**ファイル**: `vite.config.ts`

- **自動バージョン更新**: ビルド時に`version.json`と`index.html`のビルド時刻を更新
- **一意性保証**: 各デプロイで異なるタイムスタンプを生成

```javascript
function updateVersionPlugin() {
  return {
    name: 'update-version',
    buildStart() {
      const buildTime = new Date().toISOString();
      // version.jsonとindex.htmlの__BUILD_TIME__を置換
    }
  };
}
```

## 動作フロー

1. **初回アクセス**:
   - Service Worker登録
   - バージョン情報をキャッシュに保存

2. **定期チェック**:
   - 30秒間隔でバージョンチェック
   - ページアクティブ時にもチェック

3. **新バージョン検出**:
   - 全キャッシュを削除
   - ユーザーに更新通知
   - 確認後にページリロード

4. **Androidブラウザ対策**:
   - 複数レイヤーでのキャッシュ制御
   - 強制的なネットワークリクエスト
   - タイムスタンプによるキャッシュバスティング

## 確実性の保証

- **HTTPヘッダー**: サーバーレベルでキャッシュを制御
- **Service Worker**: ブラウザレベルでキャッシュを管理
- **メタタグ**: HTMLレベルでキャッシュを制御
- **タイムスタンプ**: URLパラメータでキャッシュを回避

## 使用方法

1. **デプロイ**: `npm run build`でビルド（自動でバージョン更新）
2. **確認**: ブラウザの開発者ツールでService Workerとキャッシュの状態を監視
3. **テスト**: 新しいデプロイ後、Androidブラウザで更新が反映されることを確認

## トラブルシューティング

- **Service Workerが動作しない**: ブラウザの開発者ツールでService Workerタブを確認
- **キャッシュが残る**: 手動でブラウザキャッシュをクリア
- **バージョンチェックが失敗**: ネットワーク接続とCORSポリシーを確認