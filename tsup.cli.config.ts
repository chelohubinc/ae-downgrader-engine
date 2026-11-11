import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

// Builds the command-line entry only. It runs after the library build (see the "build" script),
// which owns the dist/ folder, so this config must not clean it.
export default defineConfig({
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    platform: 'node',
    target: 'node18',
    clean: false,
    dts: false,
    sourcemap: false,
    minify: false,
    define: { __PKG_VERSION__: JSON.stringify(version) },
    outExtension: () => ({ js: '.cjs' }),
});