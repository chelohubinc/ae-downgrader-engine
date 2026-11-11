#!/usr/bin/env node
// Entry point of the `ae-downgrader` command. All logic lives in cli-core.ts.
import { runCli } from './cli-core';

runCli(process.argv.slice(2), {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    cwd: process.cwd(),
}).then(
    (code) => { process.exitCode = code; },
    () => {
        process.stderr.write('Error [CONVERSION_FAILED]: Unexpected error.\n');
        process.exitCode = 1;
    },
);