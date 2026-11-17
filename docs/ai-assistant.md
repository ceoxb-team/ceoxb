# Gemini AI assistants

Implemented on `backend-ai-incorporation-rachit`:

- Dashboard: **Improve my wording** turns the three monthly update fields into a reviewable draft. **Use this draft** fills the fields; only the existing Save button writes to the database. Cancel, errors, and edits during generation preserve the member's notes.
- Coffee Chats: accepted requests have **Help me prepare with AI**, an optional goal, a 15-minute agenda, and three conversation starters. Drafts are not saved or sent to the other participant.

## Activate in Supabase

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/api-keys). For free testing, use a project on Google's free API tier. A key alone doesn't guarantee free usage if billing is enabled. Check the project's tier, model availability, and quota in AI Studio.
2. In your Supabase project's **Edge Functions → Secrets**, save `GEMINI_API_KEY` with that key. Never paste it into frontend code, GitHub, or chat. An Owner or Administrator may need to do this.
3. Optional: set `GEMINI_MODEL` to another supported text model. The default is `gemini-2.5-flash-lite`, which Google currently lists with free-tier input/output. Recheck [pricing and availability](https://ai.google.dev/gemini-api/docs/pricing) before changing it. There is no automatic paid-model fallback.
4. Apply `supabase/migrations/20261117000000_ai_usage.sql`. This creates private request counters and the `consume_ai_request` function. It adds no AI content to the database. With the CLI, after reviewing pending migrations:

   ```powershell
   supabase login
   supabase link --project-ref tbvscjpaqbyshqoieqvu
   supabase db push --dry-run
   supabase db push
   ```

   Alternatively, run that migration's SQL in the Supabase SQL Editor for your intended test project. Do not reapply it if the CLI has already applied it.
5. Deploy the function, keeping JWT verification enabled:

   ```powershell
   supabase functions deploy ai-assistant
   ```

6. Serve the updated website using your usual local development server and sign in as an approved member. If you use a separate Supabase test project, point your local `supabase.js` configuration to it and link/deploy to that project's reference instead. A Git branch does not isolate a shared Supabase backend.

The deployed function reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` supplied by Supabase. It verifies the user's session using Auth, checks `is_member`, and uses the caller's credentials for database access. No service-role key is needed.

## Data and usage

Both tools require a user-checked data notice before sending anything to Gemini. The free tier may use prompts and responses to improve Google's products; use fictional profiles and sample notes while developing. Review [Google's terms](https://ai.google.dev/gemini-api/terms) before using real member data.

Monthly requests send only the three submitted fields. Coffee requests send only the two profiles' roles and interests plus the caller's optional goal, labeled Member A and Member B. Names, company names, email, chat messages, monthly updates, and facilitator notes are not intentionally included. Free-text fields can still contain identifying information: review sample data accordingly.

The backend checks that coffee chats are accepted and belong to the caller. It limits every approved member to 10 AI attempts per UTC day, combined across both tools, with at least 15 seconds between requests. Counters are atomic across function instances. Provider failures after reserving a request count toward the limit. Provider limits can be lower and are shared by your Google project; the application limit does not guarantee free billing or reserve provider quota. Configure Google's project quota/billing controls too.

Prompts and drafts aren't written to application tables or explicitly logged by this function. This does not override Google's or Supabase's infrastructure retention policies. Only approved monthly updates use the existing save flow.

## Validation

With Node.js 22+ installed:

```powershell
node --test tests/ai-assistant.test.mjs
```

Automated tests mock Supabase and Gemini; they do not send member data or require an API key. They cover authentication, member access, chat ownership, accepted status, validation, missing setup, limits, provider failures, output validation, minimal provider inputs, and monthly draft review/cancel/save behavior.

After deployment, manually check with two test member accounts:

1. Improve fictional monthly notes. Verify generation doesn't save or overwrite fields until **Use this draft**, and Cancel preserves notes.
2. Edit notes while generation is pending. A stale draft should be discarded.
3. Save an approved update and reload to confirm the existing persistence works.
4. Accept a coffee request, generate an agenda, and verify three agenda sections and three questions. Pending/cancelled chats must not offer preparation.
5. Call the endpoint for an unrelated chat ID; it must refuse access.
6. Confirm a signed-out or unapproved account cannot call the function.
7. Generate twice within 15 seconds to check the cooldown; inspect the private counters as an administrator if needed. Test the daily cap with test accounts.
8. Check missing-key, unavailable-model, and exhausted-provider-quota messages. Original notes must remain intact.
9. Check mobile and dark-mode layouts, keyboard access, and visible loading states.

This implementation has no built-in fake AI success response. Without the deployed migration, function, and valid provider key, it reports setup errors.

## References

- [Gemini generateContent API](https://ai.google.dev/api/generate-content)
- [Supabase function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase function deployment](https://supabase.com/docs/guides/functions/deploy)
