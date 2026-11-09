import type { AeRelease } from './types';

/**
 * Mapping table established from REAL files saved by After Effects.
 * `formatNumber` = upper 16 bits of the first word in the `head` chunk (observed: +1 per year).
 * `headerBytes` = first 8 bytes of the `head` chunk data (real sample from that version).
 * 2022/2023: fingerprints confirmed on normal recordings (5 s composition) in addition to the
 * initial crash backups: the 8 bytes are identical.
 */
export const VERSION_TABLE: Record<AeRelease, { formatNumber: number; label: string; headerBytes: readonly number[] }> = {
    2022: { formatNumber: 93, label: 'After Effects 2022', headerBytes: [0x00, 0x5d, 0x00, 0x2b, 0x0b, 0x33, 0x06, 0x40] },
    2023: { formatNumber: 94, label: 'After Effects 2023', headerBytes: [0x00, 0x5e, 0x00, 0x04, 0x0b, 0x3a, 0x86, 0x34] },
    2024: { formatNumber: 95, label: 'After Effects 2024', headerBytes: [0x00, 0x5f, 0x00, 0x01, 0x0f, 0x00, 0x06, 0x37] },
    2025: { formatNumber: 96, label: 'After Effects 2025', headerBytes: [0x00, 0x60, 0x00, 0x02, 0x0f, 0x09, 0x06, 0x83] },
    2026: { formatNumber: 97, label: 'After Effects 2026', headerBytes: [0x00, 0x61, 0x00, 0x02, 0x0f, 0x10, 0x06, 0x43] },
};

export const RELEASES = Object.keys(VERSION_TABLE).map(Number) as AeRelease[];
