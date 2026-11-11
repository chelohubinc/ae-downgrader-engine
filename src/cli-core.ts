// Command-line logic. This file is Node-only and is NOT exported from src/index.ts, so the library
// entry used by browsers and bundlers never pulls in `node:fs` or `node:path`.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
    analyze,
    availableTargets,
    convert,
    ConverterError,
    downloadName,
    MAX_FILE_BYTES,
    pairStatus,
    RELEASES,
    VERSION_TABLE,
} from './index';
import type { AeRelease, ConversionReport } from './index';

/** Injected by tsup at build time (see tsup.cli.config.ts). Undefined when running from sources. */
declare const __PKG_VERSION__: string | undefined;

export interface CliIo {
    stdout(text: string): void;
    stderr(text: string): void;
    cwd: string;
}

/** 0 = success, 1 = the file or the conversion was rejected, 2 = usage or file-system problem. */
export type ExitCode = 0 | 1 | 2;

export const USAGE = `Usage:
  ae-downgrader <project.aep>                Detect the version and list the available targets
  ae-downgrader <project.aep> --to <year>    Write a converted copy (for example --to 2024)
  ae-downgrader --matrix                     Show the compatibility matrix

Options:
  --to <year>     Target After Effects release (${RELEASES[0]}-${RELEASES[RELEASES.length - 1]})
  --out <path>    Output file (default: <name>_AE<year>.aep next to the input file)
  --overwrite     Replace the output file if it already exists
  --json          Print machine-readable JSON instead of text
  -h, --help      Show this help
  -v, --version   Show the version

The original file is never modified. Conversions are experimental: open the result in the
target version of After Effects and check it before production use.
`;

interface Options {
    help: boolean;
    version: boolean;
    matrix: boolean;
    json: boolean;
    overwrite: boolean;
    to?: string;
    out?: string;
    files: string[];
}

class UsageError extends Error { }

function parseArgs(argv: string[]): Options {
    const options: Options = { help: false, version: false, matrix: false, json: false, overwrite: false, files: [] };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!;
        const [flag, inlineValue] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
        const value = (): string => {
            const next = inlineValue ?? argv[++i];
            if (next === undefined) throw new UsageError(`Option ${flag} needs a value.`);
            return next;
        };

        switch (flag) {
            case '-h': case '--help': options.help = true; break;
            case '-v': case '--version': options.version = true; break;
            case '--matrix': options.matrix = true; break;
            case '--json': options.json = true; break;
            case '--overwrite': options.overwrite = true; break;
            case '--to': options.to = value(); break;
            case '--out': options.out = value(); break;
            default:
                if (arg.startsWith('-')) throw new UsageError(`Unknown option: ${arg}`);
                options.files.push(arg);
        }
    }
    return options;
}

function parseTarget(raw: string): AeRelease {
    const year = Number(raw.replace(/^ae/i, ''));
    const release = RELEASES.find((r) => r === year);
    if (!release) throw new UsageError(`Unknown target "${raw}". Use one of: ${RELEASES.join(', ')}.`);
    return release;
}

const label = (release: AeRelease) => VERSION_TABLE[release].label;

function formatSize(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function matrixRows() {
    const rows: { source: AeRelease; target: AeRelease; status: string }[] = [];
    for (const source of [...RELEASES].reverse()) {
        for (const target of [...RELEASES].reverse()) {
            if (target < source) rows.push({ source, target, status: pairStatus(source, target) });
        }
    }
    return rows;
}

function summarize(report: ConversionReport, outputPath: string): string {
    return [
        `Wrote:      ${outputPath}`,
        `Conversion: ${label(report.source)} -> ${label(report.target)} (${report.pairStatus})`,
        `Size:       ${formatSize(report.originalSize)} -> ${formatSize(report.outputSize)}, ${report.changedBytes} byte(s) changed`,
        `Structure:  ${report.structure.ok ? 'validated' : 'FAILED'}`,
        '',
        'Warnings:',
        ...report.warnings.map((w) => `  - ${w}`),
        '',
        'Not analyzed:',
        ...report.notAnalyzed.map((w) => `  - ${w}`),
        '',
    ].join('\n');
}

/** Runs the CLI and returns the exit code. It never calls process.exit, which keeps it testable. */
export async function runCli(argv: string[], io: CliIo): Promise<ExitCode> {
    let options: Options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        io.stderr(`${(error as Error).message}\n\n${USAGE}`);
        return 2;
    }

    const json = options.json;
    const fail = (code: ExitCode, errorCode: string, message: string): ExitCode => {
        if (json) io.stdout(`${JSON.stringify({ error: { code: errorCode, message } }, null, 2)}\n`);
        else io.stderr(`Error [${errorCode}]: ${message}\n`);
        return code;
    };

    if (options.help) { io.stdout(USAGE); return 0; }
    if (options.version) {
        io.stdout(`${typeof __PKG_VERSION__ === 'string' ? __PKG_VERSION__ : 'dev'}\n`);
        return 0;
    }

    if (options.matrix) {
        const rows = matrixRows();
        if (json) io.stdout(`${JSON.stringify(rows, null, 2)}\n`);
        else io.stdout(rows.map((r) => `${r.source} -> ${r.target}   ${r.status}`).join('\n') + '\n');
        return 0;
    }

    if (options.files.length !== 1) {
        io.stderr(`Expected exactly one .aep file.\n\n${USAGE}`);
        return 2;
    }

    const inputPath = resolve(io.cwd, options.files[0]!);
    if (!existsSync(inputPath) || !statSync(inputPath).isFile()) return fail(2, 'FILE_NOT_FOUND', `File not found: ${inputPath}`);
    const size = statSync(inputPath).size;
    if (size > MAX_FILE_BYTES) return fail(1, 'TOO_LARGE', `The file is larger than the ${MAX_FILE_BYTES / 1024 / 1024 / 1024} GiB limit.`);

    let target: AeRelease | undefined;
    try {
        if (options.to !== undefined) target = parseTarget(options.to);
    } catch (error) {
        io.stderr(`${(error as Error).message}\n`);
        return 2;
    }

    const buffer = readFileSync(inputPath);
    const input = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    try {
        const { version } = analyze(input);

        // --- Analyze only ---
        if (target === undefined) {
            if (!version.release) return fail(1, 'UNKNOWN_VERSION', `Could not identify the After Effects version (format number ${version.formatNumber}).`);
            const targets = availableTargets(version.release);
            if (json) {
                io.stdout(`${JSON.stringify({ file: inputPath, size, version, targets }, null, 2)}\n`);
            } else {
                io.stdout([
                    `File:     ${basename(inputPath)} (${formatSize(size)})`,
                    `Version:  ${version.releaseLabel}`,
                    targets.length
                        ? `Targets:  ${targets.map((t) => `${label(t.target)} (${t.status})`).join(', ')}`
                        : 'Targets:  none - no tested conversion is available from this version yet',
                    '',
                ].join('\n'));
            }
            return 0;
        }

        // --- Convert ---
        const outputPath = options.out ? resolve(io.cwd, options.out) : join(dirname(inputPath), downloadName(basename(inputPath), target));
        if (outputPath === inputPath) return fail(2, 'OUTPUT_IS_INPUT', 'The output path is the input file. The original is never overwritten.');
        if (existsSync(outputPath) && !options.overwrite) return fail(2, 'OUTPUT_EXISTS', `${outputPath} already exists. Use --overwrite to replace it.`);

        const { output, report } = convert(input, target);
        writeFileSync(outputPath, output);

        if (json) io.stdout(`${JSON.stringify({ output: outputPath, report }, null, 2)}\n`);
        else io.stdout(summarize(report, outputPath));
        return 0;
    } catch (error) {
        if (error instanceof ConverterError) {
            let hint = '';
            if (error.code === 'UNSUPPORTED_PAIR') {
                try {
                    const source = analyze(input).version.release;
                    const targets = source ? availableTargets(source) : [];
                    hint = targets.length ? ` Available targets: ${targets.map((t) => t.target).join(', ')}.` : ' No tested conversion is available from this version yet.';
                } catch { /* keep the plain message */ }
            }
            return fail(1, error.code, `${error.message}${hint}`);
        }
        return fail(1, 'CONVERSION_FAILED', 'Unexpected error while converting. The original file is unchanged.');
    }
}