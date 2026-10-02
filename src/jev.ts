import { choice, noul, TypeSafeClient, type ChoiceCriteria, type SystemOneResult } from "@typesafe-ai/sdk";
import { AREAS, config } from "./config.ts";
import { mockFetch } from "./mock.ts";

export interface Ticket {
  title: string;
  description: string;
}

const areaCriteria: ChoiceCriteria = Object.fromEntries(
  Object.entries(AREAS).map(([name, area]) => [name, area.description]),
);

// Everything we ask Jev about a ticket. All four are answered in parallel, in one call.
export const questions = {
  type: choice("What kind of request has the client raised?", {
    bug: "Something is broken, erroring, or not behaving the way it should.",
    feature_request: "A request for new functionality or a change to how something works by design.",
    question: "The client is asking how to do something or asking for information; nothing is broken.",
    unclear: "Too vague or ambiguous to tell what the client needs.",
  }),
  urgency: choice("If this is a bug, how urgent is it for the client?", {
    urgent: "Production down, data loss, a security issue, or many users blocked with no workaround.",
    high: "A key workflow is broken for some users or a client deadline is at risk.",
    normal: "Something is wrong but there is a reasonable workaround.",
    low: "Cosmetic issue or minor annoyance.",
  }),
  area: choice("Which part of the system is most likely involved?", areaCriteria),
  needs_human: noul("A person should read this before any automated action is taken.", {
    true: "Ambiguous, sensitive (billing dispute, legal, security, angry escalation), or several unrelated issues.",
    false: "A clear, single issue that can be routed automatically.",
  }),
};

export type TriageResult = SystemOneResult<typeof questions>;

export interface Classification {
  result: TriageResult;
  latencyMs: number;
  costUsd: number;
  mock: boolean;
}

let client: TypeSafeClient | undefined;

const getClient = (): TypeSafeClient =>
  (client ??= config.jevMock
    ? new TypeSafeClient({ apiKey: "mock", fetch: mockFetch })
    : new TypeSafeClient());

export async function classify(ticket: Ticket): Promise<Classification> {
  const started = performance.now();
  const result = await getClient().systemOne({
    state: { title: ticket.title, description: ticket.description },
    questions,
  });
  return {
    result,
    latencyMs: Math.round(performance.now() - started),
    costUsd: (result.usage.input_tokens / 1_000_000) * config.jevUsdPerMillionInputTokens,
    mock: config.jevMock,
  };
}
