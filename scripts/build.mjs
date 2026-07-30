import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function build() {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/main/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.join(root, 'dist/main/index.js'),
    external: ['electron', 'electron-store'],
    sourcemap: true,
    logLevel: 'info',
  });

  await esbuild.build({
    entryPoints: [path.join(root, 'src/preload/preload.ts')],
    bundle: true,
    platform: 'browser',
    target: 'chrome120',
    format: 'cjs',
    outfile: path.join(root, 'dist/preload/preload.js'),
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
  });

  await esbuild.build({
    entryPoints: [path.join(root, 'src/miniplayer/preload.ts')],
    bundle: true,
    platform: 'browser',
    target: 'chrome120',
    format: 'cjs',
    outfile: path.join(root, 'dist/miniplayer/preload.js'),
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
  });

  await esbuild.build({
    entryPoints: [path.join(root, 'src/inject/musickit-hook.ts')],
    bundle: true,
    platform: 'browser',
    target: 'chrome120',
    format: 'iife',
    outfile: path.join(root, 'dist/inject/musickit-hook.js'),
    sourcemap: false,
    logLevel: 'info',
  });

  const miniOutDir = path.join(root, 'dist/miniplayer');
  fs.mkdirSync(miniOutDir, { recursive: true });
  fs.copyFileSync(
    path.join(root, 'src/miniplayer/index.html'),
    path.join(miniOutDir, 'index.html'),
  );

  console.log('Build complete.');
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
