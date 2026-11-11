import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The browser/library entry must stay free of Node-only code: only the CLI files may use Node modules.
describe('library entry', () => {
    const dir = new URL('../src/', import.meta.url);
    const libraryFiles = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('cli'));

    it.each(libraryFiles)('%s does not import Node modules', (file) => {
        const source = readFileSync(new URL(file, dir), 'utf8');
        expect(source).not.toMatch(/from\s+['"]node:/);
        expect(source).not.toMatch(/require\(/);
        expect(source).not.toMatch(/from\s+['"](fs|path|os)['"]/);
    });

    it('does not export the CLI', () => {
        expect(readFileSync(new URL('index.ts', dir), 'utf8')).not.toContain('cli');
    });
});