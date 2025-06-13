import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // ビルド時に現在時刻を設定
  const buildTime = new Date().toISOString();
  
  return {
    plugins: [react()],
    define: {
      // ビルド時に環境変数を定義
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    },
    build: {
      // ファイル名にハッシュを追加してキャッシュバスティング
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]'
        }
      }
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        // Netlify Functions用のプロキシ設定（開発時にNetlify Devを使用する場合）
        '^/\.netlify/functions/.*': {
          target: 'http://localhost:8888',
          changeOrigin: true,
          rewrite: (path) => path
        },
        // GAS API用のプロキシ設定（開発時に直接GASを呼び出す場合）
        '/api/gas': {
          target: 'https://script.google.com/macros/s/AKfycbzW33cRCB_rYdRx-bNQhj-2pghluHl09_iu26As9Xm7f7PIEoRk2B_42ubLYO6kKpid4w',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => '/exec',
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // CORSヘッダーを追加
              proxyReq.setHeader('Origin', 'http://localhost:5173');
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              // レスポンスにCORSヘッダーを追加
              proxyRes.headers['Access-Control-Allow-Origin'] = '*';
              proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
              proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
            });
          }
        }
      }
    }
  };
});
