import { defineConfig, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 构建结束后改写 dist/sw.js：
 * 把 self.__PRECACHE__ 替换为全部产物文件列表，并用内容哈希生成缓存版本号，
 * 这样每次发布新版本，Service Worker 都会更新并预缓存完整的 App 外壳（离线可用）。
 */
function swPrecache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sw-precache',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      // content/ 下的内置内容体积较大，改为运行时按需缓存（见 public/sw.js）
      const list = files.filter((f) => f !== 'sw.js' && !f.startsWith('content/'));
      const hash = createHash('sha256');
      for (const f of list.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace('self.__PRECACHE__', JSON.stringify(['./', ...list]))
        .replace('__VERSION__', version);
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // 相对路径：部署在 GitHub Pages 子路径（/仓库名/）下也能工作
  base: './',
  plugins: [swPrecache(), ...(mode === 'https' ? [basicSsl()] : [])],
  build: { target: 'es2020' },
}));
