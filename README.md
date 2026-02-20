# Savra Teacher Insights Dashboard

A production-grade admin analytics dashboard that converts teacher activity data into meaningful insights for school principals.

**Live Demo:** (https://savra.netlify.app/)
**GitHub:** https://github.com/T9kezo/savra.git

## Features

- **Overview stats** — Active teachers, total activities, lesson plans, quizzes, and question papers at a glance
- **Weekly trend chart** — SVG line chart showing content creation per day across all activity types
- **Teacher breakdown bar chart** — Compare output across all teachers side-by-side
- **Activity mix donut chart** — Visual split of lesson plans vs quizzes vs question papers
- **Per-teacher spotlight** — Click any teacher chip or table row to drill into their individual stats (subjects taught, grades covered, counts by type)
- **Grade & subject filters** — Filter the entire dashboard by grade level or subject, all charts and stats update live
- **AI Pulse Summary** — Natural language insights auto-generated from the data (top performer, most quizzes, low-activity warnings)
- **Export CSV** — Download the current filtered dataset as a CSV file
- **Duplicate detection** — Hidden twist handled: composite-key deduplication runs on every API request

---

## Architecture

```
savra-dashboard/
├── server.js          # Express REST API — all business logic lives here
├── data/
│   └── teachers.json  # Source dataset (from Excel, version-controlled)
├── public/
│   └── index.html     # Single-page frontend — fetches from API at runtime
├── package.json
└── README.md
```

### API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check — returns record count and duplicates removed |
| `GET /api/filters` | Distinct teachers, grades, subjects for filter dropdowns |
| `GET /api/activities` | Raw activity records, supports filtering |
| `GET /api/teachers` | Per-teacher aggregated stats (lessons / quizzes / papers / total) |
| `GET /api/summary` | Overview counts + weekly trend data + grade breakdown |
| `GET /api/insights` | AI-generated natural language insight strings |

All endpoints accept optional query params: `teacher_id`, `grade`, `subject`, `activity_type`

### Data Model

Each activity record in `data/teachers.json` follows this schema (matching the Excel dataset):

```json
{
  "teacher_id":    "T001",
  "teacher_name":  "Anita Sharma",
  "grade":         8,
  "subject":       "Mathematics",
  "activity_type": "Lesson Plan | Quiz | Question Paper",
  "created_at":    "2026-02-17 19:19:56"
}
```

### Duplicate Handling

Deduplication runs at server startup via a composite key:

```
teacher_id + activity_type + created_at + grade + subject
```

The result is cached in memory — subsequent requests use the clean dataset. The footer shows how many duplicates were removed.

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
# → http://localhost:3000

# For development with auto-reload:
npm run dev
```

---

## Deployment

### Render (recommended)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** Node
5. Deploy — Render auto-assigns a public URL

### Vercel

```bash
npm i -g vercel
vercel
```

Add a `vercel.json` to route all traffic through the Express server:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/server.js" }]
}
```

---

## Future Scalability Improvements

1. **Database layer** — Replace `teachers.json` with PostgreSQL (via `pg`) or MongoDB. Add proper indexing on `teacher_id`, `created_at`, `grade` for fast aggregations.

2. **Authentication** — Add JWT-based login. The principal gets an admin token; teachers get read-only tokens scoped to their own `teacher_id`. Use `bcrypt` + `jsonwebtoken`.

3. **Real-time updates** — Replace poll-on-filter with WebSocket (`socket.io`) push when new activities are written, so the dashboard stays live without refresh.

4. **Date range filtering** — Expose `from` / `to` query params on all endpoints to support "This Week / This Month / This Year" views matching the Savra UI reference.

5. **Caching** — Add Redis for aggregation results. Aggregations like `/api/summary` are expensive at scale; cache with a 60s TTL and invalidate on new writes.

6. **Pagination** — `/api/activities` should return cursor-based pagination once records grow beyond a few thousand.

7. **CSV upload endpoint** — `POST /api/activities/upload` accepting a CSV/XLSX file so principals can bulk-import data without touching the JSON file directly.

8. **Test suite** — Add Jest unit tests for the deduplication logic and aggregation functions, and Supertest integration tests for each API route.
