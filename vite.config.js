import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import fs from "fs";
import { resolve } from "path";

function copyAssets() {
  return {
    name: "copy-assets",
    closeBundle() {
      const iconsDir = resolve("dist/icons");
      if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
      ["icon48.png", "icon128.png"].forEach((file) => {
        fs.copyFileSync(resolve("icons", file), resolve(iconsDir, file));
      });
      copyDir(resolve("src/assets"), resolve("dist/assets"));
    },
  };
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = resolve(src, entry.name);
    const d = resolve(dst, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

export default defineConfig({
  plugins: [
    webExtension({
      manifest: "manifest.json",
      additionalInputs: [
        "src/offscreen/offscreen.html",
        "src/popup/popup.html",
      ],
    }),
    copyAssets(),
  ],
});