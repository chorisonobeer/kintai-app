// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  // 環境変数を正しく読み込む
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    build: {
      // ファイル名にハッシュを追加してキャッシュバスティング
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name].[hash].js",
          chunkFileNames: "assets/[name].[hash].js",
          assetFileNames: "assets/[name].[hash].[ext]",
        },
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        // Netlify Functions用のプロキシ設定（開発時にNetlify Devを使用する場合）
        "^/\.netlify/functions/.*": {
          target: "http://localhost:8888",
          changeOrigin: true,
          rewrite: (path) => path,
        },
        // GAS API用のプロキシ設定（開発時に直接GASを呼び出す場合）
        [env.VITE_DEV_PROXY_PATH || "/api/gas"]: {
          target: env.VITE_GAS_API_URL,
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(
              new RegExp(`^${env.VITE_DEV_PROXY_PATH || "/api/gas"}`),
              ""
            ),
          configure: (proxy, options) => {
            proxy.on("proxyReq", (proxyReq, req, res) => {
              // 動的にOriginヘッダーを設定（リクエストのホストヘッダーから取得）
              const host = req.headers.host || "localhost:5173";
              proxyReq.setHeader("Origin", `http://${host}`);
            });
            proxy.on("proxyRes", (proxyRes, req, res) => {
              // レスポンスにCORSヘッダーを追加
              proxyRes.headers["Access-Control-Allow-Origin"] = "*";
              proxyRes.headers["Access-Control-Allow-Methods"] =
                "GET, POST, OPTIONS";
              proxyRes.headers["Access-Control-Allow-Headers"] =
                "Content-Type, Authorization";
            });
          },
        },
        // MasterConfig GAS API用のプロキシ設定
        [env.VITE_DEV_MASTER_CONFIG_PROXY_PATH || "/api/master-config"]: {
          target: env.VITE_MASTER_CONFIG_API_URL,
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(
              new RegExp(
                `^${env.VITE_DEV_MASTER_CONFIG_PROXY_PATH || "/api/master-config"}`
              ),
              ""
            ),
          configure: (proxy, options) => {
            proxy.on("proxyReq", (proxyReq, req, res) => {
              // 動的にOriginヘッダーを設定（リクエストのホストヘッダーから取得）
              const host = req.headers.host || "localhost:5173";
              proxyReq.setHeader("Origin", `http://${host}`);
            });
            proxy.on("proxyRes", (proxyRes, req, res) => {
              // レスポンスにCORSヘッダーを追加
              proxyRes.headers["Access-Control-Allow-Origin"] = "*";
              proxyRes.headers["Access-Control-Allow-Methods"] =
                "GET, POST, OPTIONS";
              proxyRes.headers["Access-Control-Allow-Headers"] =
                "Content-Type, Authorization";
            });
          },
        },
      },
    },
  };
});
