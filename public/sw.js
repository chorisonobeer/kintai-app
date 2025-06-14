const CACHE_NAME = 'kintai-app-v1';
const VERSION_CHECK_INTERVAL = 30000; // 30秒ごとにバージョンチェック
let lastVersionCheck = 0;

const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/styles.css',
  '/src/styles_addition.css',
  '/src/styles_addition_final.css',
  '/src/styles_monthly.css',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap'
];

// インストール時のキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// バージョンチェック関数
async function checkForUpdates() {
  try {
    const now = Date.now();
    if (now - lastVersionCheck < VERSION_CHECK_INTERVAL) {
      return false;
    }
    
    lastVersionCheck = now;
    const response = await fetch('/version.json?t=' + now, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      return false;
    }
    
    const versionData = await response.json();
    const storedVersion = await caches.match('/version.json');
    
    if (!storedVersion) {
      // 初回の場合はバージョン情報をキャッシュに保存
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/version.json', response.clone());
      return false;
    }
    
    const storedVersionData = await storedVersion.json();
    
    // ビルド時間が異なる場合は新しいバージョンが利用可能
    if (versionData.buildTime !== storedVersionData.buildTime) {
      console.log('New version detected, clearing cache');
      
      // クライアントに更新開始を通知
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'VERSION_UPDATE_START'
        });
      });
      
      // プログレス更新（25%）
      clients.forEach(client => {
        client.postMessage({
          type: 'VERSION_UPDATE_PROGRESS',
          progress: 25
        });
      });
      
      // 全キャッシュを削除
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      
      // プログレス更新（75%）
      clients.forEach(client => {
        client.postMessage({
          type: 'VERSION_UPDATE_PROGRESS',
          progress: 75
        });
      });
      
      // 少し待ってから完了通知
      setTimeout(() => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NEW_VERSION_AVAILABLE',
            version: versionData
          });
        });
      }, 200);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Version check failed:', error);
    return false;
  }
}

// フェッチ時のキャッシュ戦略
self.addEventListener('fetch', (event) => {
  // chrome-extension や unsupported スキームをスキップ
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // HTMLリクエストの場合はバージョンチェックを実行
  if (event.request.destination === 'document') {
    event.respondWith(
      (async () => {
        // バージョンチェックを実行
        const hasUpdate = await checkForUpdates();
        
        if (hasUpdate) {
          // 新しいバージョンが利用可能な場合はネットワークから取得
          return fetch(event.request);
        }
        
        // 通常のキャッシュ戦略
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request);
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
      .catch(() => {
        // オフライン時のフォールバック
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// アクティベート時の古いキャッシュ削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
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
      // バックグラウンド同期を登録
      if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        self.registration.sync.register(SYNC_TAG)
          .then(() => {
            console.log('Background sync registered');
            schedulePeriodicSync();
          })
          .catch(error => {
            console.error('Failed to register background sync:', error);
          });
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