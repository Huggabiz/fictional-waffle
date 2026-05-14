import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf-8')) as {
  version: string;
};

// GitHub Pages serves project sites from /<repo>/ — keep this matched to the repo name.
const REPO_BASE = '/fictional-waffle/';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? REPO_BASE : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
}));
