export type AeRelease = 2022 | 2023 | 2024 | 2025 | 2026;

export type ErrorCode =
    | 'INVALID_FILE' | 'UNSUPPORTED_FORMAT' | 'UNKNOWN_VERSION' | 'SAME_VERSION'
    | 'NEWER_TARGET' | 'UNSUPPORTED_PAIR' | 'STRUCTURE_ERROR' | 'MEMORY_ERROR' | 'CONVERSION_FAILED';

export class ConverterError extends Error {
    constructor(public readonly code: ErrorCode, message: string) { super(message); this.name = 'ConverterError'; }
}

export type PairStatus = 'supported' | 'experimental' | 'unsupported' | 'blocked';

export interface Chunk { type: string; listType?: string; offset: number; size: number; }

export interface ParsedAep {
    /** Declared size of the RIFX container (including the 8-byte header). */
    declaredEnd: number;
    /** Bytes present after the end of the container (XMP packet): always preserved. */
    trailerLength: number;
    chunks: Chunk[];
    head: { offset: number; dataOffset: number; size: number };
}

export interface VersionInfo {
    detected: boolean;
    format: 'aep';
    /** Format number read from the `head` chunk (e.g. 97). */
    formatNumber: number;
    release: AeRelease | null;
    releaseLabel: string | null;
    confidence: 'high' | 'none';
}

export interface ValidationResult {
    ok: boolean;
    checks: { name: string; ok: boolean; detail?: string }[];
}

export interface ConversionReport {
    status: 'success' | 'warning';
    source: AeRelease;
    target: AeRelease;
    pairStatus: PairStatus;
    originalSize: number;
    outputSize: number;
    durationMs: number;
    structure: ValidationResult;
    changedBytes: number;
    warnings: string[];
    notAnalyzed: string[];
}

export interface ConversionResult { output: Uint8Array; report: ConversionReport; }
