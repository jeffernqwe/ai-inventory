// Phase 06 — AI provider selection, orchestration loop and HTTP failure
// mapping. Exercises the shipped aiConfig / aiErrors / provider registry /
// aiService over the registered 'fake' provider and the real routes. DB-backed
// sections fail loudly when MongoDB is unreachable (Phase 07F / M9).

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  startServer,
  makeApi,
  createTracker,
  registerOwner,
  disconnectDb,
} from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';
import Product from '../src/models/product.model.js';
import { ROLES } from '../src/constants/roles.js';
import { AiNotConfigured, AiProviderError } from '../src/services/ai/aiErrors.js';
import { selectProvider, registeredProviders } from '../src/services/ai/providers/index.js';
import { runAiChat } from '../src/services/ai/ai.service.js';
import {
  registerFakeProvider,
  setFakeScenario,
  fakeText,
  fakeCalls,
  lastToolResult,
} from './fakes/aiProvider.mjs';

// Make the shared per-user limiter permissive for this whole file.
process.env.AI_RATE_LIMIT_MAX = '1000';

registerFakeProvider();

const { dbOk, baseUrl, server } = await startServer();
const api = makeApi(baseUrl);
const tracker = createTracker(dbOk);

let owner;

/** Temporarily set (or unset) an env var, returning a restore function. */
function withEnv(key, value) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = String(value);
  return () => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  };
}

async function chat(token, body) {
  return api('POST', '/api/ai/chat', { token, body });
}

afterEach(() => {
  setFakeScenario(null);
});

after(async () => {
  await tracker.cleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDb();
});

// ---------------------------------------------------------------------------
// Provider selection — no database required.
// ---------------------------------------------------------------------------
unitSuite('Phase 06 — AI provider selection', () => {
  it('registered provider catalog contains the fake used by tests', () => {
    assert.ok(registeredProviders().includes('fake'));
  });

  it('selects the registered fake provider when AI_PROVIDER=fake', () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      const p = selectProvider();
      assert.equal(p.name, 'fake');
    } finally {
      restore();
    }
  });

  it('unset AI_PROVIDER disables the assistant with AiNotConfigured', () => {
    const restore = withEnv('AI_PROVIDER', '');
    try {
      assert.throws(() => selectProvider(), (err) => {
        assert.ok(err instanceof AiNotConfigured);
        assert.match(err.message, /AI_PROVIDER is not set/);
        return true;
      });
    } finally {
      restore();
    }
  });

  it('an unsupported provider name throws AiNotConfigured mentioning the value', () => {
    const restore = withEnv('AI_PROVIDER', 'gpt-9');
    try {
      assert.throws(() => selectProvider(), (err) => {
        assert.ok(err instanceof AiNotConfigured);
        assert.match(err.message, /not supported/);
        assert.match(err.message, /gpt-9/);
        return true;
      });
    } finally {
      restore();
    }
  });

  it('claude without ANTHROPIC_API_KEY throws AiNotConfigured', () => {
    const restoreKey = withEnv('ANTHROPIC_API_KEY', undefined);
    const restoreProvider = withEnv('AI_PROVIDER', 'claude');
    try {
      assert.throws(() => selectProvider(), (err) => {
        assert.ok(err instanceof AiNotConfigured);
        assert.match(err.message, /ANTHROPIC_API_KEY/);
        return true;
      });
    } finally {
      restoreKey();
      restoreProvider();
    }
  });

  it('gemini without GEMINI_API_KEY throws AiNotConfigured', () => {
    const restoreKey = withEnv('GEMINI_API_KEY', undefined);
    const restoreProvider = withEnv('AI_PROVIDER', 'gemini');
    try {
      assert.throws(() => selectProvider(), (err) => {
        assert.ok(err instanceof AiNotConfigured);
        assert.match(err.message, /GEMINI_API_KEY/);
        return true;
      });
    } finally {
      restoreKey();
      restoreProvider();
    }
  });

  it('agentrouter without AGENTROUTER_API_KEY throws AiNotConfigured', () => {
    const restoreKey = withEnv('AGENTROUTER_API_KEY', undefined);
    const restoreProvider = withEnv('AI_PROVIDER', 'agentrouter');
    try {
      assert.throws(() => selectProvider(), (err) => {
        assert.ok(err instanceof AiNotConfigured);
        assert.match(err.message, /AGENTROUTER_API_KEY/);
        return true;
      });
    } finally {
      restoreKey();
      restoreProvider();
    }
  });

  it('agentrouter with a key but no base URL throws AiNotConfigured', () => {
    const restoreKey = withEnv('AGENTROUTER_API_KEY', 'ar_test_key');
    const restoreBase = withEnv('AGENTROUTER_BASE_URL', undefined);
    const restoreProvider = withEnv('AI_PROVIDER', 'agentrouter');
    try {
      assert.throws(() => selectProvider(), (err) => {
        assert.ok(err instanceof AiNotConfigured);
        assert.match(err.message, /AGENTROUTER_BASE_URL/);
        return true;
      });
    } finally {
      restoreKey();
      restoreBase();
      restoreProvider();
    }
  });

  it('agentrouter fully configured selects a provider named agentrouter', () => {
    const restoreKey = withEnv('AGENTROUTER_API_KEY', 'ar_test_key');
    const restoreBase = withEnv('AGENTROUTER_BASE_URL', 'http://127.0.0.1:9');
    const restoreProvider = withEnv('AI_PROVIDER', 'agentrouter');
    try {
      const p = selectProvider();
      assert.equal(p.name, 'agentrouter');
    } finally {
      restoreKey();
      restoreBase();
      restoreProvider();
    }
  });
});

// ---------------------------------------------------------------------------
// Orchestration loop (runAiChat) — needs one seeded business for tool calls.
// ---------------------------------------------------------------------------
dbSuite('Phase 06 — AI orchestration loop', dbOk, () => {
  before(async () => {
    owner = await registerOwner(api, tracker);
    setFakeScenario(null);
  });

  it('returns the provider text when no tool is called (iterations 1)', async () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      setFakeScenario(() => fakeText('Hello! I can help with your inventory.'));
      const out = await runAiChat({
        businessId: owner.businessId,
        userId: owner.userId,
        role: ROLES.OWNER,
        message: 'Hi there',
      });
      assert.equal(out.content, 'Hello! I can help with your inventory.');
      assert.deepEqual(out.toolsUsed, []);
      assert.equal(out.iterations, 1);
      assert.equal(out.model, 'fake-model');
    } finally {
      restore();
    }
  });

  it('executes a tool, feeds the result back and returns a DB-backed answer', async () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      let turn = 0;
      setFakeScenario((ctx) => {
        turn += 1;
        if (turn === 1) {
          return fakeCalls([{ id: 'c1', name: 'getLowStockProducts', input: { limit: 50 } }]);
        }
        const result = lastToolResult(ctx);
        return fakeText(`low-stock-count=${result?.result?.count ?? 'missing'}`);
      });
      const out = await runAiChat({
        businessId: owner.businessId,
        userId: owner.userId,
        role: ROLES.OWNER,
        message: 'Any low stock?',
      });
      assert.match(out.content, /low-stock-count=0/);
      assert.deepEqual(out.toolsUsed, ['getLowStockProducts']);
      assert.equal(out.iterations, 2);
    } finally {
      restore();
    }
  });

  it('an unknown (write-shaped) tool is soft-denied and writes nothing', async () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      let turn = 0;
      setFakeScenario((ctx) => {
        turn += 1;
        if (turn === 1) {
          return fakeCalls([
            { id: 'w1', name: 'createProduct', input: { name: 'Hacked Product', price: 1 } },
          ]);
        }
        const results = ctx.messages
          .filter((m) => m.role === 'tool')
          .map((m) => {
            try {
              return JSON.parse(m.content);
            } catch {
              return null;
            }
          });
        return fakeText(`tool-result-code=${results[0]?.code}`);
      });
      const out = await runAiChat({
        businessId: owner.businessId,
        userId: owner.userId,
        role: ROLES.OWNER,
        message: 'Create a product for me',
      });
      // The tool catalog has no write tool: the call becomes a TOOL_NOT_FOUND
      // result the assistant can see, and the loop continues to a final answer.
      assert.match(out.content, /tool-result-code=TOOL_NOT_FOUND/);
      assert.deepEqual(out.toolsUsed, ['createProduct']);
      assert.equal(out.iterations, 2);
      const count = await Product.countDocuments({ businessId: owner.businessId });
      assert.equal(count, 0, 'no product may be created through the AI layer');
    } finally {
      restore();
    }
  });

  it('a model that never stops calling tools is bounded by AI_MAX_TOOL_ITERATIONS', async () => {
    const restoreIter = withEnv('AI_MAX_TOOL_ITERATIONS', '2');
    const restoreProvider = withEnv('AI_PROVIDER', 'fake');
    try {
      setFakeScenario(() => fakeCalls([{ id: 'x', name: 'getLowStockProducts', input: {} }]));
      const out = await runAiChat({
        businessId: owner.businessId,
        userId: owner.userId,
        role: ROLES.OWNER,
        message: 'keep looking',
      });
      assert.equal(out.iterations, 2);
      assert.match(out.content, /could not finish that request within the allowed number of steps/);
      assert.deepEqual(out.toolsUsed, ['getLowStockProducts']);
    } finally {
      restoreIter();
      restoreProvider();
    }
  });

  it('an AiProviderError thrown by the provider propagates unchanged', async () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      setFakeScenario(() => {
        throw new AiProviderError('upstream exploded');
      });
      await assert.rejects(
        runAiChat({ businessId: owner.businessId, userId: owner.userId, role: ROLES.OWNER, message: 'hi' }),
        (err) => {
          assert.ok(err instanceof AiProviderError);
          assert.equal(err.message, 'upstream exploded');
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  it('an unexpected provider error is wrapped into an AiProviderError', async () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      setFakeScenario(() => {
        throw new Error('kernel panic sk-PRIVATE-SECRET');
      });
      await assert.rejects(
        runAiChat({ businessId: owner.businessId, userId: owner.userId, role: ROLES.OWNER, message: 'hi' }),
        (err) => {
          assert.ok(err instanceof AiProviderError, 'generic provider errors must be wrapped');
          assert.ok(!err.message.includes('sk-PRIVATE-SECRET'), 'secrets must never reach error messages');
          return true;
        }
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP mapping of failures over the real chat route.
// ---------------------------------------------------------------------------
dbSuite('Phase 06 — HTTP failure mapping', dbOk, () => {
  before(async () => {
    if (!owner) owner = await registerOwner(api, tracker);
  });

  it('chat requires authentication (401)', async () => {
    const res = await chat(undefined, { message: 'hello' });
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'AUTH_REQUIRED');
  });

  it('unset provider -> 503 AI_NOT_CONFIGURED, body has no secrets', async () => {
    const restore = withEnv('AI_PROVIDER', '');
    try {
      setFakeScenario(() => fakeText('ok'));
      const res = await chat(owner.token, { message: 'hello' });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, 'AI_NOT_CONFIGURED');
      const body = JSON.stringify(res.json).toLowerCase();
      assert.ok(!body.includes('anthropic'), 'no provider name leak');
      assert.ok(!body.includes('mongodb'), 'no db leak');
      assert.ok(!body.includes('apikey'), 'no key leak');
    } finally {
      restore();
    }
  });

  it('unsupported provider -> 503 AI_NOT_CONFIGURED', async () => {
    const restore = withEnv('AI_PROVIDER', 'gpt-9');
    try {
      const res = await chat(owner.token, { message: 'hello' });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, 'AI_NOT_CONFIGURED');
    } finally {
      restore();
    }
  });

  it('claude configured without a key -> 503 AI_NOT_CONFIGURED', async () => {
    const restoreKey = withEnv('ANTHROPIC_API_KEY', undefined);
    const restoreProvider = withEnv('AI_PROVIDER', 'claude');
    try {
      const res = await chat(owner.token, { message: 'hello' });
      assert.equal(res.status, 503);
      assert.equal(res.json.code, 'AI_NOT_CONFIGURED');
    } finally {
      restoreKey();
      restoreProvider();
    }
  });

  it('provider failure -> 502 AI_UNAVAILABLE with a safe generic body', async () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      setFakeScenario(() => {
        throw new AiProviderError('upstream said SUPA-SECRET');
      });
      const res = await chat(owner.token, { message: 'hello' });
      assert.equal(res.status, 502);
      assert.equal(res.json.code, 'AI_UNAVAILABLE');
      const body = JSON.stringify(res.json).toLowerCase();
      assert.ok(!body.includes('supa-secret'), 'provider details must not reach the client');
    } finally {
      restore();
    }
  });

  it('unexpected provider error -> 502 with a secret-free body', async () => {
    const restore = withEnv('AI_PROVIDER', 'fake');
    try {
      setFakeScenario(() => {
        throw new Error('boom ANTHROPIC_API_KEY=sk-live');
      });
      const res = await chat(owner.token, { message: 'hello' });
      assert.equal(res.status, 502);
      assert.equal(res.json.code, 'AI_UNAVAILABLE');
      const body = JSON.stringify(res.json).toLowerCase();
      assert.ok(!body.includes('sk-live'), 'leaked key value must never be echoed');
    } finally {
      restore();
    }
  });

  it('chat is rate-limited per user (429 AI_RATE_LIMITED + Retry-After)', async () => {
    const restoreMax = withEnv('AI_RATE_LIMIT_MAX', '2');
    const restoreWin = withEnv('AI_RATE_LIMIT_WINDOW_MS', '60000');
    const restoreProvider = withEnv('AI_PROVIDER', 'fake');
    // Fresh user so this test owns its own (empty) rate-limit window.
    const rlOwner = await registerOwner(api, tracker);
    try {
      setFakeScenario(() => fakeText('ok'));
      const first = await chat(rlOwner.token, { message: 'one' });
      const second = await chat(rlOwner.token, { message: 'two' });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);

      const raw = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${rlOwner.token}` },
        body: JSON.stringify({ message: 'three' }),
      });
      assert.equal(raw.status, 429);
      assert.equal(raw.headers.get('retry-after'), '60');
      const json = await raw.json();
      assert.equal(json.code, 'AI_RATE_LIMITED');
    } finally {
      restoreMax();
      restoreWin();
      restoreProvider();
    }
  });
});
