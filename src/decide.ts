// Turns Jev's answers into actions. Pure logic, no API calls, so it's easy to test and to
// show on a slide: the model gives probabilities, our code decides what to do with them.

import { config } from "./config.ts";
import type { TriageResult } from "./jev.ts";

export type Kind = "bug" | "feature_request" | "question" | "needs_review";

export interface Decision {
  kind: Kind;
  /** ClickUp priority: 1 urgent, 2 high, 3 normal, 4 low. Only set for bugs. */
  priority?: 1 | 2 | 3 | 4;
  urgency?: string;
  area?: string;
  createIssue: boolean;
  tags: string[];
  reasons: string[];
}

export const PRIORITY: Record<string, 1 | 2 | 3 | 4> = { urgent: 1, high: 2, normal: 3, low: 4 };

export const TAGS = {
  bug: "bug",
  feature_request: "feature-request",
  question: "question",
  needs_review: "needs-review",
} as const satisfies Record<Kind, string>;

// Jev reports a confidence per answer, separate from the per-option probabilities.
const pct = (p: number) => `${Math.round(p * 100)}% confident`;

export function decide({ answers }: TriageResult): Decision {
  const { type, urgency, area, needs_human } = answers;
  const { thresholds } = config;

  const reviewReasons: string[] = [];
  if (type.choice === "unclear") reviewReasons.push(`request is unclear (${pct(type.confidence)})`);
  else if (type.confidence < thresholds.type)
    reviewReasons.push(`not confident about the type: best guess ${type.choice}, ${pct(type.confidence)}`);
  if (needs_human.noul >= thresholds.needsHuman)
    reviewReasons.push(`flagged for a person (${Math.round(needs_human.noul * 100)}% yes)`);

  if (type.choice === "unclear" || reviewReasons.length > 0) {
    return { kind: "needs_review", createIssue: false, tags: [TAGS.needs_review], reasons: reviewReasons };
  }

  if (type.choice === "bug") {
    const areaName = area.confidence >= thresholds.area ? area.choice : "unknown";
    return {
      kind: "bug",
      priority: PRIORITY[urgency.choice],
      urgency: urgency.choice,
      area: areaName,
      createIssue: true,
      tags: [TAGS.bug],
      reasons: [
        `bug (${pct(type.confidence)})`,
        `urgency ${urgency.choice} (${pct(urgency.confidence)})`,
        areaName === "unknown"
          ? `area unclear: best guess ${area.choice}, ${pct(area.confidence)}`
          : `area ${areaName} (${pct(area.confidence)})`,
      ],
    };
  }

  return {
    kind: type.choice,
    createIssue: false,
    tags: [TAGS[type.choice]],
    reasons: [`${type.choice.replace("_", " ")} (${pct(type.confidence)})`],
  };
}
