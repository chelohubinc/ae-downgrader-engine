import { parseAep } from './aep-parser';
import { detectVersion } from './version-detector';
import type { AeRelease, ValidationResult } from './types';
import { VERSION_TABLE } from './version-table';

/** Structural check only: it does NOT guarantee that the project opens in After Effects. */
export function validateOutput(original: Uint8Array, output: Uint8Array, target: AeRelease): ValidationResult {
    const checks: ValidationResult['checks'] = [];
    const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

    add('same-length (no truncation)', original.length === output.length);
    try {
        const p = parseAep(output);
        add('valid RIFX signature and chunk walk', true);
        const o = parseAep(original);
        add('chunk table identical', JSON.stringify(p.chunks) === JSON.stringify(o.chunks));
        add('trailing data preserved', p.trailerLength === o.trailerLength);
        const info = detectVersion(output, p);
        add('target version recognised', info.release === target, info.releaseLabel ?? 'unknown');
        const hdr = VERSION_TABLE[target].headerBytes;
        add('version header matches table', hdr.every((b, i) => output[p.head.dataOffset + i] === b));
        // Only the bytes at the beginning of the chunk header are allowed to change.
        let outside = 0;
        for (let i = 0; i < output.length; i++) {
            const inHead = i >= p.head.dataOffset && i < p.head.dataOffset + 8;
            if (!inHead && output[i] !== original[i]) outside++;
        }
        add('no byte changed outside version header', outside === 0, `${outside} unexpected`);
    } catch (e) {
        add('valid RIFX signature and chunk walk', false, e instanceof Error ? e.message : String(e));
    }
    return { ok: checks.every((c) => c.ok), checks };
}
