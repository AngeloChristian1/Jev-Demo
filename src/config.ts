// All runtime configuration lives here. Values come from .env (see .env.example).

const env = (name: string, fallback = ""): string => process.env[name]?.trim() || fallback;

export const config = {
  port: Number(env("PORT", "3000")),

  // No API key yet? Mock mode answers locally with keyword heuristics, through the real SDK.
  jevMock: env("JEV_MOCK") === "1" || !env("TYPESAFE_API_KEY"),

  // Log what would be written to ClickUp/GitHub instead of writing it.
  dryRun: env("DRY_RUN") === "1",

  clickup: {
    token: env("CLICKUP_TOKEN"),
    listId: env("CLICKUP_LIST_ID"),
    teamId: env("CLICKUP_TEAM_ID"),
    webhookSecret: env("CLICKUP_WEBHOOK_SECRET"),
    // Fallback if the webhook can't reach you: check the list every N seconds (0 = off).
    pollSeconds: Number(env("CLICKUP_POLL_SECONDS", "0")),
  },

  github: {
    token: env("GITHUB_TOKEN"),
    defaultRepo: env("GITHUB_DEFAULT_REPO"), // "owner/repo"
  },

  // Below these confidence levels, a person looks at the ticket instead.
  thresholds: {
    type: 0.7,
    area: 0.5,
    needsHuman: 0.6,
  },

  // Published input price; output tokens are free.
  jevUsdPerMillionInputTokens: 0.042,
};

// The parts of the system Jev can route a bug to. Edit these to match your product.
// `repo` is optional; without it the issue goes to GITHUB_DEFAULT_REPO with an area label.
export const AREAS: Record<string, { description: string; repo?: string }> = {
  api: {
    description: "Backend API, server errors (500/502), data not saving or loading, integrations, webhooks, exports.",
  },
  web: {
    description: "Web app user interface: pages, buttons, forms, layout, display problems in the browser.",
  },
  mobile: {
    description: "iOS or Android app: crashes on the phone, app store builds, push notifications.",
  },
  auth: {
    description: "Login, sign-in, passwords, sessions, permissions, access denied, SSO.",
  },
  infra: {
    description: "Whole site down or slow, deployments, outages, timeouts across everything.",
  },
};

export const repoForArea = (area: string): string => AREAS[area]?.repo || config.github.defaultRepo;
