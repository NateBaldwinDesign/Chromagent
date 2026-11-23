#!/usr/bin/env node
import { run } from "./run";

declare const __CHROMAGENTIC_VERSION__: string;

run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  version: __CHROMAGENTIC_VERSION__,
  stdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  },
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`Something went wrong: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  },
);
