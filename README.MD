RlRanks.pro
a rocket league 2v2 Rank Predictor

Small web app to project your Rocket League 2v2 rank climb. Paste your Rocket League Tracker profile, pull current MMR + recent win %, then see a projection chart of where you’ll end up.

Features

Auto-fetch from RLTracker (paste your profile link).

Manual input fallback if fetch fails.

Projection settings: number of games and regression toward 50% win rate.

Chart output: game-by-game MMR projection.

Rank labels: shows current + projected rank/division.

Stack

HTML + CSS + Vanilla JS

Also has an android app with same name just RlRanksPro

Data scraped from Rocket League Tracker pages (no API key needed)

Custom SVG chart drawing

Usage

Open index.html in your browser (or use Live Server).

Paste your Rocket League Tracker profile URL

Click Fetch Ranked 2v2.

If fetch fails, open Manual backup and enter your MMR + Win %.

Adjust settings → click Predict.

View your projected path.

hosted on RlRanks.Pro

Everything runs client-side with a tiny serverless scraper – no external APIs.

License

MIT
