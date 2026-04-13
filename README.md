# AI SEO Content Writer SaaS

Production-ready SaaS starter with auth, dashboard analytics, SEO generation workflows, and REST APIs.

## Features

- Email/password auth with JWT sessions
- Multi-plan quotas (`starter`, `pro`, `agency`)
- Dashboard stats (used, remaining, latest keyword)
- SEO content generation endpoint with:
  - Keyword, audience, tone, intent, language, length, FAQ toggle
- Generation history with one-click load in UI
- OpenAI integration (optional) with reliable fallback template mode
- SQLite persistence

## Stack

- Backend: Node.js, Express, better-sqlite3
- Frontend: Vanilla HTML/CSS/JS SPA
- Auth: bcrypt + JWT

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open: `http://localhost:3000`

## API

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Dashboard
- `GET /api/dashboard/stats`

### Content
- `POST /api/content/generate`
- `GET /api/content/history`

### Public
- `GET /api/plans`
- `GET /api/health`

### Admin (authenticated + admin role)
- `GET /api/admin/dashboard`

## OpenAI Behavior

- If `OPENAI_API_KEY` is set, the app attempts real AI generation through the Responses API.
- If unavailable or request fails, the app automatically falls back to deterministic template output.


### `POST /api/content/generate` response

Returns generated item plus `generation_source` (`openai` or `fallback`) so the frontend can show whether OpenAI was used.


## Security Notes

- `JWT_SECRET` is required and must be at least 32 characters. The server refuses to start otherwise.
- The frontend avoids `innerHTML` when rendering history to prevent XSS from untrusted content.


## Testing

```bash
npm test
```

Runs an end-to-end smoke test that starts the server, registers a user, generates content, and verifies the API response contract.


### API Configuration (frontend)

If frontend and backend are deployed on different domains, set the API URL in the app's **API Configuration** section. This prevents JSON parse errors when a static host returns HTML for `/api/*` routes.


### Admin Access

Set `ADMIN_EMAIL` in `.env` to auto-assign admin role at registration for that email.
Then open `/admin` (or `/admin/`) and load protected admin metrics using the logged-in token.
