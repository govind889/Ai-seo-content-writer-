require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const db = new Database(path.join(__dirname, "app.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'starter',
    monthly_quota INTEGER NOT NULL DEFAULT 20,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    audience TEXT,
    tone TEXT,
    intent TEXT,
    language TEXT,
    length TEXT,
    generated_content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const cols = db.prepare("PRAGMA table_info(content_requests)").all().map((c) => c.name);
if (!cols.includes("intent")) db.exec("ALTER TABLE content_requests ADD COLUMN intent TEXT");
if (!cols.includes("language")) db.exec("ALTER TABLE content_requests ADD COLUMN language TEXT");
if (!cols.includes("length")) db.exec("ALTER TABLE content_requests ADD COLUMN length TEXT");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const planQuotas = {
  starter: 20,
  pro: 100,
  agency: 500
};

function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: "7d" });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

function getMonthUsage(userId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM content_requests
       WHERE user_id = ?
         AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
    )
    .get(userId).total;
}

function fallbackSeoContent({ keyword, audience, tone, intent, language, length, includeFaq }) {
  const title = `${keyword}: ${intent} Blueprint for ${audience || "Growth Teams"}`;

  return [
    `# ${title}`,
    "",
    `**Language:** ${language}`,
    `**Tone:** ${tone}`,
    `**Article length target:** ${length}`,
    "",
    "## Search Intent Snapshot",
    `Users searching for **${keyword}** usually want ${intent.toLowerCase()} content with practical examples and clear next steps.`,
    "",
    "## SEO Article Outline",
    `1. Why ${keyword} matters right now`,
    `2. How to execute ${keyword} in 5 steps`,
    "3. Mistakes that reduce rankings",
    "4. Metrics to track weekly",
    "",
    "## Draft Intro",
    `To win in search, your ${keyword} content has to match user intent, demonstrate expertise, and offer instantly useful advice for ${audience || "your target readers"}.`,
    "",
    "## On-page SEO Checklist",
    "- Place primary keyword in title, first 100 words, and one H2.",
    "- Add 3-5 semantically related phrases naturally across sections.",
    "- Include one comparison table or bullet summary to improve scanability.",
    "- Add internal links to product and pillar pages.",
    "- End with a clear CTA aligned to funnel stage.",
    "",
    "## Metadata",
    `Meta Title: ${keyword} Strategy (${new Date().getUTCFullYear()}): Framework + Examples`,
    `Meta Description: Build better ${keyword} pages with this practical ${intent.toLowerCase()} framework.`,
    includeFaq ? "\n## FAQ\nQ: How long until SEO results improve?\nA: Most pages need 8-12 weeks for stable ranking movement." : ""
  ].join("\n");
}

async function openAiSeoContent(input) {
  const prompt = [
    "You are an elite SEO content strategist.",
    "Generate production-ready content in markdown.",
    `Primary keyword: ${input.keyword}`,
    `Audience: ${input.audience || "General"}`,
    `Tone: ${input.tone}`,
    `Intent: ${input.intent}`,
    `Language: ${input.language}`,
    `Target length: ${input.length}`,
    `Include FAQ: ${input.includeFaq ? "yes" : "no"}`,
    "Return: title, intro, detailed outline, first draft body, meta title, meta description, FAQ section if requested."
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.output_text;

  if (!text || !text.trim()) {
    throw new Error("OpenAI returned an empty response.");
  }

  return text;
}

async function generateSeoContent(payload) {
  if (OPENAI_API_KEY) {
    try {
      return await openAiSeoContent(payload);
    } catch (error) {
      console.error("AI generation failed; falling back to template:", error.message);
    }
  }

  return fallbackSeoContent(payload);
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, plan } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail)) {
    return res.status(409).json({ error: "Email already in use." });
  }

  const selectedPlan = planQuotas[plan] ? plan : "starter";
  const passwordHash = await bcrypt.hash(password, 10);
  const result = db
    .prepare("INSERT INTO users (name, email, password_hash, plan, monthly_quota) VALUES (?, ?, ?, ?, ?)")
    .run(name.trim(), normalizedEmail, passwordHash, selectedPlan, planQuotas[selectedPlan]);

  const user = db
    .prepare("SELECT id, name, email, plan, monthly_quota, created_at FROM users WHERE id = ?")
    .get(result.lastInsertRowid);

  return res.status(201).json({ token: createToken(user), user });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const userRow = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (!userRow || !(await bcrypt.compare(password, userRow.password_hash))) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const user = {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    plan: userRow.plan,
    monthly_quota: userRow.monthly_quota,
    created_at: userRow.created_at
  };

  return res.json({ token: createToken(user), user });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, plan, monthly_quota, created_at FROM users WHERE id = ?")
    .get(req.user.sub);

  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ user });
});

app.get("/api/dashboard/stats", authRequired, (req, res) => {
  const user = db.prepare("SELECT id, monthly_quota FROM users WHERE id = ?").get(req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found." });

  const monthUsage = getMonthUsage(user.id);
  const latest = db
    .prepare(
      `SELECT keyword, created_at
       FROM content_requests
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC
       LIMIT 1`
    )
    .get(user.id);

  return res.json({
    monthly_used: monthUsage,
    monthly_quota: user.monthly_quota,
    remaining: Math.max(user.monthly_quota - monthUsage, 0),
    latest_keyword: latest?.keyword || null,
    latest_created_at: latest?.created_at || null
  });
});

app.get("/api/content/history", authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, keyword, audience, tone, intent, language, length, generated_content, created_at
       FROM content_requests
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC
       LIMIT 50`
    )
    .all(req.user.sub);

  return res.json({ items: rows });
});

app.post("/api/content/generate", authRequired, async (req, res) => {
  const keyword = (req.body.keyword || "").trim();
  const audience = (req.body.audience || "").trim();
  const tone = (req.body.tone || "Professional").trim();
  const intent = (req.body.intent || "Informational").trim();
  const language = (req.body.language || "English").trim();
  const length = (req.body.length || "1200-1500 words").trim();
  const includeFaq = Boolean(req.body.includeFaq);

  if (!keyword) {
    return res.status(400).json({ error: "Keyword is required." });
  }

  const user = db.prepare("SELECT id, monthly_quota FROM users WHERE id = ?").get(req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found." });

  const usage = getMonthUsage(user.id);
  if (usage >= user.monthly_quota) {
    return res.status(403).json({
      error: `Monthly quota reached (${user.monthly_quota}). Upgrade your plan to continue.`
    });
  }

  const generated = await generateSeoContent({ keyword, audience, tone, intent, language, length, includeFaq });

  const insert = db
    .prepare(
      `INSERT INTO content_requests (user_id, keyword, audience, tone, intent, language, length, generated_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(user.id, keyword, audience || null, tone || null, intent || null, language || null, length || null, generated);

  const item = db
    .prepare(
      `SELECT id, keyword, audience, tone, intent, language, length, generated_content, created_at
       FROM content_requests
       WHERE id = ?`
    )
    .get(insert.lastInsertRowid);

  return res.status(201).json({ item });
});

app.get("/api/plans", (req, res) => {
  res.json({ plans: planQuotas });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "ai-seo-content-writer-saas", ai_enabled: Boolean(OPENAI_API_KEY) });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
