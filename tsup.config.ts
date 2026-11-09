import { defineConfig } from "tsup";

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    minify: true,
    outExtension({ format }) {
        return { js: format === 'cjs' ? '.cjs' : '.mjs' };
    },
    clean: true,
    target: 'es2019'
});