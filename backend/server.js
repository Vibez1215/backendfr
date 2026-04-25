/**
 * server.js — Rave Finder standalone API
 *
 * Endpoints:
 *   GET /api/health               → { ok: true, ts: "..." }
 *   GET /api/events?city=<city>   → { events: [...], _debug: {...} }
 *
 * Deploy to Render, Railway, or Fly.io.
 * Set environment variable: DATABASE_URL = your Neon postgres connection string
 *
 * Local dev:
 *   npm install
 *   DATABASE_URL="postgres://..." npm run dev
 */

"use strict";

const express = require("express");
const cors = require("cors");
const { neon } = require("@neondatabase/serverless");
const { scrape19hz } = require("./scraper");

// ── DB ────────────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL env var is not set. DB queries will fail.");
}
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow all origins (Expo Go, physical device, web preview, etc.)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(
    `\n[${new Date().toISOString()}] ${req.method} ${req.path}${req.url.includes("?") ? "?" + req.url.split("?")[1] : ""}`,
  );
  next();
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const payload = {
    ok: true,
    ts: new Date().toISOString(),
    db: DATABASE_URL ? "configured" : "missing",
  };
  console.log("[health] ✅", JSON.stringify(payload));
  res.json(payload);
});

// ── GET /api/events ───────────────────────────────────────────────────────────
app.get("/api/events", async (req, res) => {
  const city = req.query.city || null;
  const search = req.query.search || null;
  const category = req.query.category || null;

  console.log(
    `[events] city="${city}" search="${search}" category="${category}"`,
  );

  try {
    // ── 1. DB query ──────────────────────────────────────────────────────────
    let dbEvents = [];
    if (sql) {
      let query = "SELECT * FROM events WHERE 1=1";
      const vals = [];
      let idx = 1;

      if (city) {
        query += ` AND LOWER(city) LIKE LOWER($${idx++})`;
        vals.push(`%${city}%`);
      }
      if (category && category !== "All") {
        query += ` AND category = $${idx++}`;
        vals.push(category);
      }
      if (search) {
        query += ` AND (LOWER(title) LIKE LOWER($${idx}) OR LOWER(venue) LIKE LOWER($${idx + 1}) OR LOWER(genre) LIKE LOWER($${idx + 2}))`;
        vals.push(`%${search}%`, `%${search}%`, `%${search}%`);
        idx += 3;
      }
      query += " ORDER BY date ASC";

      console.log(`[events] SQL: ${query}`);
      console.log(`[events] vals: ${JSON.stringify(vals)}`);

      try {
        dbEvents = await sql(query, vals);
        console.log(`[events] DB returned ${dbEvents.length} rows`);
      } catch (dbErr) {
        console.error("[events] DB error:", dbErr?.message);
        dbEvents = [];
      }
    } else {
      console.warn("[events] no DB connection — skipping DB query");
    }

    // ── 2. Live scraper ──────────────────────────────────────────────────────
    let scraperEvents = [];
    try {
      scraperEvents = await scrape19hz(city);
      console.log(`[events] scraper returned ${scraperEvents.length} events`);
    } catch (scraperErr) {
      console.error("[events] scraper error:", scraperErr?.message);
    }

    // ── 3. Merge ─────────────────────────────────────────────────────────────
    let all = [...dbEvents, ...scraperEvents];
    console.log(`[events] combined (before filters): ${all.length}`);

    // ── 4. Post-filter search ─────────────────────────────────────────────────
    if (search) {
      const q = search.toLowerCase();
      const before = all.length;
      all = all.filter(
        (e) =>
          (e.title || "").toLowerCase().includes(q) ||
          (e.venue || "").toLowerCase().includes(q) ||
          (e.genre || "").toLowerCase().includes(q),
      );
      console.log(
        `[events] search filter "${search}": ${before} → ${all.length}`,
      );
    }

    // ── 5. Post-filter category ───────────────────────────────────────────────
    if (category && category !== "All") {
      const before = all.length;
      all = all.filter(
        (e) =>
          e.source === "manual" ||
          e.source === "promoter" ||
          e.category === category,
      );
      console.log(
        `[events] category filter "${category}": ${before} → ${all.length}`,
      );
    }

    // ── 6. Sort + dedupe ──────────────────────────────────────────────────────
    all.sort((a, b) => new Date(a.date) - new Date(b.date));

    const seen = new Set();
    const deduped = all.filter((e) => {
      const key = `${(e.title || "").toLowerCase().slice(0, 30)}_${(e.date || "").slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(
      `[events] ── RETURNING ${deduped.length} events (db=${dbEvents.length} scraper=${scraperEvents.length})\n`,
    );

    res.json({
      events: deduped,
      _debug: {
        db: dbEvents.length,
        scraper: scraperEvents.length,
        total: deduped.length,
        city,
        search,
        category,
      },
    });
  } catch (err) {
    console.error("[events] UNHANDLED ERROR:", err?.message, err?.stack);
    res
      .status(500)
      .json({ error: "Failed to fetch events", detail: err?.message });
  }
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Rave Finder API listening on port ${PORT}`);
  console.log(`   GET http://localhost:${PORT}/api/health`);
  console.log(
    `   GET http://localhost:${PORT}/api/events?city=San%20Francisco`,
  );
  console.log(`   DATABASE_URL: ${DATABASE_URL ? "✅ set" : "❌ MISSING"}\n`);
});
