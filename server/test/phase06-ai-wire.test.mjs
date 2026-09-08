// Phase 06 — AgentRouter wire mapping (no database, no live credentials).
//
// Verifies the AgentRouter provider (an Anthropic-compatible gateway) sends the
// exact /v1/messages payload, carries its key only in the Authorization header,
// parses tool_use/text responses, and sanitizes upstream failures so no secret
// ever reaches the caller. Runs against a local HTTP server so it is fully
// deterministic and offline.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { aiConfig } from '../src/services/ai/aiConfig.js';
import { AiProviderError } from '../src/services/ai/aiErrors.js';
import { createAgentrouterProvider } from '../src/services/ai/providers/agentrouterProvider.js';

const TEST_KEY = 'ar_wire_test_key';
const TEST_TOOLS = [
  {
    name: 'getLowStockProducts',
    description: 'Products whose available quantity is at or below their minimum stock.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
    },
  },
];

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

let server;
let port;
const requests = [];
let respond = { status: 200, json: {} };

async function listen() {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = { _raw: raw };
      }
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(respond.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(respond.json));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
}

function lastRequest() {
  return requests[requests.length - 1];
}

function providerFor(baseUrl) {
  const restoreKey = withEnv('AGENTROUTER_API_KEY', TEST_KEY);
  const restoreBase = withEnv('AGENTROUTER_BASE_URL', baseUrl);
  try {
    return createAgentrouterProvider();
  } finally {
    restoreKey();
    restoreBase();
  }
}

before(async () => {
  await listen();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  requests.length = 0;
  respond = { status: 200, json: {} };
});

describe('Phase 06 — AgentRouter (Anthropic-compatible) wire mapping', () => {
  it('posts an Anthropic /v1/messages request with Bearer auth and the configured model', async () => {
    const provider = providerFor(`http://127.0.0.1:${port}`);
    respond.json = {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'deepseek-v4-flash',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'getLowStockProducts', input: { limit: 5 } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 20 },
    };

    const out = await provider.complete({
      system: 'You are read-only.',
      messages: [{ role: 'user', content: 'Any low stock?' }],
      tools: TEST_TOOLS,
    });

    const req = lastRequest();
    assert.equal(new URL(req.url, `http://127.0.0.1:${port}`).pathname, '/v1/messages');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['content-type'], 'application/json');
    // Key travels only in the Authorization header.
    assert.equal(req.headers.authorization, `Bearer ${TEST_KEY}`);
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    // AgentRouter only accepts traffic that looks like the Claude Code client.
    assert.match(req.headers['user-agent'], /^claude-cli\/\S+ \(external, sdk-cli\)/);
    assert.equal(req.headers['anthropic-beta'], 'claude-code-20250219');

    const cfg = aiConfig();
    assert.equal(req.body.model, cfg.agentrouterModel);
    assert.equal(req.body.max_tokens, cfg.maxOutputTokens);
    assert.equal(req.body.system, 'You are read-only.');
    assert.equal(req.body.tools[0].name, 'getLowStockProducts');
    assert.equal(req.body.tools[0].input_schema.type, 'object');
    assert.equal(req.body.messages[req.body.messages.length - 1].role, 'user');

    // tool_use parses back into the neutral contract.
    assert.deepEqual(out.toolCalls, [{ id: 'tu_1', name: 'getLowStockProducts', input: { limit: 5 } }]);
    assert.equal(out.text, '');
    assert.equal(out.model, 'deepseek-v4-flash');
    assert.deepEqual(out.usage, { inputTokens: 100, outputTokens: 20 });
  });

  it('feeds tool results back as Anthropic tool_result blocks and parses final text', async () => {
    const provider = providerFor(`http://127.0.0.1:${port}`);
    respond.json = {
      id: 'msg_2',
      model: 'deepseek-v4-flash',
      content: [{ type: 'text', text: 'Low stock: 3 products.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 130, output_tokens: 11 },
    };

    const out = await provider.complete({
      system: 'You are read-only.',
      messages: [
        { role: 'user', content: 'Any low stock?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'tu_1', name: 'getLowStockProducts', input: { limit: 5 } }],
        },
        {
          role: 'tool',
          name: 'getLowStockProducts',
          toolCallId: 'tu_1',
          content: JSON.stringify({ ok: true, result: { count: 3 } }),
        },
      ],
      tools: TEST_TOOLS,
    });

    const req = lastRequest();
    const [user, assistant, toolResult] = req.body.messages;
    assert.equal(user.role, 'user');
    assert.equal(user.content, 'Any low stock?');
    assert.equal(assistant.role, 'assistant');
    assert.equal(assistant.content[0].type, 'tool_use');
    assert.equal(assistant.content[0].id, 'tu_1');
    assert.equal(toolResult.role, 'user', 'tool results are wrapped in a user message');
    assert.equal(toolResult.content[0].type, 'tool_result');
    assert.equal(toolResult.content[0].tool_use_id, 'tu_1');
    assert.equal(toolResult.content[0].content, JSON.stringify({ ok: true, result: { count: 3 } }));

    assert.equal(out.text, 'Low stock: 3 products.');
    assert.deepEqual(out.toolCalls, []);
    assert.equal(out.model, 'deepseek-v4-flash');
  });

  it('does not double-append /v1/messages when the base URL already ends with it', async () => {
    const provider = providerFor(`http://127.0.0.1:${port}/v1/messages`);
    respond.json = { id: 'm', model: 'deepseek-v4-flash', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' };

    await provider.complete({
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: TEST_TOOLS,
    });

    const req = lastRequest();
    const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    assert.equal(path, '/v1/messages');
    assert.ok(!path.endsWith('/v1/messages/v1/messages'));
  });

  it('maps upstream HTTP errors to an AiProviderError whose body leaks nothing', async () => {
    const provider = providerFor(`http://127.0.0.1:${port}`);
    respond.status = 401;
    respond.json = { error: { type: 'authentication_error', message: `invalid api key ${TEST_KEY} (secret)` } };

    await assert.rejects(
      provider.complete({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: TEST_TOOLS }),
      (err) => {
        assert.ok(err instanceof AiProviderError);
        assert.ok(!err.message.includes(TEST_KEY), 'api key must never appear in the error message');
        assert.ok(!err.message.includes('secret'));
        return true;
      }
    );
  });

  it('maps network failures to a generic AiProviderError with no key echo', async () => {
    // Point at a closed loopback port so fetch fails fast with ECONNREFUSED.
    const provider = providerFor('http://127.0.0.1:9');
    await assert.rejects(
      provider.complete({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: TEST_TOOLS }),
      (err) => {
        assert.ok(err instanceof AiProviderError);
        assert.ok(!err.message.includes(TEST_KEY));
        assert.match(err.message, /could not be reached/);
        return true;
      }
    );
  });
});
