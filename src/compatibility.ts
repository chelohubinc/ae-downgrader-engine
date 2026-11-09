import type { AeRelease, PairStatus } from './types';
import { RELEASES } from './version-table';

/**
 * Centralized matrix. RULE: no pair is `supported` without real tests covering the full
 * fixture set from the requirements (§14). Today: one project is tested per pair.
 * Untested pairs remain `unsupported` and are never proposed to the user.
 */
const EXPERIMENTAL: ReadonlyArray<[AeRelease, AeRelease]> = [
    [2026, 2025], [2026, 2024], [2026, 2023], // tested: SL.aep opens in the target version
    [2024, 2023],                              // tested: Hinata.aep opens in AE 2023
];

export function pairStatus(source: AeRelease, target: AeRelease): PairStatus {
    if (target >= source) return 'unsupported';
    // AE 2022 rejects a simple header change ("chunk in file too big"), from 2026 and 2024 onward.
    if (target === 2022) return 'blocked';
    return EXPERIMENTAL.some(([s, t]) => s === source && t === target) ? 'experimental' : 'unsupported';
}

/** Targets to propose in the interface: only conversions that are actually available. */
export function availableTargets(source: AeRelease): { target: AeRelease; status: PairStatus }[] {
    return RELEASES.filter((t) => t < source)
        .map((t) => ({ target: t, status: pairStatus(source, t) }))
        .filter((x) => x.status === 'supported' || x.status === 'experimental');
}
