/**
 * Savra Insights Engine – REST API
 * Serves teacher activity data with filtering, deduplication, and aggregations.
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Load & deduplicate dataset on startup ────────────────────────────────────
const RAW_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'teachers.json'), 'utf-8')
);

/**
 * Deduplicate records using a composite key.
 * Handles the "hidden twist" requirement gracefully.
 */
function deduplicate(data) {
  const seen = new Set();
  return data.filter(record => {
    const key = [
      record.teacher_id,
      record.activity_type,
      record.created_at,
      record.grade,
      record.subject
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const DATA = deduplicate(RAW_DATA);
const duplicatesRemoved = RAW_DATA.length - DATA.length;

console.log(`✅ Loaded ${RAW_DATA.length} raw records → ${DATA.length} unique (${duplicatesRemoved} duplicates removed)`);

// ─── Helper: apply query filters ─────────────────────────────────────────────
function applyFilters(data, query) {
  let result = data;
  if (query.teacher_id)    result = result.filter(r => r.teacher_id === query.teacher_id);
  if (query.grade)         result = result.filter(r => String(r.grade) === String(query.grade));
  if (query.subject)       result = result.filter(r => r.subject === query.subject);
  if (query.activity_type) result = result.filter(r => r.activity_type === query.activity_type);
  return result;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Simple health check for deployment monitoring.
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', records: DATA.length, duplicatesRemoved });
});

/**
 * GET /api/activities
 * Returns raw activity records, optionally filtered.
 * Query params: teacher_id, grade, subject, activity_type
 */
app.get('/api/activities', (req, res) => {
  const filtered = applyFilters(DATA, req.query);
  res.json({
    total: filtered.length,
    data: filtered
  });
});

/**
 * GET /api/teachers
 * Returns teacher list with aggregated stats.
 * Query params: grade, subject
 */
app.get('/api/teachers', (req, res) => {
  const filtered = applyFilters(DATA, req.query);

  // Build teacher map
  const teacherMap = {};
  filtered.forEach(r => {
    if (!teacherMap[r.teacher_id]) {
      teacherMap[r.teacher_id] = {
        teacher_id:   r.teacher_id,
        teacher_name: r.teacher_name,
        lessons:      0,
        quizzes:      0,
        question_papers: 0,
        total:        0,
        subjects:     new Set(),
        grades:       new Set()
      };
    }
    const t = teacherMap[r.teacher_id];
    if (r.activity_type === 'Lesson Plan')    t.lessons++;
    else if (r.activity_type === 'Quiz')      t.quizzes++;
    else if (r.activity_type === 'Question Paper') t.question_papers++;
    t.total++;
    t.subjects.add(r.subject);
    t.grades.add(r.grade);
  });

  const teachers = Object.values(teacherMap).map(t => ({
    ...t,
    subjects: [...t.subjects].sort(),
    grades:   [...t.grades].sort((a, b) => a - b)
  }));

  res.json({ total: teachers.length, data: teachers });
});

/**
 * GET /api/summary
 * Returns overall stats and weekly trend data.
 * Query params: teacher_id, grade, subject
 */
app.get('/api/summary', (req, res) => {
  const filtered = applyFilters(DATA, req.query);

  // Overall counts
  const summary = {
    total_activities:  filtered.length,
    active_teachers:   new Set(filtered.map(r => r.teacher_id)).size,
    lessons:           filtered.filter(r => r.activity_type === 'Lesson Plan').length,
    quizzes:           filtered.filter(r => r.activity_type === 'Quiz').length,
    question_papers:   filtered.filter(r => r.activity_type === 'Question Paper').length,
    duplicates_removed: duplicatesRemoved
  };

  // Weekly trend: group by date + activity_type
  const trendMap = {};
  filtered.forEach(r => {
    const date = r.created_at.slice(0, 10); // YYYY-MM-DD
    if (!trendMap[date]) trendMap[date] = { 'Lesson Plan': 0, 'Quiz': 0, 'Question Paper': 0 };
    trendMap[date][r.activity_type]++;
  });

  const trend = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  // Grade breakdown
  const gradeMap = {};
  filtered.forEach(r => {
    const g = `Grade ${r.grade}`;
    gradeMap[g] = (gradeMap[g] || 0) + 1;
  });

  res.json({ summary, trend, gradeBreakdown: gradeMap });
});

/**
 * GET /api/insights
 * Returns AI-style natural language insights derived from the data.
 * Query params: grade, subject
 */
app.get('/api/insights', (req, res) => {
  const filtered = applyFilters(DATA, req.query);

  // Per-teacher stats
  const teacherStats = {};
  filtered.forEach(r => {
    if (!teacherStats[r.teacher_id]) {
      teacherStats[r.teacher_id] = { name: r.teacher_name, total: 0, quizzes: 0, lessons: 0, papers: 0 };
    }
    const t = teacherStats[r.teacher_id];
    t.total++;
    if (r.activity_type === 'Quiz')            t.quizzes++;
    if (r.activity_type === 'Lesson Plan')     t.lessons++;
    if (r.activity_type === 'Question Paper')  t.papers++;
  });

  const stats = Object.values(teacherStats);
  if (!stats.length) return res.json({ insights: [] });

  const top    = [...stats].sort((a, b) => b.total   - a.total)[0];
  const mostQ  = [...stats].sort((a, b) => b.quizzes - a.quizzes)[0];
  const mostL  = [...stats].sort((a, b) => b.lessons - a.lessons)[0];
  const low    = stats.find(t => t.total > 0 && t.total <= 3);

  const insights = [];

  if (top?.total > 0)
    insights.push({ icon: '🏆', text: `${top.name} leads with ${top.total} total activities — most productive teacher this period.` });

  if (mostQ?.quizzes > 0)
    insights.push({ icon: '📝', text: `${mostQ.name} created the most quizzes (${mostQ.quizzes}), keeping students rigorously assessed.` });

  if (mostL?.lessons > 0)
    insights.push({ icon: '📚', text: `${mostL.name} has the most lesson plans (${mostL.lessons}), showing strong curriculum coverage.` });

  if (low)
    insights.push({ icon: '⚠️', text: `${low.name} has only ${low.total} activit${low.total === 1 ? 'y' : 'ies'} this period — consider a check-in.` });

  // Activity mix insight
  const total = filtered.length || 1;
  const quizPct = Math.round((filtered.filter(r => r.activity_type === 'Quiz').length / total) * 100);
  if (quizPct > 50)
    insights.push({ icon: '📊', text: `Quizzes make up ${quizPct}% of all activity — consider balancing with more lesson plans.` });

  res.json({ insights });
});

/**
 * GET /api/filters
 * Returns distinct values for filter dropdowns.
 */
app.get('/api/filters', (req, res) => {
  res.json({
    teachers: [...new Map(DATA.map(r => [r.teacher_id, { id: r.teacher_id, name: r.teacher_name }])).values()],
    grades:   [...new Set(DATA.map(r => r.grade))].sort((a, b) => a - b),
    subjects: [...new Set(DATA.map(r => r.subject))].sort(),
    activity_types: [...new Set(DATA.map(r => r.activity_type))].sort()
  });
});

// ─── Catch-all: serve SPA ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Savra Insights API running → http://localhost:${PORT}`);
  console.log(`   API endpoints: /api/health | /api/activities | /api/teachers | /api/summary | /api/insights | /api/filters`);
});
