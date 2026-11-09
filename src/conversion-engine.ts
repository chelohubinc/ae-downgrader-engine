import { parseAep } from './aep-parser';
import { pairStatus } from './compatibility';
import { validateOutput } from './structure-validator';
import { detectVersion, requireVersion } from './version-detector';
import { ConverterError, type AeRelease, type ConversionReport, type ConversionResult } from './types';
import { VERSION_TABLE } from './version-table';

export const MAX_FILE_BYTES = 1024 * 1024 * 1024; // browser memory guard

/** Analyze without converting. */
export function analyze(input: Uint8Array) {
    if (input.length > MAX_FILE_BYTES) throw new ConverterError('MEMORY_ERROR', 'Your browser does not have enough memory to process this file.');
    const parsed = parseAep(input);
    const version = detectVersion(input, parsed);
    return { parsed, version };
}

/** Convert a copy of the bytes: `input` is never modified. */
export function convert(input: Uint8Array, target: AeRelease): ConversionResult {
    const t0 = Date.now();
    const { parsed, version } = analyze(input);
    const source = requireVersion(version);

    if (source === target) throw new ConverterError('SAME_VERSION', 'The project already uses this version.');
    if (target > source) throw new ConverterError('NEWER_TARGET', 'Please select an older version.');
    const status = pairStatus(source, target);
    if (status === 'unsupported' || status === 'blocked') {
        throw new ConverterError('UNSUPPORTED_PAIR', 'This version conversion is not available.');
    }

    let output: Uint8Array;
    try {
        output = new Uint8Array(input); // copy
        output.set(VERSION_TABLE[target].headerBytes, parsed.head.dataOffset);
    } catch {
        throw new ConverterError('CONVERSION_FAILED', 'Conversion failed. Your original file is unchanged.');
    }

    const structure = validateOutput(input, output, target);
    if (!structure.ok) throw new ConverterError('STRUCTURE_ERROR', 'The project structure could not be validated.');

    let changed = 0;
    for (let i = 0; i < input.length; i++) if (input[i] !== output[i]) changed++;

    const warnings = [
        'Some newer features may not be available in the target version.',
        'Third-party plugins may require compatible versions.',
        'Please test the converted project in After Effects before production use.',
    ];
    if (status === 'experimental') warnings.unshift('This conversion is experimental: it has only been checked on a small number of projects.');

    const report: ConversionReport = {
        status: 'warning', source, target, pairStatus: status,
        originalSize: input.length, outputSize: output.length, durationMs: Date.now() - t0,
        structure, changedBytes: changed, warnings,
        notAnalyzed: ['Effects and plugins', 'Expressions', 'Features introduced after the target version', 'Footage links'],
    };
    return { output, report };
}

export function downloadName(originalName: string, target: AeRelease): string {
    return originalName.replace(/\.aep$/i, '') + `_AE${target}.aep`;
}
