import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function gitVersion(): string {
  const sha = process.env['GITHUB_SHA'];
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  define: {
    __BUILD__: JSON.stringify({ version: gitVersion(), date: new Date().toISOString().slice(0, 10) }),
  },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
  },
});
