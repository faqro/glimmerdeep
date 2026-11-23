import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

function collectDistFiles(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDistFiles(fullPath, rootDir));
    } else if (entry.isFile()) {
      const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (rel !== 'sw.js') {
        results.push(`./${rel}`);
      }
    }
  }
  return results;
}

function pwaPrecachePlugin(): Plugin {
  return {
    name: 'pwa-precache-manifest',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;

      const files = ['./', ...collectDistFiles(outDir, outDir).sort()];
      const hash = crypto.createHash('sha256');
      for (const file of files) {
        hash.update(file);
        if (file !== './') {
          const full = path.join(outDir, file.slice(2));
          hash.update(fs.readFileSync(full));
        }
      }
      const cacheName = `glimmerdeep-pwa-${hash.digest('hex').slice(0, 12)}`;

      let swContent = fs.readFileSync(swPath, 'utf8');
      swContent = swContent.replace(
        /const CACHE_NAME = '[^']*';/,
        `const CACHE_NAME = '${cacheName}';`
      );
      swContent = swContent.replace(
        /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
        `const PRECACHE_ASSETS = ${JSON.stringify(files, null, 2)};`
      );
      fs.writeFileSync(swPath, swContent, 'utf8');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [pwaPrecachePlugin()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    open: false,
  },
});
