const CACHE_NAME = 'kintai-app-v1';
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

// フェッチ時のキャッシュ戦略
self.addEventListener('fetch', (event) => {
  // chrome-extension や unsupported スキームをスキップ
  if (!event.request.url.startsWith('http')) {
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