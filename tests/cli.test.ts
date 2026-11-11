import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { runCli, USAGE } from '../src/cli-core';
import { analyze } from '../src';

const fixture = (year: number) => new URL(`./fixtures/base_AE${year}.aep`, import.meta.url);

let dir: string;
let stdout: string;
let stderr: string;

const run = (...args: string[]) => {
    stdout = '';
    stderr = '';
    return runCli(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t), cwd: dir });
};

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ae-cli-'));
    copyFileSync(fixture(2026), join(dir, 'project.aep'));
});

describe('analyze', () => {
    it('prints the detected version and the available targets', async () => {
        expect(await run('project.aep')).toBe(0);
        expect(stdout).toContain('After Effects 2026');
        expect(stdout).toContain('After Effects 2025 (experimental)');
        expect(stdout).not.toContain('After Effects 2022');
    });

    it('says so when no tested conversion is available', async () => {
        copyFileSync(fixture(2025), join(dir, 'p25.aep'));
        expect(await run('p25.aep')).toBe(0);
        expect(stdout).toContain('no tested conversion');
    });

    it('prints JSON', async () => {
        expect(await run('project.aep', '--json')).toBe(0);
        const data = JSON.parse(stdout);
        expect(data.version.release).toBe(2026);
        expect(data.targets.map((t: { target: number }) => t.target)).toEqual([2023, 2024, 2025]);
    });
});

describe('convert', () => {
    it('writes a converted copy next to the input and never touches the original', async () => {
        const before = readFileSync(join(dir, 'project.aep'));

        expect(await run('project.aep', '--to', '2025')).toBe(0);

        const outPath = join(dir, 'project_AE2025.aep');
        expect(existsSync(outPath)).toBe(true);
        const output = new Uint8Array(readFileSync(outPath));
        expect(analyze(output).version.release).toBe(2025);
        expect(output.length).toBe(before.length);
        expect(readFileSync(join(dir, 'project.aep')).equals(before)).toBe(true);
        expect(stdout).toContain('experimental');
        expect(stdout).toContain('Please test the converted project');
    });

    it('accepts --to=AE2024 and --out', async () => {
        expect(await run('project.aep', '--to=AE2024', '--out', 'custom.aep')).toBe(0);
        expect(analyze(new Uint8Array(readFileSync(join(dir, 'custom.aep')))).version.release).toBe(2024);
    });

    it('refuses to overwrite an existing output unless --overwrite is given', async () => {
        writeFileSync(join(dir, 'project_AE2025.aep'), 'keep me');

        expect(await run('project.aep', '--to', '2025')).toBe(2);
        expect(stderr).toContain('OUTPUT_EXISTS');
        expect(readFileSync(join(dir, 'project_AE2025.aep'), 'utf8')).toBe('keep me');

        expect(await run('project.aep', '--to', '2025', '--overwrite')).toBe(0);
        expect(readFileSync(join(dir, 'project_AE2025.aep')).length).toBeGreaterThan(20);
    });

    it('refuses to write over the input file', async () => {
        expect(await run('project.aep', '--to', '2025', '--out', 'project.aep')).toBe(2);
        expect(stderr).toContain('OUTPUT_IS_INPUT');
    });

    it('rejects a pair that is blocked or untested and creates nothing', async () => {
        expect(await run('project.aep', '--to', '2022')).toBe(1);
        expect(stderr).toContain('UNSUPPORTED_PAIR');
        expect(stderr).toContain('Available targets: 2023, 2024, 2025');
        expect(readdirSync(dir)).toEqual(['project.aep']);
    });

    it('rejects the same version and a newer target', async () => {
        expect(await run('project.aep', '--to', '2026')).toBe(1);
        expect(stderr).toContain('SAME_VERSION');
    });

    it('prints the report as JSON', async () => {
        expect(await run('project.aep', '--to', '2024', '--json')).toBe(0);
        const data = JSON.parse(stdout);
        expect(data.report.pairStatus).toBe('experimental');
        expect(data.report.structure.ok).toBe(true);
    });
});

describe('errors and usage', () => {
    it('rejects a file that is not an After Effects project', async () => {
        writeFileSync(join(dir, 'fake.aep'), 'x'.repeat(200));
        expect(await run('fake.aep')).toBe(1);
        expect(stderr).toContain('INVALID_FILE');
    });

    it('reports a missing file', async () => {
        expect(await run('missing.aep')).toBe(2);
        expect(stderr).toContain('FILE_NOT_FOUND');
    });

    it('rejects an unknown target and an unknown option', async () => {
        expect(await run('project.aep', '--to', '1999')).toBe(2);
        expect(await run('project.aep', '--nope')).toBe(2);
        expect(stderr).toContain(USAGE.split('\n')[0]);
    });

    it('prints the help, the version and the matrix', async () => {
        expect(await run('--help')).toBe(0);
        expect(stdout).toContain('Usage:');
        expect(await run('--version')).toBe(0);
        expect(stdout.trim()).toBe('dev');
        expect(await run('--matrix')).toBe(0);
        expect(stdout).toContain('2026 -> 2025   experimental');
        expect(stdout).toContain('2026 -> 2022   blocked');
    });
});