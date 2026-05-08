// CACHE_NAME はビルド時に scripts/set-build-time.js で自動バンプされる
const CACHE_NAME = 'kintai-app-mowb1fao';
// バージョン自動チェック: ドキュメント取得毎に実施

// Google Fonts は install ブロッキングから除外（FOUT許容、runtime cache に任せる）
// fonts.googleapis.com の install失敗で shell全体のキャッシュが飛ぶ事故を防ぐ
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/version.json'
];

// インストール時のキャッシュ（個別 put + allSettled で1つの失敗が全体に波及しない）
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        urlsToCache.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((r) => (r && r.ok ? cache.put(url, r) : null))
            .catch(() => null)
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        console.warn('[SW] install: some urls failed:', failed);
      }
    })
  );
  // 新SWをすぐに有効化
  self.skipWaiting();
});

// バージョンチェック関数（毎回チェック）
async function checkForUpdates() {
  try {
    const now = Date.now();
    const response = await fetch('/version.json?t=' + now, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      return { status: 'error' };
    }

    const versionData = await response.json();
    const storedVersion = await caches.match('/version.json');
    const storedVersionData = storedVersion ? await storedVersion.json() : null;

    // 初回または新バージョン検出
    if (!storedVersion || (storedVersionData && versionData.buildTime !== storedVersionData.buildTime)) {
      return { status: 'update_available', version: versionData };
    }

    return { status: 'latest', version: storedVersionData || versionData };
  } catch (error) {
    console.error('Version check failed:', error);
    return { status: 'error' };
  }
}

// フェッチ時のキャッシュ戦略
self.addEventListener('fetch', (event) => {
  // chrome-extension や unsupported スキームをスキップ
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // 以下のリクエストは SW で一切手を出さず、ブラウザのデフォルトに任せる:
  // - GET 以外（POST/PUT/DELETE は API 呼び出し。キャッシュ不可、傍受で壊れる）
  // - 別オリジン（GAS / fonts / 解析サービス等。CSP/CORS の問題を回避）
  // - Netlify Functions（API。SWR/キャッシュは apiService 側で管理）
  // - Vite HMR / dev サーバー専用パス
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;
  if (reqUrl.pathname.startsWith('/.netlify/')) return;
  if (reqUrl.pathname.startsWith('/api/')) return;
  // Vite dev サーバーのモジュール提供パスは一切 intercept しない
  // (キャッシュすると HMR/編集後の最新モジュールがブラウザに届かなくなる)
  if (reqUrl.pathname.startsWith('/@vite/')) return;
  if (reqUrl.pathname.startsWith('/@react-refresh')) return;
  if (reqUrl.pathname.startsWith('/@id/')) return;
  if (reqUrl.pathname.startsWith('/@fs/')) return;
  if (reqUrl.pathname.startsWith('/node_modules/')) return;
  if (reqUrl.pathname.startsWith('/src/')) return;
  if (reqUrl.search.includes('?import') || reqUrl.search.includes('?t=')) return;

  // HTMLリクエストはネットワーク優先 + バージョンチェック
  if (event.request.destination === 'document') {
    event.respondWith(
      (async () => {
        // 起動時の手動チェックに委ねる（ここではバージョンチェックを実行しない）
        try {
          const network = await fetch(event.request, { cache: 'no-store' });
          // 最新をキャッシュへ保存（失敗は無視）
          const copy = network.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
          return network;
        } catch (e) {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || caches.match('/index.html');
        }
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュにあればそれを返す
        if (response) {
          return response;
        }

        // キャッシュになければネットワークから取得
        return fetch(event.request)
        .then(
          (response) => {
            // レスポンスが無効な場合はそのまま返す
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // レスポンスをクローンしてキャッシュに保存
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              })
              .catch((error) => {
                console.warn('キャッシュ保存に失敗:', error);
              });

            return response;
          }
        );
      })
      .catch(async () => {
        // オフライン時のフォールバック
        if (event.request.destination === 'document') {
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
        }
        // Response を必ず返す（undefined を返すと "Failed to convert value to 'Response'" になる）
        return Response.error();
      })
  );
});

// アクティベート時: kintai-app- プレフィックスのうち現行でないものだけ削除
// （他オリジンのSW等で作成されたキャッシュとの衝突を避けるためプレフィックス限定）
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('kintai-app-') && cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// バックグラウンド同期の設定
const SYNC_TAG = 'kintai-background-sync';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5分
let syncTimer = null;

// バックグラウンド同期の登録
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event.tag);
  
  if (event.tag === SYNC_TAG) {
    event.waitUntil(performBackgroundSync());
  }
});

// 定期同期スケジューラー
function schedulePeriodicSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  
  syncTimer = setTimeout(() => {
    // Service Worker内では直接的なAPIコールは制限されるため、
    // メインスレッドに同期要求を送信
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'BACKGROUND_SYNC_REQUEST',
          timestamp: Date.now()
        });
      });
    });
    
    // 次回の同期をスケジュール
    schedulePeriodicSync();
  }, SYNC_INTERVAL);
}

// バックグラウンド同期処理
async function performBackgroundSync() {
  try {
    console.log('Performing background sync...');
    
    // オフライン状態の確認
    if (!navigator.onLine) {
      console.log('Offline - skipping background sync');
      return;
    }
    
    // メインスレッドに同期要求を送信
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      clients.forEach(client => {
        client.postMessage({
          type: 'PERFORM_SYNC',
          timestamp: Date.now()
        });
      });
    }
    
    console.log('Background sync completed');
  } catch (error) {
    console.error('Background sync failed:', error);
    throw error;
  }
}

// メインスレッドからのメッセージ処理
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'REGISTER_SYNC':
      // バックグラウンド同期を登録（SWコンテキスト互換チェック）
      if (self.registration && self.registration.sync && typeof self.registration.sync.register === 'function') {
        self.registration.sync.register(SYNC_TAG)
          .then(() => {
            console.log('Background sync registered');
            schedulePeriodicSync();
          })
          .catch(error => {
            console.error('Failed to register background sync:', error);
          });
      } else {
        console.log('Background sync not supported in SW context; using periodic scheduler only');
        schedulePeriodicSync();
      }
      break;
      
    case 'UNREGISTER_SYNC':
      // 定期同期を停止
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
        console.log('Periodic sync stopped');
      }
      break;
      
    case 'SYNC_STATUS_UPDATE':
      // 同期状態の更新（ログ出力など）
      console.log('Sync status update:', data);
      break;

    case 'CHECK_FOR_UPDATES':
      // 手動更新チェック要求（起動時のみ）
      (async () => {
        const result = await checkForUpdates();
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ type: 'VERSION_CHECK_RESULT', result }));
      })();
      break;

    case 'APPLY_UPDATE':
      // 新バージョン適用: キャッシュは温存し、HTMLシェルのみ上書き
      // 古い runtime cache (ハッシュ付き JS/CSS) はそのまま残すが、新HTMLが新ハッシュを参照
      // するため、新ハッシュのみ次回 fetch で runtime cache に追加される。
      // 古いハッシュアセットは Step 2 の CACHE_NAME 自動バンプで activate 時に掃除される。
      (async () => {
        try {
          const now = Date.now();
          const response = await fetch('/version.json?t=' + now, { cache: 'no-cache' });
          if (!response.ok) {
            throw new Error('version.json fetch failed: ' + response.status);
          }
          const versionData = await response.json();

          const cache = await caches.open(CACHE_NAME);

          // version.json のみ上書き
          await cache.put('/version.json', new Response(JSON.stringify(versionData), {
            headers: { 'Content-Type': 'application/json' }
          }));

          // HTMLシェルのみ最新化（ハッシュなしURL、cache: 'no-store' でネットワーク優先）
          try {
            const htmlResp = await fetch('/index.html', { cache: 'no-store' });
            if (htmlResp && htmlResp.ok) {
              await cache.put('/index.html', htmlResp.clone());
              await cache.put('/', htmlResp.clone());
            }
          } catch (htmlErr) {
            console.warn('[SW] APPLY_UPDATE: html refresh failed:', htmlErr);
            // HTML取得失敗しても version.json 更新は成功しているので継続
          }

          const clients = await self.clients.matchAll();
          clients.forEach(client => client.postMessage({ type: 'UPDATE_APPLIED', version: versionData }));
        } catch (e) {
          console.error('[SW] APPLY_UPDATE failed:', e);
          const clients = await self.clients.matchAll();
          clients.forEach(client => client.postMessage({ type: 'UPDATE_FAILED' }));
        }
      })();
      break;
      
    default:
      console.log('Unknown message type:', type);
  }
});

// オンライン/オフライン状態の監視
self.addEventListener('online', () => {
  console.log('Network online - resuming background sync');
  schedulePeriodicSync();
  
  // オンライン復帰時に即座に同期を実行
  self.registration.sync.register(SYNC_TAG)
    .catch(error => {
      console.error('Failed to register sync on online:', error);
    });
});

self.addEventListener('offline', () => {
  console.log('Network offline - pausing background sync');
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
});

// プッシュ通知の処理（将来の拡張用）
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '新しい通知があります',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: '確認する',
        icon: '/icons/icon-192x192.png'
      },
      {
        action: 'close',
        title: '閉じる',
        icon: '/icons/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('勤怠管理アプリ', options)
  );
});

// 通知クリック時の処理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});