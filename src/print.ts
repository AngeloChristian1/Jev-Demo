// Terminal output for the demo: confidence bars and a one-screen summary per ticket.

import type { Classification } from "./jev.ts";
import type { Decision } from "./decide.ts";

const BAR_WIDTH = 24;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const pct = (p: number) => `${Math.round(p * 100)}%`;

function bars(probabilities: Record<string, number>, chosen: string): string {
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .map(([label, p]) => {
      const bar = "█".repeat(Math.round(p * BAR_WIDTH)).padEnd(BAR_WIDTH, " ");
      const line = `    ${label.padEnd(16)} ${bar} ${String(Math.round(p * 100)).padStart(3)}%`;
      return label === chosen ? bold(line) : dim(line);
    })
    .join("\n");
}

export function formatClassification({ result, latencyMs, costUsd, mock }: Classification): string {
  const { type, urgency, area, needs_human } = result.answers;
  return [
    `  ${bold("TYPE")} ${dim(`confidence ${pct(type.confidence)}`)}`,
    bars(type.probabilities, type.choice),
    `  ${bold("URGENCY")} ${dim(`confidence ${pct(urgency.confidence)} · used if it's a bug`)}`,
    bars(urgency.probabilities, urgency.choice),
    `  ${bold("AREA")} ${dim(`confidence ${pct(area.confidence)}`)}`,
    bars(area.probabilities, area.choice),
    `  ${bold("NEEDS A HUMAN")}  ${Math.round(needs_human.noul * 100)}%`,
    dim(
      `  ${result.model} · ${latencyMs}ms · ${result.usage.input_tokens} input tokens · $${costUsd.toFixed(7)}${mock ? " · MOCK" : ""}`,
    ),
  ].join("\n");
}

export function formatDecision(decision: Decision): string {
  const actions: string[] = [`tag "${decision.tags.join(", ")}"`];
  if (decision.priority) actions.push(`priority ${decision.urgency}`);
  if (decision.createIssue) actions.push(`GitHub issue (area:${decision.area})`);
  return [
    `  ${bold("DECISION")}  ${decision.kind.toUpperCase()}`,
    `    because: ${decision.reasons.join("; ")}`,
    `    → ${actions.join(" → ")}`,
  ].join("\n");
}
