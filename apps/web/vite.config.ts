import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Resolve Cesium whether hoisted to workspace root or local to this package. */
function resolveCesiumBuild(): { root: string; build: string } {
  const candidates = [
    path.resolve(rootDir, "node_modules/cesium/Build"),
    path.resolve(rootDir, "../../node_modules/cesium/Build"),
  ];
  for (const buildRoot of candidates) {
    const cesiumDir = path.join(buildRoot, "Cesium");
    if (fs.existsSync(path.join(cesiumDir, "Assets"))) {
      return {
        root: buildRoot,
        build: `${cesiumDir}${path.sep}`,
      };
    }
  }
  return {
    root: "node_modules/cesium/Build",
    build: "node_modules/cesium/Build/Cesium/",
  };
}

const cesiumPaths = resolveCesiumBuild();

export default defineConfig({
  plugins: [
    react(),
    cesium({
      cesiumBuildRootPath: cesiumPaths.root,
      cesiumBuildPath: cesiumPaths.build,
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
