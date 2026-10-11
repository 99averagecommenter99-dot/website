const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.GEMINI_API_KEY = 'test-only-key';
const api = require('./api.js');
const vercelRoute = require('./api/index.js');
const { isAllowedOrigin } = api;
const realFetch = global.fetch;
let origin;
let providerStatus = 200;
let providerPayload = { candidates: [{ content: { parts: [{ text: 'Hint: split the shape in half.\nStep 1: find the area of each part.' }] } }] };
let providerCalls = [];

global.fetch = async (url, options = {}) => {
  if (String(url) !== 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent') return realFetch(url, options);
  providerCalls.push({
    url: String(url),
    apiKey: options.headers['x-goog-api-key'],
    body: JSON.parse(options.body),
  });
  return new Response(JSON.stringify(providerPayload), {
    status: providerStatus,
    headers: { 'Content-Type': 'application/json' },
  });
};

before(async () => {
  await new Promise((resolve, reject) => {
    api.server.once('error', reject);
    api.server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${api.server.address().port}`;
  process.env.APP_ORIGIN = origin;
});

after(async () => {
  global.fetch = realFetch;
  await new Promise((resolve) => api.server.close(resolve));
});

async function ask(body, headers = { 'Content-Type': 'application/json', Origin: origin }) {
  return fetch(`${origin}/api/tutor`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validQuestion = {
  contest: 'Euclid Contest',
  grade: 12,
  question: 'How should I start this geometry proof?',
  guardianConsent: true,
  history: [{ role: 'student', text: 'The triangle is isosceles.' }],
};

test('serves the page, exposes only AI readiness, and protects tutor requests', async (t) => {
  await t.test('serves homepage, readiness, and static resources without exposing a key', async () => {
    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Ask your contest tutor/);

    const pdf = await fetch(`${origin}/resources/2025BCCContest5_6.pdf`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type'), /application\/pdf/);
    assert.equal(Number(pdf.headers.get('content-length')) > 0, true);
    const status = await (await fetch(`${origin}/api/tutor/status`)).json();
    assert.deepEqual(status, { configured: true });
    assert.equal(JSON.stringify(status).includes('test-only-key'), false);
  });

  await t.test('blocks missing and foreign origins', async () => {
    assert.equal((await ask('{}', { 'Content-Type': 'application/json' })).status, 403);
    assert.equal((await ask('{}', { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' })).status, 403);
  });

  await t.test('supports parsed JSON bodies from Vercel Node.js functions', async () => {
    const request = {
      method: 'POST',
      url: '/api/tutor',
      headers: { origin, 'content-type': 'application/json' },
      body: validQuestion,
      socket: { remoteAddress: 'vercel-test-client' },
      setEncoding() {},
      on() {},
    };
    const response = {
      headers: {},
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      writeHead(statusCode, headers = {}) { this.statusCode = statusCode; Object.assign(this.headers, Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))); },
      end(body) { this.body = body; },
    };
    await vercelRoute(request, response);
    assert.equal(response.statusCode, 200);
    assert.match(String(response.body), /\"answer\"/);
  });

  await t.test('exposes the request handler used by Vercel routes', async () => {
    assert.equal(typeof vercelRoute, 'function');
    assert.equal(typeof api.handleRequest, 'function');
    assert.equal(typeof api.server.listen, 'function');
  });

  await t.test('accepts only exact Vercel deployment origins and rejects lookalike hosts', async () => {
    const originalAppOrigin = process.env.APP_ORIGIN;
    delete process.env.APP_ORIGIN;
    process.env.VERCEL_URL = 'stepwise-abc123.vercel.app';
    process.env.VERCEL_BRANCH_URL = 'stepwise-git-main-example.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'stepwise.vercel.app';

    try {
      assert.equal(isAllowedOrigin({ headers: { origin: 'https://stepwise-abc123.vercel.app' } }), true);
      assert.equal(isAllowedOrigin({ headers: { origin: 'https://stepwise-git-main-example.vercel.app' } }), true);
      assert.equal(isAllowedOrigin({ headers: { origin: 'https://stepwise.vercel.app' } }), true);
      assert.equal(isAllowedOrigin({ headers: { origin: 'https://evil-stepwise.vercel.app' } }), false);
      assert.equal(isAllowedOrigin({ headers: { origin: 'https://stepwise.vercel.app.attacker.invalid' } }), false);
    } finally {
      delete process.env.VERCEL_URL;
      delete process.env.VERCEL_BRANCH_URL;
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = originalAppOrigin;
    }
  });

  await t.test('requires guardian permission and valid contest-grade pairing before AI', async () => {
    const count = providerCalls.length;
    const noPermission = await ask({ ...validQuestion, guardianConsent: false });
    assert.equal(noPermission.status, 400);
    assert.match((await noPermission.json()).error, /parent or guardian/i);
    const wrongGrade = await ask({ ...validQuestion, grade: 9 });
    assert.equal(wrongGrade.status, 400);
    assert.equal(providerCalls.length, count);
  });

  await t.test('returns tutor steps and sends private, bounded context to the Gemini generateContent API', async () => {
    providerCalls = [];
    const response = await ask(validQuestion);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.match(result.answer, /Hint:/);
    assert.match(result.answer, /Step 1/);
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(providerCalls[0].apiKey, 'test-only-key');
    assert.equal(providerCalls[0].body.generationConfig.maxOutputTokens, 1024);
    assert.match(providerCalls[0].body.contents[0].parts[0].text, /The triangle is isosceles/);
    assert.match(providerCalls[0].body.systemInstruction.parts[0].text, /school-age students/);
  });

  await t.test('rejects malformed, unsupported, and oversized input', async () => {
    assert.equal((await ask('{broken')).status, 400);
    assert.equal((await ask('{}', { 'Content-Type': 'text/plain', Origin: origin })).status, 415);
    assert.equal((await ask(JSON.stringify({ ...validQuestion, history: [{ role: 'student', text: 'x'.repeat(22000) }] }))).status, 413);
  });

  await t.test('handles provider throttling and hides provider error details', async () => {
    providerStatus = 429;
    const limited = await ask(validQuestion);
    assert.equal(limited.status, 503);
    assert.match((await limited.json()).error, /wait a little/i);
    providerStatus = 401;
    const failed = await ask(validQuestion);
    assert.equal(failed.status, 502);
    assert.doesNotMatch(await failed.text(), /Gemini|fixture/i);
    providerStatus = 200;
  });

  await t.test('applies a per-client request limit', async () => {
    let throttled = false;
    for (let i = 0; i < 16; i += 1) {
      const response = await ask({ contest: 'not a contest', grade: 1, question: 'help me', guardianConsent: true });
      if (response.status === 429) {
        throttled = true;
        break;
      }
    }
    assert.equal(throttled, true);
  });
});
