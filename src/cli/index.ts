#!/usr/bin/env node
import { run } from "./run";

declare const __CHROMAGENT_VERSION__: string;

run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  version: __CHROMAGENT_VERSION__,
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`Something went wrong: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  },
);
