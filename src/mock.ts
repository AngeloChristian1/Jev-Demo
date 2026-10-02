// A stand-in for the TypeSafe API, plugged into the real SDK through its `fetch` option.
// It answers with crude keyword matching so the rest of the pipeline can be built and
// rehearsed before there's an API key. Its accuracy means nothing; don't quote it.

import type { Question, SystemOneRequestPayload } from "@typesafe-ai/sdk";

const KEYWORDS: Record<string, Record<string, string[]>> = {
  type: {
    bug: ["error", "broken", "crash", "500", "502", "not working", "doesn't work", "does nothing", "fails", "failed", "bug", "can't", "cannot", "wrong", "missing", "redirect", "stuck", "blank", "down", "slow", "typo", "crashes", "never", "twice", "log in", "looks off", "different"],
    feature_request: ["would be nice", "could you add", "can you add", "feature", "ability to", "option to", "support for", "wish", "it'd be great", "would love", "can we have", "please add", "would be great", "we'd love", "export to"],
    question: ["how do i", "how can i", "is it possible", "where can i", "where do i", "what is the", "?"],
    unclear: ["weird", "strange", "odd", "not sure", "something"],
  },
  urgency: {
    urgent: ["down", "outage", "all users", "everyone", "data loss", "lost data", "security", "asap", "urgent", "nobody can"],
    high: ["deadline", "today", "this morning", "blocked", "clients", "can't", "cannot", "report is due"],
    normal: ["sometimes", "workaround", "occasionally"],
    low: ["typo", "colour", "color", "alignment", "cosmetic", "minor", "padding", "font"],
  },
  needs_human: {
    true: ["refund", "legal", "lawyer", "cancel", "furious", "unacceptable", "gdpr", "charged twice", "weird", "strange"],
  },
};

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);

function hitsFor(text: string, question: string, label: string, description: unknown): number {
  const keywords = KEYWORDS[question]?.[label];
  if (keywords) return keywords.filter((k) => text.includes(k)).length;
  // Unknown question (e.g. your own areas): overlap between the text and the label's description.
  const described = words(`${label} ${typeof description === "string" ? description : ""}`);
  return [...words(text)].filter((w) => w.length > 3 && [...described].some((d) => d.startsWith(w) || w.startsWith(d)))
    .length;
}

function softmax(scores: Record<string, number>): Record<string, number> {
  const exps = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.exp(v)]));
  const total = Object.values(exps).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(exps).map(([k, v]) => [k, v / total]));
}

function answer(name: string, question: Question, text: string) {
  if (question.type === "noul") {
    const hits = hitsFor(text, name, "true", question.criteria?.true);
    return { type: "noul", noul: Math.min(0.95, 0.15 + hits * 0.35) };
  }
  const labels =
    question.type === "choice"
      ? Object.entries(question.criteria)
      : question.criteria.map((d, i) => [String(i), d] as const);
  const scores = Object.fromEntries(
    labels.map(([label, description]) => [label, hitsFor(text, name, label, description) * 3]),
  );
  if (name === "type" && Object.values(scores).every((s) => s === 0)) scores.unclear = 3;
  if (name === "urgency" && Object.values(scores).every((s) => s === 0)) scores.normal = 2;
  const probabilities = softmax(scores);
  const [best, confidence] = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]!;
  if (question.type === "choice") return { type: "choice", choice: best, confidence, probabilities };
  const expected = Object.entries(probabilities).reduce((sum, [k, p]) => sum + Number(k) * p, 0);
  const legend = Object.fromEntries(labels);
  return { type: "score", score: expected, confidence, legend, probabilities };
}

export async function mockFetch(_url: string, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body)) as SystemOneRequestPayload;
  const text = JSON.stringify(body.state).toLowerCase();
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 170));

  const answers = Object.fromEntries(
    Object.entries(body.questions).map(([name, q]) => [name, answer(name, q, text)]),
  );
  const result = {
    model: `${body.model} (mock)`,
    answers,
    usage: { input_tokens: Math.ceil(JSON.stringify(body).length / 4), output_tokens: 0 },
  };
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json", "x-typesafe-request-id": `mock-${Date.now()}` },
  });
}
