import { parseAep } from './aep-parser';
import { ConverterError, type AeRelease, type ParsedAep, type VersionInfo } from './types';
import { RELEASES, VERSION_TABLE } from './version-table';

export function detectVersion(bytes: Uint8Array, parsed: ParsedAep = parseAep(bytes)): VersionInfo {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const formatNumber = v.getUint16(parsed.head.dataOffset, false);
    const release = RELEASES.find((r) => VERSION_TABLE[r].formatNumber === formatNumber) ?? null;
    return {
        detected: release !== null, format: 'aep', formatNumber, release,
        releaseLabel: release ? VERSION_TABLE[release].label : null,
        confidence: release ? 'high' : 'none',
    };
}

export function requireVersion(info: VersionInfo): AeRelease {
    if (!info.release) throw new ConverterError('UNKNOWN_VERSION', 'Could not identify the After Effects version.');
    return info.release;
}
