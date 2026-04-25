# Rave Finder — Standalone API Backend

This folder is a self-contained Express.js server that can be deployed to
**Render**, **Railway**, or **Fly.io** so the Expo mobile app can reach it
from a real device or Expo Go on any network.

---

## Files

| File | Purpose |
|---|---|
| `server.js` | Express app — health + events endpoints, CORS, logging |
| `scraper.js` | 19hz.info HTML scraper (no external deps) |
| `README.md` | This file |

---

## Step 0 — Create package.json

You cannot create `package.json` inside Anything, so create it yourself
after downloading the code. Its contents:

```json
{
  "name": "rave-finder-api",
  "version": "1.0.0",
  "main": "server.js",
  "engines": { "node": ">=18" },
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "@neondatabase/serverless": "^0.9.3"
  }
}
```

---

## Deploy to Render (recommended — free tier)

### 1. Download your code
Click **Code** (top-right of the Anything builder) and download the zip.
Extract it. Inside you'll find the `apps/backend/` folder — that's your
deployment root.

### 2. Create package.json
Inside the `apps/backend/` folder, create `package.json` with the contents
shown above.

### 3. Push to GitHub
```bash
cd apps/backend
git init
git add .
git commit -m "rave-finder api"
gh repo create rave-finder-api --public --source=. --push
# or use the GitHub website to create a repo and push manually
```

### 4. Create a Render Web Service
1. Go to https://render.com and sign in (free account is fine)
2. Click **New → Web Service**
3. Connect your GitHub repo (`rave-finder-api`)
4. Fill in the settings:
   - **Name**: `rave-finder-api`
   - **Root directory**: *(leave blank — package.json is at the root)*
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance type**: Free
5. Click **Advanced → Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: *(paste your Neon postgres connection string)*
6. Click **Create Web Service**

Render will give you a URL like:
```
https://rave-finder-api.onrender.com
```

### 5. Test it
```bash
curl https://rave-finder-api.onrender.com/api/health
# → {"ok":true,"ts":"...","db":"configured"}

curl "https://rave-finder-api.onrender.com/api/events?city=San%20Francisco"
# → {"events":[...],"_debug":{"db":0,"scraper":42,"total":42}}
```

---

## Deploy to Railway (alternative — also has free tier)

### 1. Install Railway CLI (optional)
```bash
npm install -g @railway/cli
railway login
```

### 2. Create the project
```bash
cd apps/backend
# Create package.json first (see Step 0 above)
railway init          # name it "rave-finder-api"
railway up
```

Or use the Railway website:
1. Go to https://railway.app
2. New Project → Deploy from GitHub repo
3. Select your repo
4. Add environment variable: `DATABASE_URL` = your Neon string

Railway gives you a URL like:
```
https://rave-finder-api-production.up.railway.app
```

---

## Step 6 — Update the Expo app to use your deployed URL

Once you have a public URL (Render or Railway), open the chat and say:

> "Set the API base URL to https://rave-finder-api.onrender.com"

The agent will update `EXPO_PUBLIC_API_BASE` in the mobile app's
`api.js` so all fetch calls go to your deployed backend instead of
the unreachable Anything preview server.

---

## Environment variables needed

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon postgres connection string |
| `PORT` | No | Defaults to 3001. Render/Railway set this automatically. |

---

## Local testing before deploy

```bash
cd apps/backend
# Create package.json (see Step 0)
npm install
DATABASE_URL="postgres://..." npm run dev
```

Then test:
```bash
curl http://localhost:3001/api/health
curl "http://localhost:3001/api/events?city=San%20Francisco"
```

---

## How to find your DATABASE_URL

1. Go to https://www.anything.com/dashboard/databases
2. Click your **Rave Finder DB**
3. Copy the **connection string** (starts with `postgres://...`)

---

## Endpoint reference

### `GET /api/health`
```json
{ "ok": true, "ts": "2026-04-25T00:00:00.000Z", "db": "configured" }
```

### `GET /api/events?city=San%20Francisco`
Query params:
- `city` — city name (fuzzy matched against DB + 19hz region map)
- `search` — optional keyword filter (title, venue, genre)
- `category` — optional: "Raves", "Club Night", "Concert", "Throwback"

Response:
```json
{
  "events": [
    {
      "id": "19hz_abc123",
      "title": "Adam Beyer b2b Ida Engberg",
      "venue": "1015 Folsom",
      "city": "San Francisco",
      "genre": "techno",
      "category": "Raves",
      "description": "$30 | 21+",
      "date": "2026-04-25T22:00:00.000Z",
      "ticket_url": "https://...",
      "image_url": null,
      "source": "19hz"
    }
  ],
  "_debug": {
    "db": 0,
    "scraper": 42,
    "total": 42,
    "city": "San Francisco",
    "search": null,
    "category": null
  }
}
```

### Logs you'll see on the server (for each request):
```
[2026-04-25T00:00:00Z] GET /api/events?city=San Francisco
[events] city="San Francisco" search="null" category="null"
[events] DB returned 0 rows
[19hz scraper] city="San Francisco" → region="BayArea" → https://19hz.info/eventlisting_BayArea.php
[19hz scraper] HTTP 200 | content-type: text/html
[19hz scraper] received 148432 bytes
[19hz parser] inspected=312 skipped=18 parsed=294
[19hz scraper] all=294 → city-filtered="San Francisco" → 42
[events] combined (before filters): 42
[events] ── RETURNING 42 events (db=0 scraper=42)
```
