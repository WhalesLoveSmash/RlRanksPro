RL Ranks Pro — 2v2 Rank Predictor

Small web app to project your Rocket League 2v2 rank climb. Paste your Rocket League Tracker profile, pull current MMR + recent win %, then see a projection chart of where you’ll end up.

Features

Auto-fetch from RLTracker (paste your profile link).

Manual input fallback if fetch fails.

Projection settings: number of games and regression toward 50% win rate.

Chart output: game-by-game MMR projection.

Rank labels: shows current + projected rank/division.

Stack

HTML + CSS + Vanilla JS

Data from Tracker Network API

Custom SVG chart drawing

Usage

Open index.html in your browser (or use Live Server).

Paste your Rocket League Tracker profile URL, e.g.:

https://rocketleague.tracker.network/rocket-league/profile/steam/7656119.../overview


Click Fetch Ranked 2v2.

If fetch fails, open Manual backup and enter your MMR + Win%.

Adjust settings → click Predict.

View your projected path.

Deploy

Works on GitHub Pages.

CNAME file included for custom domain.

Everything runs client-side; no backend needed.

License

MIT