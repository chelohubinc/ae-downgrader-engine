# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/)
and the format is inspired by [Keep a Changelog](https://keepachangelog.com/).

---

## [0.1.0] - 2026-11-09

First public release of the standalone After Effects project engine.

### Added

- Detect After Effects project versions 2022 through 2026 from `.aep` files.
- Parse and validate the root-level RIFX container and its chunks without modifying the input.
- Analyze projects and report their detected version and container structure.
- Convert eligible projects by replacing the version fingerprint in a copy of the file.
- Validate converted output, including file length, chunk structure, trailer preservation, and unchanged bytes outside the version header.
- Report conversion status, warnings, changed bytes, duration, and features that are not analyzed.
- List only conversion targets with real project testing:
  - After Effects 2026 to 2025, 2024, or 2023.
  - After Effects 2024 to 2023.
- Export a typed API for use in Node.js or a browser, including Web Worker contexts.
- Add fixtures and tests for version detection, real-file fingerprints, invalid input, compatibility rules, and conversion behavior.

### Limitations

- All available conversions are experimental; no conversion is classified as fully supported.
- Conversion changes only the version header. It does not transform project structure or check whether features, effects, plugins, expressions, or footage links are compatible with the target version.
- Conversion to After Effects 2022 is blocked because a simple header change can produce a “chunk in file too big” error.
- Untested version pairs are not offered.
- Converted projects should be opened and checked in the target version of After Effects before production use.

---
