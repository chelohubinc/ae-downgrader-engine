import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze, availableTargets, convert, downloadName, pairStatus, validateOutput, ConverterError } from '../src';
import type { AeRelease } from '../src';

const fx = (y: number) => new Uint8Array(readFileSync(new URL(`./fixtures/base_AE${y}.aep`, import.meta.url)));
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ConverterError).code; } return null; };

describe('version detection', () => {
    for (const y of [2022, 2023, 2024, 2025, 2026] as AeRelease[]) {
        it(`recognizes After Effects ${y}`, () => {
            const { version } = analyze(fx(y));
            expect(version).toMatchObject({ detected: true, release: y, confidence: 'high' });
        });
    }
});

describe('real recordings 2022/2023', () => {
    for (const y of [2022, 2023] as AeRelease[]) it(`fingerprint ${y} matches a normal recording`, () => {
        const real = new Uint8Array(readFileSync(new URL(`./fixtures/real_AE${y}.aep`, import.meta.url)));
        const { parsed, version } = analyze(real);
        expect(version.release).toBe(y);
        const crash = fx(y);
        expect(Array.from(real.slice(parsed.head.dataOffset, parsed.head.dataOffset + 8)))
            .toEqual(Array.from(crash.slice(parsed.head.dataOffset, parsed.head.dataOffset + 8)));
    });
});

describe('invalid files', () => {
    it('rejects an empty file', () => expect(code(() => analyze(new Uint8Array(0)))).toBe('INVALID_FILE'));
    it('rejects a renamed file (text)', () => expect(code(() => analyze(new TextEncoder().encode('x'.repeat(200))))).toBe('INVALID_FILE'));
    it('rejects a RIFF container (other format)', () => {
        const b = new Uint8Array(64); b.set(new TextEncoder().encode('RIFF'));
        expect(code(() => analyze(b))).toBe('UNSUPPORTED_FORMAT');
    });
    it('rejects a truncated file', () => expect(code(() => analyze(fx(2026).slice(0, 3000)))).toBe('STRUCTURE_ERROR'));
    it('rejects an unknown version', () => {
        const b = fx(2026); const { parsed } = analyze(b); b[parsed.head.dataOffset + 1] = 0x99;
        expect(code(() => convert(b, 2025))).toBe('UNKNOWN_VERSION');
    });
});

describe('compatibility matrix', () => {
    it('does not declare anything as supported without sufficient tests', () => {
        for (const s of [2023, 2024, 2025, 2026] as AeRelease[]) for (const t of [2022, 2023, 2024, 2025] as AeRelease[])
            expect(pairStatus(s, t)).not.toBe('supported');
    });
    it('blocks 2022', () => { expect(pairStatus(2026, 2022)).toBe('blocked'); expect(pairStatus(2024, 2022)).toBe('blocked'); });
    it('only proposes tested conversions', () => {
        expect(availableTargets(2026).map((x) => x.target).sort()).toEqual([2023, 2024, 2025]);
        expect(availableTargets(2024).map((x) => x.target)).toEqual([2023]);
        expect(availableTargets(2025)).toEqual([]);
    });
});

describe('conversion', () => {
    it('2026 → 2025: valid structure, original intact, only head bytes change', () => {
        const input = fx(2026); const before = new Uint8Array(input);
        const { output, report } = convert(input, 2025);
        expect(input).toEqual(before);                       // the original is never modified
        expect(output.length).toBe(input.length);
        expect(analyze(output).version.release).toBe(2025);
        expect(report.structure.ok).toBe(true);
        expect(report.changedBytes).toBeLessThanOrEqual(8);
        expect(report.status).toBe('warning');               // never "fully compatible"
        expect(report.pairStatus).toBe('experimental');
        expect(report.warnings.join(' ')).toMatch(/test the converted project/i);
    });
    it('2026 → 2023 and 2024 → 2023 pass', () => {
        expect(convert(fx(2026), 2023).report.structure.ok).toBe(true);
        expect(convert(fx(2024), 2023).report.structure.ok).toBe(true);
    });
    it('repeated conversion is identical (deterministic)', () => {
        expect(convert(fx(2026), 2024).output).toEqual(convert(fx(2026), 2024).output);
    });
    it('pair errors', () => {
        expect(code(() => convert(fx(2026), 2026))).toBe('SAME_VERSION');
        expect(code(() => convert(fx(2024), 2026))).toBe('NEWER_TARGET');
        expect(code(() => convert(fx(2026), 2022))).toBe('UNSUPPORTED_PAIR');
        expect(code(() => convert(fx(2025), 2024))).toBe('UNSUPPORTED_PAIR'); // untested
    });
    it('validator detects alteration outside the header', () => {
        const input = fx(2026); const { output } = convert(input, 2025);
        output[output.length - 5] = (output[output.length - 5] ?? 0) ^ 0xff;
        expect(validateOutput(input, output, 2025).ok).toBe(false);
    });
    it('explicit file name', () => expect(downloadName('my-project.aep', 2025)).toBe('my-project_AE2025.aep'));
});
