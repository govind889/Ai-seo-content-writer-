const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not become healthy in time');
}

async function run() {
  const server = spawn('node', ['server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: '12345678901234567890123456789012'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  server.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  try {
    await waitForHealth();

    const email = `test-${Date.now()}@example.com`;
    const registerRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Tester',
        email,
        password: 'password123',
        plan: 'starter'
      })
    });
    assert.equal(registerRes.status, 201);
    const registerData = await registerRes.json();
    assert.ok(registerData.token);

    const generateRes = await fetch(`${BASE}/api/content/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${registerData.token}`
      },
      body: JSON.stringify({
        keyword: 'ai seo content writer',
        audience: 'founders',
        tone: 'Professional',
        intent: 'Informational',
        language: 'English',
        length: '1200 words',
        includeFaq: true
      })
    });

    assert.equal(generateRes.status, 201);
    const generateData = await generateRes.json();
    assert.ok(generateData.item);
    assert.ok(['openai', 'fallback'].includes(generateData.generation_source));
    assert.ok(generateData.item.generated_content.length > 50);

    const adminDeniedRes = await fetch(`${BASE}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${registerData.token}` }
    });
    assert.equal(adminDeniedRes.status, 403);

    const adminPageRes = await fetch(`${BASE}/admin`);
    assert.equal(adminPageRes.status, 200);
    const adminPageHtml = await adminPageRes.text();
    assert.ok(adminPageHtml.includes('Admin Dashboard'));

    console.log('Smoke test passed');
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    if (!server.killed) {
      server.kill('SIGKILL');
    }
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
