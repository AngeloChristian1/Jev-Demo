# Jev ClickUp triage

Tech talk demo. A client raises a ticket in ClickUp. [Jev](https://typesafe.ai) decides whether it's a bug, a feature request, a question or unclear. Bugs get a priority and a GitHub issue in the right area. Anything Jev isn't sure about goes to a person.

```
ClickUp task created
   │  webhook
   ▼
src/server.ts ──► src/jev.ts ──── one Jev call, 4 questions in parallel:
                     │              type · urgency · area · needs a human?
                     ▼
                  src/decide.ts ── our rules: confidence thresholds → action
                     │
      ┌──────────────┼───────────────────────┐
      ▼              ▼                       ▼
     bug        feature / question      unsure / sensitive
  priority +        tag only             tag needs-review
  GitHub issue
      │
      ▼
  ClickUp comment with the reasons + issue link
```

## Quick start (no keys needed)

Requires Node 22.18 or newer. TypeScript runs directly, with no build step.

```sh
npm install
npm run try -- "The export button does nothing since this morning. Our report is due at 3pm."
npm run eval     # runs the 20 sample tickets in data/tickets.json
npm test
```

Without `TYPESAFE_API_KEY`, the app runs in **mock mode**. The real SDK is used, but its `fetch` is swapped for a local keyword matcher ([src/mock.ts](src/mock.ts)). That's good for rehearsing, but the accuracy numbers mean nothing. Only quote numbers from a run with a real key.

## Going live

1. `cp .env.example .env` and fill it in:
   - `TYPESAFE_API_KEY`: from TypeSafe (early access).
   - `CLICKUP_TOKEN`: ClickUp → Settings → Apps → API Token.
   - `CLICKUP_LIST_ID`: a **demo list** with fake tickets only. The id is in the list's URL.
   - `GITHUB_TOKEN` + `GITHUB_DEFAULT_REPO`: a throwaway repo. The token needs Issues read/write.
2. Expose your laptop to ClickUp with a fixed address. Every ngrok account gets one free dev domain, listed in the ngrok dashboard under **Domains**. Put it in `.env` as `PUBLIC_URL=https://your-name.ngrok-free.dev`, then run `npm run tunnel` (keep it running). A plain `ngrok http 3000` gets a new random address each time, and the webhook breaks.

   Only one person should run the server against the same ClickUp list. Two servers would both triage every ticket, and `npm run setup` replaces this app's webhook on that list.
3. `npm run setup`. This creates the ClickUp tags and GitHub labels, registers the webhook, and prints `CLICKUP_WEBHOOK_SECRET`. Add the secret to `.env`.
4. `npm start`, then create a task in the list and watch the terminal and ClickUp.

Use `DRY_RUN=1` to see what would be written without writing anything.

## Dashboard

`npm start`, then open **http://localhost:3000** and put it on the big screen. Each ticket moves through five stations as it happens, with a plain-English line for each step:

1. **Ticket arrives**
2. **Jev reads it**, with confidence bars for its four answers
3. **Our rules decide**, shown as a stamp
4. **Developers get an issue**
5. **ClickUp is updated**

A volunteer can also raise a ticket from the form on the left:

- **Live:** with ClickUp configured and no `DRY_RUN`, the form creates a real ClickUp task and runs the full flow.
- **Practice:** otherwise it runs a practice ticket that creates and changes nothing.

Steps are shown at least 0.75s apart so the room can follow. The time on the right of each step is the real time.

The dashboard only answers on this laptop. Requests through the ngrok address get a 404; only the ClickUp webhook is public.

## Customising

- **Areas / repos:** `AREAS` in [src/config.ts](src/config.ts). Each area can point to its own repo.
- **Questions:** [src/jev.ts](src/jev.ts). The label descriptions matter, because they're what Jev judges against.
- **Thresholds:** `config.thresholds`. Lower them and more tickets are handled automatically; raise them and more go to a person.

## On stage

1. Have ClickUp and the terminal side by side.
2. Ask someone non-technical to type a complaint, e.g. *"The export button does nothing since this morning, our report is due at 3pm."* It comes back as a bug with high priority, plus a GitHub issue.
3. A feature request: *"It'd be great to export to Excel too."* It's tagged as a feature request, with no issue.
4. Something vague: *"The app feels weird lately."* It goes to **needs-review**. This is the key moment: the AI knows when it doesn't know.
5. Show the `npm run eval` numbers (accuracy, median latency, total cost) from a real run.

**If something breaks:**

- **The webhook doesn't arrive:** set `CLICKUP_POLL_SECONDS=3` and restart. The server then checks the list itself.
- **Trigger a task by hand:** `curl -X POST localhost:3000/triage/<taskId>`.
- **Wi-Fi fails:** have a screen recording of a full run ready.

## Notes

- Tasks already carrying one of our tags are skipped, so repeated webhook deliveries don't create duplicate issues.
- The sync is one-way. Closing the GitHub issue doesn't update ClickUp; that's a possible next step.
- Never send real client, patient or employee data through the demo. Jev is in early access.
