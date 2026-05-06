import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ビルド時にversion.jsonとindex.htmlを更新するプラグイン
function updateVersionPlugin() {
  return {
    name: "update-version",
    buildStart() {
      const buildTime = new Date().toISOString();
      const versionPath = resolve(__dirname, "public/version.json");
      const indexPath = resolve(__dirname, "index.html");

      try {
        // version.jsonを更新
        let versionContent = readFileSync(versionPath, "utf-8");
        versionContent = versionContent.replace(/__BUILD_TIME__/g, buildTime);
        writeFileSync(versionPath, versionContent);

        // index.htmlを更新
        let indexContent = readFileSync(indexPath, "utf-8");
        indexContent = indexContent.replace(/__BUILD_TIME__/g, buildTime);
        writeFileSync(indexPath, indexContent);

        console.log(`Version updated with build time: ${buildTime}`);
      } catch (error) {
        console.warn("Failed to update version files:", error);
      }
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // ビルド時に現在時刻を設定
  const buildTime = new Date().toISOString();

  return {
    plugins: [react(), updateVersionPlugin()],
    define: {
      // ビルド時に環境変数を定義
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
    },
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
        // Netlify Functions用のプロキシ（dev で localhost:8888 経由）
        // GAS は kintai-api Function の中から直接呼び出すので、ここで GAS URL は持たない
        "^/\\.netlify/functions/.*": {
          target: "http://localhost:8888",
          changeOrigin: true,
          rewrite: (path) => path,
        },
      },
    },
  };
});
