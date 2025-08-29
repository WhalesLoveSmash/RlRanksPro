# RL Ranks Pro — 2v2 Rank Predictor

Small web app to project your Rocket League 2v2 rank climb.

**How it works**
- Paste your **Rocket League Tracker** profile URL.
- A Vercel **Serverless Function** (`/api/profile.js`) scrapes the RLTracker profile page (no TRN API key).
- We extract current **2v2 MMR** and a **recent Win%** if present.
- Front-end projects your next games with a simple regression model and shows current + projected rank labels.

---

## Live
Hosted on **rlranks.pro** (non-www enforced).

---

## Stack
- **Frontend:** HTML + CSS + Vanilla JS (`index.html`, `style.css`, `script.js`)
- **Backend (serverless):** Node 18 on Vercel (`/api/profile.js`, `/api/predict.js`, `/api/health.js`)
- **Ranks table:** `ranks.json` (tier breakpoints + default tier width)

> **Note:** This project **does use a backend** for scraping. The old “no backend needed” line was incorrect for production.

---

## Endpoints

### `GET /profile/:platform/:pid`
Pretty route that rewrites to `/api/profile.js?platform=:platform&pid=:pid`.

**Params**
- `platform` — one of `steam | epic | xbox | psn`
- `pid` — the platform identifier from your RLTracker profile URL (e.g., Steam64 or Epic name)

**Response**
```json
{
  "platform": "epic",
  "pid": "RelatingWave",
  "currentMMR": 1265,
  "recentWinPercent": 58,
  "source": "rocketleague.tracker.network",
  "fetchedAt": "2025-08-29T10:00:00.000Z"
}