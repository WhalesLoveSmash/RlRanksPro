# RL Ranks Pro — 2v2 Rank Predictor

Paste your **Rocket League Tracker** profile → backend scrapes your **2v2 MMR** (+Win%) → front-end projects where you’ll land.

## Live
- **rlranks.pro** (non-www enforced)

## Stack
- Frontend: `index.html`, `style.css`, `script.js`
- Serverless (Vercel Node 18): `api/profile.js`, `api/predict.js`, `api/health.js`
- Rank table: `ranks.json`

> This project **does use a backend** (serverless scraping). The old “no backend needed” note was wrong.

## Endpoints

**GET `/profile/:platform/:pid`** → scrapes RLTracker page HTML  
Response:
```json
{ "platform":"epic","pid":"RelatingWave","currentMMR":1265,"recentWinPercent":58,"source":"rocketleague.tracker.network","fetchedAt":"2025-08-29T12:00:00Z" }