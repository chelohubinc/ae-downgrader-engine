# AE Downgrader Engine

[![Build Status](https://github.com/chelohubinc/ae-downgrader-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/chelohubinc/ae-downgrader-engine/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@chelohubinc/ae-downgrader-engine.svg)](https://www.npmjs.com/package/@chelohubinc/ae-downgrader-engine)
[![License](https://img.shields.io/npm/l/@chelohubinc/ae-downgrader-engine.svg)](https://www.npmjs.com/package/@chelohubinc/ae-downgrader-engine)

A standalone JavaScript and TypeScript library for inspecting Adobe After Effects
project files (`.aep`) and testing a limited set of conversions to earlier releases.
It runs in Node.js and modern browsers, including Web Workers. Files are processed
locally; this library does not upload project data.

> **Important:** this is an experimental compatibility engine, not an Adobe
> conversion tool. It currently changes the project version fingerprint only.
> A structurally valid output is not guaranteed to open or work correctly in
> After Effects.

## Contents

- [Installation](#installation)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Browser usage](#browser-usage)
- [Command line](#command-line)
- [API](#api)
- [Conversion availability](#conversion-availability)
- [Errors](#errors)
- [Limitations](#limitations)
- [Contributing test results](#contributing-test-results)
- [Development](#development)
- [License](#license)

## Installation

```bash
npm install @chelohubinc/ae-downgrader-engine
```

The package provides CommonJS, ES module, and TypeScript declaration builds, plus an
`ae-downgrader` command (see [Command line](#command-line)).

## Requirements

- Node.js 18 or newer, or a modern browser with `Uint8Array`, `DataView`, and
  `TextDecoder` support.
- Input must be provided as a `Uint8Array` (in Node.js, a `Buffer` can be used
  because it extends `Uint8Array`).
- The maximum input size is `MAX_FILE_BYTES` (1 GiB).

## Quick start

```ts
import {
  analyze,
  availableTargets,
  convert,
  ConverterError,
  downloadName,
} from '@chelohubinc/ae-downgrader-engine';
import { readFile, writeFile } from 'node:fs/promises';

const input = new Uint8Array(await readFile('project.aep'));
const { version, parsed } = analyze(input);

if (!version.detected || version.release === null) {
  throw new Error(`Unknown After Effects version (format ${version.formatNumber}).`);
}

console.log(`Detected: ${version.releaseLabel}`);
console.log(`Root chunks: ${parsed.chunks.length}`);

const targets = availableTargets(version.release);
console.log('Available targets:', targets);

try {
  const { output, report } = convert(input, 2025);
  await writeFile(downloadName('project.aep', 2025), output);

  console.log(`Converted ${report.source} → ${report.target}`);
  console.log(`Compatibility: ${report.pairStatus}`);
  console.warn(report.warnings.join('\n'));
} catch (error) {
  if (error instanceof ConverterError) {
    console.error(`Conversion failed [${error.code}]: ${error.message}`);
  } else {
    throw error;
  }
}
```

Choose a target from `availableTargets()` rather than assuming any older release
is convertible. `convert()` rejects unsupported or blocked pairs with a
`ConverterError`.

## Browser usage

The same API works with a browser `File`. For example, in a UI event handler:

```ts
import {
  analyze,
  availableTargets,
  convert,
  downloadName,
} from '@chelohubinc/ae-downgrader-engine';

async function convertFile(file: File, target: 2023 | 2024 | 2025): Promise<void> {
  const input = new Uint8Array(await file.arrayBuffer());
  const { version } = analyze(input);

  if (!version.detected || version.release === null) {
    throw new Error('Unrecognized After Effects project version.');
  }

  const targets = availableTargets(version.release);
  if (!targets.some((item) => item.target === target)) {
    throw new Error(`Conversion to After Effects ${target} is not available.`);
  }

  const { output, report } = convert(input, target);
  const url = URL.createObjectURL(
    new Blob([output], { type: 'application/octet-stream' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName(file.name, target);
  link.click();
  URL.revokeObjectURL(url);

  console.info(report);
}
```

For large files or UI responsiveness, call the library from a Web Worker and
transfer the input `ArrayBuffer` to the worker. The library itself does not
create workers or manage downloads.

## Command line

The package installs an `ae-downgrader` command. Run it without installing anything:

```bash
# Detect the version and list the available targets
npx @chelohubinc/ae-downgrader-engine project.aep

# Write a converted copy next to the input: project_AE2024.aep
npx @chelohubinc/ae-downgrader-engine project.aep --to 2024
```

Or install it globally with `npm install -g @chelohubinc/ae-downgrader-engine` and run
`ae-downgrader project.aep --to 2024`. It requires Node.js 18 or newer.

| Option | Description |
| --- | --- |
| `--to <year>` | Target release (`2024` or `AE2024`). Without it, the file is only analyzed. |
| `--out <path>` | Output file. Default: `<name>_AE<year>.aep` next to the input. |
| `--overwrite` | Replace the output file if it already exists. |
| `--json` | Print machine-readable JSON (analysis, report, or error). |
| `--matrix` | Print the compatibility matrix. |
| `-h`, `--help` / `-v`, `--version` | Show help or the version. |

The original file is never modified or overwritten, and a pair that is not in the
compatibility matrix is refused. Exit codes: `0` success, `1` the file or the conversion
was rejected, `2` usage or file-system problem (for example an existing output file).

The command is a thin wrapper around the library and is not part of the library entry
point, so browser and bundler builds are not affected by it.

## API

### `analyze(input)`

Parses the `.aep` container and detects its After Effects release. It does not
convert or modify the input.

```ts
const { parsed, version } = analyze(input);
```

- `parsed` contains the declared container end, trailing-data length, root-level
  chunk list, and `head` chunk offsets.
- `version` contains `detected`, `format`, `formatNumber`, `release`,
  `releaseLabel`, and `confidence`.
- An unrecognized version is returned as `detected: false` and `release: null`.
  Invalid or malformed containers throw `ConverterError`.

### `convert(input, target)`

Converts an eligible project and returns a new byte array and report.

```ts
const { output, report } = convert(input, 2025);
```

The input is not modified. Conversion replaces the first eight bytes of the
`head` chunk with the target release fingerprint; all other bytes, including
trailing data, are preserved. The output is structurally validated before it is
returned.

The `report` includes:

| Property | Description |
| --- | --- |
| `status` | Always `warning` for conversions in this release; the library does not claim full compatibility. |
| `source`, `target` | Detected source and requested target releases. |
| `pairStatus` | Compatibility status for this release pair. |
| `originalSize`, `outputSize` | Input and output byte lengths. |
| `durationMs` | Conversion duration in milliseconds. |
| `structure` | Structural validation result and individual checks. |
| `changedBytes` | Number of bytes whose values differ between input and output. |
| `warnings` | Warnings to show to the user. |
| `notAnalyzed` | Project features that this library does not inspect. |

### `availableTargets(source)`

Returns only older releases that the compatibility matrix currently allows:

```ts
availableTargets(2026);
// [
//   { target: 2023, status: 'experimental' },
//   { target: 2024, status: 'experimental' },
//   { target: 2025, status: 'experimental' },
// ]
```

The returned list is ordered from oldest to newest. Unsupported and blocked
targets are omitted.

### `pairStatus(source, target)`

Returns one of `'supported'`, `'experimental'`, `'unsupported'`, or `'blocked'`.
No pair is currently classified as `supported`.

### `downloadName(originalName, target)`

Returns a suggested output filename by appending `_AE<target>` before the `.aep`
extension:

```ts
downloadName('my-project.aep', 2025); // 'my-project_AE2025.aep'
```

This helper only constructs a filename; it does not read or write files.

### Lower-level exports

The package also exports these utilities and types:

- `parseAep(bytes)`: parses the root-level RIFX container.
- `detectVersion(bytes, parsed?)`: detects the release, parsing the container
  when `parsed` is not supplied.
- `validateOutput(original, output, target)`: performs structural checks on an
  output file. It does not establish that the project opens in After Effects.
- `MAX_FILE_BYTES`: maximum accepted input size (1 GiB).
- `VERSION_TABLE`, `RELEASES`: known release fingerprints and release numbers.
- Types: `AeRelease`, `Chunk`, `ConversionReport`, `ConversionResult`,
  `ErrorCode`, `PairStatus`, `ParsedAep`, `ValidationResult`, and `VersionInfo`.
- `ConverterError`: error class used for expected validation and conversion
  failures; inspect its `code` property.

## Conversion availability

The current matrix is intentionally conservative. Only pairs checked against
real projects are offered, and those pairs remain experimental because testing
is limited.

| Source release | Target release | Status |
| --- | --- | --- |
| After Effects 2026 | 2025 | Experimental |
| After Effects 2026 | 2024 | Experimental |
| After Effects 2026 | 2023 | Experimental |
| After Effects 2024 | 2023 | Experimental |
| Any older release not listed above | Any earlier release | Unsupported or blocked |

After Effects 2022 is currently blocked as a target: changing only the version
fingerprint can result in a “chunk in file too big” error. Untested pairs are
not offered, even when the target release is older.

## Errors

Expected failures are instances of `ConverterError`. Handle errors using their
`code` property rather than relying only on the message:

| Code | Meaning |
| --- | --- |
| `INVALID_FILE` | Input is not a valid After Effects project container. |
| `UNSUPPORTED_FORMAT` | Input uses a recognized but unsupported container format. |
| `UNKNOWN_VERSION` | The project container is valid, but its release fingerprint is unknown. |
| `SAME_VERSION` | The requested target is the project's current release. |
| `NEWER_TARGET` | The requested target is newer than the source release. |
| `UNSUPPORTED_PAIR` | The source/target pair is not available in the compatibility matrix. |
| `STRUCTURE_ERROR` | The container or converted output failed structural validation. |
| `MEMORY_ERROR` | Input exceeds the maximum supported size. |
| `CONVERSION_FAILED` | The output copy could not be created. |

Example:

```ts
try {
  const result = convert(input, 2023);
  // Use result.output and result.report.
} catch (error) {
  if (error instanceof ConverterError) {
    switch (error.code) {
      case 'UNSUPPORTED_PAIR':
        // Offer only targets returned by availableTargets().
        break;
      case 'INVALID_FILE':
      case 'STRUCTURE_ERROR':
        // Ask the user to select a valid, complete .aep file.
        break;
      default:
        console.error(error.message);
    }
  } else {
    throw error;
  }
}
```

## Limitations

- Conversion changes the version fingerprint only; it does not rewrite chunks
  or downgrade project features.
- Structural validation checks the RIFX container and byte preservation. It
  does **not** guarantee that After Effects can open, render, or correctly edit
  the result.
- Effects, third-party plugins, expressions, newer-version features, and
  footage links are not analyzed.
- Every available conversion is experimental and has been checked against only
  a small number of projects.
- Always keep the original file and test the converted project in the target
  After Effects release before relying on it.

## Contributing test results

The compatibility matrix only grows with real tests, and every available conversion is still
experimental. If you converted a project, please tell us what happened in After Effects:

**[Report a conversion result](https://github.com/chelohubinc/ae-downgrader-engine/issues/new?template=conversion-report.yml)**

A useful report says which versions were involved, how you converted the file, whether it
opened, what was missing or different, and which features the project uses (expressions,
text, shapes, 3D, track mattes, third-party plugins...).

- **Privacy:** do not attach client or confidential projects. Attach a file only if you own
  it and are happy to make it public; small sample projects are very welcome.
- **How reports are used:** a pair moves from *experimental* to *supported* only after tests
  cover a representative range of project features, not after a single success.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

- `npm test` runs the Vitest suite.
- `npm run typecheck` checks the TypeScript sources.
- `npm run build` creates minified CommonJS and ES module bundles, source maps,
  and TypeScript declarations in `dist/`, then builds the command-line entry
  (`dist/cli.cjs`).

## License

This package is published under the ISC license.