# CEO XB AI feature handoff — November 16, 2026

## Scrum update

"I implemented two Gemini-powered features on my backend branch: an assistant that polishes monthly Win/Focus/Ask updates, and a coffee chat preparation tool that generates a 15-minute agenda and three questions. Both include frontend controls and an authenticated Supabase function. All 35 automated tests passed using mocked services. Next I need to finish Gemini secret configuration, apply the usage-counter migration, deploy the function, and test with real responses and two member accounts."

Status is implementation complete, live integration not yet verified. Do not describe the features as fully deployed or production-tested.

## Repository and branch

- Repository: https://github.com/ceoxb-team/ceoxb
- Current branch: `backend-ai-incorporation-rachit`
- Feature commit: `9e16cfe` — Add Gemini coffee chat and monthly update assistants.
- Setup guide branch-name correction: `495987d`.
- The code was initially pushed to `backend-rachit`; the current checkout now tracks the renamed branch above. Use the current branch on the Mac.

## Continue on a Mac

For a new checkout:

```sh
git clone --branch backend-ai-incorporation-rachit https://github.com/ceoxb-team/ceoxb.git
cd ceoxb
```

For an existing checkout, first check `git status` and preserve any local work. Then:

```sh
git fetch origin
git switch backend-ai-incorporation-rachit
git pull --ff-only origin backend-ai-incorporation-rachit
```

If the local branch does not exist, use `git switch --track origin/backend-ai-incorporation-rachit` instead. Do not use hard reset or clean commands on a Mac checkout with work you want to keep.

Open this folder in your editor. In a new assistant conversation, say:

> Read docs/scrum-handoff.md and docs/ai-assistant.md. Continue setting up and verifying the Gemini monthly update and coffee chat assistants on backend-ai-incorporation-rachit. Check current deployment and secret status before changing anything. Keep API keys out of chat and GitHub. Do not merge into main.

This document is a project handoff, not a full conversation transcript. Git transfers committed project files; it does not transfer local assistant chat history, editor settings, or credentials.

## What was built

- `dashboard.html`, `monthly-update.js`: **Improve my wording**, data notice, draft preview, Use/Cancel, existing save flow. Generating never automatically saves the update. Notes changed during generation invalidate the returned draft.
- `coffee.html`, `coffee-ui.js`, `ai-assistant.js`: **Help me prepare with AI** on accepted chats, an optional goal, generated agenda/questions, dismiss control. No automatic sending or saving of the agenda.
- `supabase/functions/ai-assistant/`: backend verifies the Supabase session, approved membership, accepted chat status and participation. Uses caller-scoped database reads, not a service-role client. Gemini credentials stay on the backend.
- `supabase/migrations/20261117000000_ai_usage.sql`: atomic per-member counters, 10 attempts per UTC day and a 15-second cooldown, shared across both features.
- `tests/ai-assistant.test.mjs`: 35 automated tests passed with mocked Supabase/Gemini and a minimal DOM harness. Browser layout, real Gemini output, actual SQL execution, and deployed authentication still require verification.
- `.gitignore`: excludes local environment secrets.

## Current setup checkpoint

The user opened Google AI Studio's Create Key dialog and then the Supabase Edge Functions page. Instructions were given to create a key and save it under **Edge Functions → Secrets**, with name `GEMINI_API_KEY`. Completion has NOT been confirmed. No secret value was requested or placed in code.

The latest supplied Supabase screenshot showed only `submit-application` deployed. Deployment of `ai-assistant` and application of the AI usage migration have NOT been confirmed.

## Next steps with classmates

1. Confirm the Gemini project is on the intended free tier and a key exists.
2. Confirm `GEMINI_API_KEY` is saved in Supabase Edge Function secrets. An Owner/Administrator may need to set it. Do not expose its value in screenshots, chat, commits, or frontend code.
3. Review and apply the AI usage migration once. Check migration history before running it; don't blindly reapply SQL.
4. Deploy `ai-assistant` with JWT verification enabled. The existing `submit-application` function is separate.
5. Run local automated tests with Node.js 22+: `node --test tests/ai-assistant.test.mjs`.
6. Test both pages with fictional data and two approved member accounts. Confirm saving/reloading monthly updates, draft cancel behavior, chat permissions, pending/cancelled chat exclusion, cooldowns, provider errors, and mobile/dark-mode layout.
7. Review a PR with teammates before merging into `main`.

See [ai-assistant.md](ai-assistant.md) for exact deployment steps and the full manual checklist.

## Decisions and limits

- Provider selected: Google Gemini, to use an available free API tier during class development.
- Default model: `gemini-2.5-flash-lite`; optional backend secret `GEMINI_MODEL` can override it. Check current provider model availability/quota before testing. No automatic paid-model fallback.
- Free-tier prompts/responses may be used to improve Google's products. Use sample member data while developing.
- Monthly requests send only submitted Win/Focus/Ask notes. Coffee requests send profile roles/interests and the requesting member's optional goal. Names/contact information/private updates are not intentionally included; free-text fields can still contain identifying information.
- No real provider request or live database test was performed during implementation.
- A Git branch does not create a separate Supabase project. The existing project reference is `tbvscjpaqbyshqoieqvu`; coordinate changes to that shared backend or use a test project.

## Earlier conversation context

The Windows project was updated from `bcbe8f3` to GitHub main `29ece2f` (73 commits). The user explicitly authorized discarding local edits and untracked files. The old local `docs/coffee-requests.md` was removed then; an editor tab may still show it. The current AI docs are newly added files.

That update included cohorts, database-backed member features, coffee request accept/decline, monthly updates, profile extras, navigation/design changes, and reCAPTCHA changes. Code inspection found browser-local calendar time handling, profile schema/RLS and authentication linkage. Those observations were code inspection, not an end-to-end audit of the live site.

No Cloudflare configuration was found in the repository. Cloudflare hosting or DNS outside the repository was not verified.
