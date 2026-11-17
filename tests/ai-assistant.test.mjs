import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Load the dependency-free handler without changing the site's module format.
const source = await readFile(new URL("../supabase/functions/ai-assistant/handler.js", import.meta.url), "utf8");
const { createHandler } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const monthly = { task: "monthly-update", consent: true, win: "first customer", focus: "onboarding", ask: "pricing help" };
const coffee = { task: "coffee-chat", consent: true, chatId: "12345678-1234-1234-1234-123456789abc", goal: "Learn about sales" };
const validMonthly = { win: "Signed our first customer.", focus: "Improve onboarding.", ask: "Looking for pricing feedback." };
const validCoffee = { agenda: ["3 min: introductions", "8 min: goals", "4 min: next steps"], questions: ["What are you working on?", "What have you learned?", "How can we help each other?"] };

function fixture(options = {}) {
    const calls = { provider: [], rpc: [], selections: [] };
    const db = {
        auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: "me" } }, error: null }) },
        rpc: async name => {
            calls.rpc.push(name);
            return name === "is_member"
                ? { data: options.member !== false, error: options.memberError || null }
                : { data: options.allowed !== false, error: options.limitError || null };
        },
        from(table) {
            const query = {
                select(columns) { calls.selections.push({ table, columns }); return query; },
                eq() { return query; },
                maybeSingle: async () => ({
                    data: options.noChat ? null : { requester_id: options.unrelated ? "stranger" : "me", recipient_id: "them", status: options.chatStatus || "accepted" },
                    error: null
                }),
                in: async () => ({ data: [
                    { id: "me", role: "Founder", interests: "Sales", name: "PRIVATE NAME", email: "PRIVATE EMAIL" },
                    { id: "them", role: "CEO", interests: "Marketing", name: "OTHER PRIVATE NAME" }
                ], error: null })
            };
            return query;
        }
    };
    const handler = createHandler({
        createClient: (_url, _key, config) => {
            assert.equal(config.global.headers.Authorization, "Bearer user-jwt");
            assert.equal(config.auth.persistSession, false);
            return db;
        },
        env: name => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key", GEMINI_API_KEY: options.noKey ? "" : "test-secret" })[name],
        fetchImpl: async (url, init) => {
            calls.provider.push({ url, ...init });
            if (options.timeout) throw new Error("timeout");
            return new Response(JSON.stringify(options.payload || {
                candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(options.draft || validMonthly) }] } }]
            }), { status: options.providerStatus || 200 });
        }
    });
    return {
        calls,
        send: (body = monthly, authorization = "Bearer user-jwt", method = "POST") => handler(new Request("https://example.test/ai", {
            method, headers: { Authorization: authorization },
            ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {})
        }))
    };
}

test("monthly draft uses only submitted notes and never writes an update", async () => {
    const f = fixture();
    const result = await f.send();
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).draft, validMonthly);
    assert.deepEqual(f.calls.rpc, ["is_member", "consume_ai_request"]);
    assert.equal(f.calls.selections.length, 0);
    const sent = JSON.parse(f.calls.provider[0].body);
    assert.deepEqual(JSON.parse(sent.contents[0].parts[0].text), { win: monthly.win, focus: monthly.focus, ask: monthly.ask });
    assert.equal(f.calls.provider[0].headers["x-goog-api-key"], "test-secret");
    assert.ok(!f.calls.provider[0].url.includes("test-secret"));
});

for (const [name, options, body, auth, status] of [
    ["missing authorization", {}, monthly, "", 401],
    ["invalid session", { signedOut: true }, monthly, undefined, 401],
    ["unapproved account", { member: false }, monthly, undefined, 403],
    ["failed membership check", { memberError: {} }, monthly, undefined, 503],
    ["missing consent", {}, { ...monthly, consent: false }, undefined, 400],
    ["unsupported task", {}, { ...monthly, task: "free-chat" }, undefined, 400],
    ["invalid JSON", {}, "bad-json", undefined, 400],
    ["oversized request", {}, "x".repeat(12001), undefined, 413],
    ["blank notes", {}, { ...monthly, ask: " " }, undefined, 400],
    ["long field", {}, { ...monthly, win: "x".repeat(501) }, undefined, 400],
    ["missing provider key", { noKey: true }, monthly, undefined, 503],
    ["rate limited", { allowed: false }, monthly, undefined, 429],
    ["missing migration", { limitError: {} }, monthly, undefined, 503],
    ["invalid chat ID", {}, { ...coffee, chatId: "bad" }, undefined, 400],
    ["other person's chat", { unrelated: true }, coffee, undefined, 403],
    ["inaccessible chat", { noChat: true }, coffee, undefined, 403],
    ["unaccepted chat", { chatStatus: "sent" }, coffee, undefined, 409],
    ["cancelled chat", { chatStatus: "cancelled" }, coffee, undefined, 409]
]) {
    test(name + " is rejected before contacting Gemini", async () => {
        const f = fixture(options);
        assert.equal((await f.send(body, auth)).status, status);
        assert.equal(f.calls.provider.length, 0);
    });
}

test("coffee agenda excludes names, contact details, and chat messages", async () => {
    const f = fixture({ draft: validCoffee });
    assert.equal((await f.send(coffee)).status, 200);
    const sent = JSON.parse(JSON.parse(f.calls.provider[0].body).contents[0].parts[0].text);
    assert.deepEqual(sent, { memberA: { role: "Founder", interests: "Sales" }, memberB: { role: "CEO", interests: "Marketing" }, memberAGoal: coffee.goal });
    assert.deepEqual(f.calls.selections.map(x => x.columns), ["requester_id, recipient_id, status", "id, role, interests"]);
});

for (const [name, options, status] of [
    ["provider quota", { providerStatus: 429 }, 429],
    ["provider failure", { providerStatus: 403 }, 502],
    ["provider timeout", { timeout: true }, 504],
    ["malformed draft", { draft: { win: "Only a win" } }, 502],
    ["overlong output", { draft: { ...validMonthly, ask: "x".repeat(501) } }, 502],
    ["blocked output", { payload: { promptFeedback: { blockReason: "SAFETY" } } }, 502],
    ["truncated output", { payload: { candidates: [{ finishReason: "MAX_TOKENS" }] } }, 502]
]) {
    test(name + " produces a safe error", async () => {
        const response = await fixture(options).send();
        assert.equal(response.status, status);
        const result = await response.text();
        assert.ok(!result.includes("test-secret"));
        assert.ok(!result.includes(monthly.win));
    });
}

test("CORS preflight and unsupported HTTP methods do not call AI", async () => {
    const f = fixture();
    assert.equal((await f.send(null, "", "OPTIONS")).status, 204);
    assert.equal((await f.send(null, "", "GET")).status, 405);
    assert.equal(f.calls.provider.length, 0);
});

// A small DOM harness exercises draft review behavior without a browser dependency.
class Element {
    constructor() { this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.children = []; this.handlers = {}; this.textContent = ""; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); return item; }
    replaceChildren(...items) { this.children = items; }
    setAttribute() {}
    removeAttribute() {}
    focus() {}
    reportValidity() { return true; }
    async fire(event) { await this.handlers[event]?.({ preventDefault() {} }); }
}

async function monthlyUI(generate) {
    const html = await readFile(new URL("../dashboard.html", import.meta.url), "utf8");
    const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
    const save = new Element();
    elements["cohort-update-form"].querySelector = () => save;
    let saves = 0;
    const context = vm.createContext({
        document: { getElementById: id => elements[id], createElement: () => new Element() },
        window: { CEOXBAI: { generate } },
        getCurrentUser: async () => ({ id: "me" }),
        _supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }), upsert: async () => { saves++; return {}; } }) }
    });
    vm.runInContext(await readFile(new URL("../monthly-update.js", import.meta.url), "utf8"), context);
    await new Promise(resolve => setTimeout(resolve, 0));
    elements["cohort-win"].value = "original win";
    elements["cohort-focus"].value = "original focus";
    elements["cohort-ask"].value = "original ask";
    elements["monthly-ai-consent"].checked = true;
    return { elements, save, saves: () => saves };
}

test("monthly UI previews a draft without changing or saving notes; cancel preserves them", async () => {
    const ui = await monthlyUI(async () => validMonthly);
    await ui.elements["monthly-ai-generate"].fire("click");
    assert.equal(ui.elements["cohort-win"].value, "original win");
    assert.equal(ui.saves(), 0);
    assert.equal(ui.elements["monthly-ai-preview"].hidden, false);
    await ui.elements["monthly-ai-cancel"].fire("click");
    assert.equal(ui.elements["monthly-ai-preview"].hidden, true);
    assert.equal(ui.elements["cohort-win"].value, "original win");
});

test("monthly UI applies a draft only after approval, then saves through existing flow", async () => {
    const ui = await monthlyUI(async () => validMonthly);
    await ui.elements["monthly-ai-generate"].fire("click");
    await ui.elements["monthly-ai-use"].fire("click");
    assert.equal(ui.elements["cohort-win"].value, validMonthly.win);
    assert.equal(ui.saves(), 0);
    await ui.elements["cohort-update-form"].fire("submit");
    assert.equal(ui.saves(), 1);
});

test("monthly UI handles failure without losing notes or leaving save disabled", async () => {
    const ui = await monthlyUI(async () => { throw new Error("Quota reached"); });
    await ui.elements["monthly-ai-generate"].fire("click");
    assert.equal(ui.elements["cohort-win"].value, "original win");
    assert.equal(ui.elements["monthly-ai-status"].textContent, "Quota reached");
    assert.equal(ui.save.disabled, false);
});

test("monthly UI refuses a stale draft when notes change during generation", async () => {
    let finish;
    const ui = await monthlyUI(() => new Promise(resolve => { finish = resolve; }));
    const pending = ui.elements["monthly-ai-generate"].fire("click");
    assert.equal(ui.save.disabled, true);
    ui.elements["cohort-win"].value = "new win";
    finish(validMonthly);
    await pending;
    assert.equal(ui.elements["monthly-ai-preview"].hidden, true);
    assert.equal(ui.elements["cohort-win"].value, "new win");
    assert.equal(ui.save.disabled, false);
});

async function coffeeUI(generate) {
    const context = vm.createContext({
        window: {},
        document: { createElement: () => new Element(), createTextNode: value => ({ textContent: value }) }
    });
    vm.runInContext(await readFile(new URL("../ai-assistant.js", import.meta.url), "utf8"), context);
    context.window.CEOXBAI.generate = generate;
    const card = new Element();
    context.window.CEOXBAI.attachCoffeeAssistant(card, { id: coffee.chatId });
    const content = card.children[0].children[1];
    const [label, goal, consentLabel, notice, button, status, preview, dismiss] = content.children;
    return { goal, consent: consentLabel.children[0], button, status, preview, dismiss };
}

test("coffee UI requires consent before generating and never calls AI when unchecked", async () => {
    let calls = 0;
    const ui = await coffeeUI(async () => { calls++; return validCoffee; });
    await ui.button.fire("click");
    assert.equal(calls, 0);
    assert.match(ui.status.textContent, /confirm/);
});

test("coffee UI renders suggestions as text and lets the member dismiss them", async () => {
    const htmlLookingText = '<img src=x onerror="alert(1)">';
    const ui = await coffeeUI(async input => {
        assert.equal(input.chatId, coffee.chatId);
        assert.equal(input.goal, "Sales tips");
        return { ...validCoffee, questions: [htmlLookingText, "Question two?", "Question three?"] };
    });
    ui.goal.value = "Sales tips";
    ui.consent.checked = true;
    await ui.button.fire("click");
    assert.equal(ui.preview.hidden, false);
    const questions = ui.preview.children[3];
    assert.equal(questions.children[0].textContent, htmlLookingText);
    assert.equal(ui.button.disabled, false);
    await ui.dismiss.fire("click");
    assert.equal(ui.preview.hidden, true);
});

test("coffee UI recovers from quota failures", async () => {
    const ui = await coffeeUI(async () => { throw new Error("Quota reached"); });
    ui.consent.checked = true;
    await ui.button.fire("click");
    assert.equal(ui.status.textContent, "Quota reached");
    assert.equal(ui.button.disabled, false);
    assert.equal(ui.goal.disabled, false);
    assert.equal(ui.preview.hidden, true);
});
