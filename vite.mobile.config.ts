import fs from 'fs';
import { resolve } from 'path';
import { defineConfig, Plugin } from 'vite';

function renameMobileHtmlPlugin(): Plugin {
  return {
    name: 'rename-mobile-html',
    closeBundle() {
      const src = resolve(__dirname, 'dist-mobile/mobile.html');
      const dst = resolve(__dirname, 'dist-mobile/index.html');
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_MOBILE': JSON.stringify('true'),
  },
  plugins: [renameMobileHtmlPlugin()],
  build: {
    outDir: 'dist-mobile',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'mobile.html'),
      },
    },
  },
  server: {
    port: 5174,
    open: false,
  },
});
