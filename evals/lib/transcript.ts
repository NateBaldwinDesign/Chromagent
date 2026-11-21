import type { AgentName, Transcript } from "./types";

type Json = Record<string, unknown>;

function lines(raw: string): Json[] {
  const out: Json[] = [];
  for (const line of raw.split("\n")) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    try {
      out.push(JSON.parse(text));
    } catch {
      // Ignore partial lines (for example, a run that was stopped mid-write).
    }
  }
  return out;
}

const str = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value));

/** Copilot CLI `--output-format json` writes one event per line. */
export function parseCopilot(raw: string): Transcript {
  const t: Transcript = { commands: [], toolArgs: [], finalMessage: "" };
  for (const event of lines(raw)) {
    const data = (event.data ?? {}) as Json;
    if (event.type === "tool.execution_start") {
      const args = (data.arguments ?? {}) as Json;
      t.toolArgs.push(`${str(data.toolName)} ${str(args)}`);
      if (typeof args.command === "string") t.commands.push(args.command);
    } else if (event.type === "assistant.message" && typeof data.content === "string" && data.content.trim()) {
      t.finalMessage = data.content;
    } else if (event.type === "session.error" || event.type === "error") {
      t.error = str(data.message ?? data);
    }
  }
  return t;
}

/** Claude Code `--output-format stream-json --verbose`. */
export function parseClaude(raw: string): Transcript {
  const t: Transcript = { commands: [], toolArgs: [], finalMessage: "" };
  for (const event of lines(raw)) {
    if (event.type === "assistant") {
      const content = ((event.message as Json)?.content ?? []) as Json[];
      for (const part of content) {
        if (part.type === "tool_use") {
          const input = (part.input ?? {}) as Json;
          t.toolArgs.push(`${str(part.name)} ${str(input)}`);
          if (typeof input.command === "string") t.commands.push(input.command);
        } else if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          t.finalMessage = part.text;
        }
      }
    } else if (event.type === "result") {
      if (typeof event.result === "string" && event.result.trim()) t.finalMessage = event.result;
      if (event.is_error) t.error = str(event.result) || "The agent reported an error.";
    }
  }
  return t;
}

export function parseTranscript(agent: AgentName, raw: string): Transcript {
  return agent === "copilot" ? parseCopilot(raw) : parseClaude(raw);
}
