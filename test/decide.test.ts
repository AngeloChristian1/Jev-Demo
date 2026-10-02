import assert from "node:assert/strict";
import { test } from "node:test";
import { decide } from "../src/decide.ts";
import type { TriageResult } from "../src/jev.ts";

type Answers = TriageResult["answers"];

const result = (overrides: { [K in keyof Answers]?: Partial<Answers[K]> } = {}): TriageResult =>
  ({
    model: "test",
    usage: { input_tokens: 100, output_tokens: 0 },
    answers: {
      type: { type: "choice", choice: "bug", confidence: 0.9, probabilities: {}, ...overrides.type },
      urgency: { type: "choice", choice: "high", confidence: 0.8, probabilities: {}, ...overrides.urgency },
      area: { type: "choice", choice: "api", confidence: 0.7, probabilities: {}, ...overrides.area },
      needs_human: { type: "noul", noul: 0.1, ...overrides.needs_human },
    },
  }) as TriageResult;

test("a confident bug gets a priority, a tag and a GitHub issue", () => {
  const d = decide(result());
  assert.equal(d.kind, "bug");
  assert.equal(d.priority, 2);
  assert.equal(d.area, "api");
  assert.equal(d.createIssue, true);
  assert.deepEqual(d.tags, ["bug"]);
});

test("urgency maps onto ClickUp's priority scale", () => {
  assert.equal(decide(result({ urgency: { choice: "urgent" } })).priority, 1);
  assert.equal(decide(result({ urgency: { choice: "low" } })).priority, 4);
});

test("a bug with an unclear area still becomes an issue, labelled unknown", () => {
  const d = decide(result({ area: { confidence: 0.3 } }));
  assert.equal(d.createIssue, true);
  assert.equal(d.area, "unknown");
});

test("feature requests are tagged but get no priority and no issue", () => {
  const d = decide(result({ type: { choice: "feature_request" } }));
  assert.equal(d.kind, "feature_request");
  assert.equal(d.priority, undefined);
  assert.equal(d.createIssue, false);
  assert.deepEqual(d.tags, ["feature-request"]);
});

test("low type confidence goes to a person", () => {
  const d = decide(result({ type: { confidence: 0.5 } }));
  assert.equal(d.kind, "needs_review");
  assert.equal(d.createIssue, false);
});

test("unclear requests go to a person", () => {
  assert.equal(decide(result({ type: { choice: "unclear", confidence: 0.95 } })).kind, "needs_review");
});

test("a high needs-human score overrides a confident bug", () => {
  const d = decide(result({ needs_human: { noul: 0.8 } }));
  assert.equal(d.kind, "needs_review");
  assert.deepEqual(d.tags, ["needs-review"]);
});
