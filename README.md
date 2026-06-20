# Mondial

A Hebrew, mobile-first family prediction game for the 2026 FIFA World Cup. One link → the
family joins → everyone predicts match outcomes → an admin enters real results → a live
scoreboard updates. Fully RTL Hebrew, no server and no build step — Firebase Hosting + Firestore only.

## Features

Only capabilities that actually exist in the current code:

- **Join by link + name/password identity** — anonymous Firebase auth, per-participant
  password (hashed), device linking, and an admin approval flow for join requests.
- **Predictions** — per match: who wins (home / draw / away); for knockout matches, which
  team advances. An optional exact-score guess is stored but not scored.
- **Scoring** — correct outcome earns points (home 3 / draw 4 / away 3); a wrong pick earns 0.
  The exact score does not affect points. Scores are keyed by participant.
- **Results screen** — live/upcoming matches (with a "🔴 live now" tag), finished matches with
  a per-match points breakdown, a leaderboard listing everyone who predicted (including
  0-point players), and a friendly scoring explainer.
- **Bracket tree** — group + knockout view that reflects saved results (winner highlighted 🏆),
  read-only and never recomputing winners.
- **Home screen** — "🔥 upcoming matches", participation counters, and the leaderboard.
- **Admin screen** — approve participants, enter real match results (with an "open only" filter
  to avoid double entry), assist/edit children's predictions with an audit trail, and export
  data to CSV / JSON.
- **Virtual player** — a built-in "🐵 קוף" participant.

## Tech Stack

- **HTML** (static, multi-page, RTL Hebrew)
- **JavaScript** (vanilla ES modules — no framework, no bundler, no build step)
- **Firebase** — Anonymous Authentication
- **Firestore** — data store, access controlled by `firestore.rules`
- **Firebase Hosting** — static hosting

## Project Structure

```
public/                  # everything served to the browser
├── index.html           # login / join screen
├── home.html            # home: upcoming matches, counters, leaderboard
├── predictions.html     # make predictions
├── results.html         # live/finished results + leaderboard
├── bracket.html         # tournament tree (reflects saved results)
├── admin.html           # admin: approvals, results entry, assist/edit, export
├── instructions.html, pending.html, set-password.html, setup-admins.html
├── app.js               # all client logic (single module)
├── style.css            # styling (RTL, mobile-first)
├── firebase.js          # Firebase app/auth/firestore init
├── firebase-config.js   # public Firebase web config (safe to expose)
├── scoring-config.js    # scoring constants (home 3 / draw 4 / away 3)
└── matches.json         # static fixture list (teams, groups, kickoff times)

firebase.json            # Hosting config (no-cache headers)
.firebaserc              # Firebase project: mondial2026-family-pool
firestore.rules          # Firestore security rules (the real access control)
docs/                    # design notes, handoff, session summaries
scripts/                 # one-off seed/migration helpers (Python)
archive/                 # superseded design docs from an earlier Flask plan
```

## Data Notes

- **Match schedule** (`public/matches.json`) is static data and lives in git.
- **Live data** — match results, scores, predictions, participants, and join requests — lives in
  **Firestore**, not in git.
- **Data operations** (e.g. entering real match results, recomputing scores) act directly on
  Firestore and are **not version-controlled**. They are documented in `docs/` but the data
  itself is not stored in this repository.
- **Only application code and static config are kept in git.**

## Local Development

No build step. Serve the `public/` folder as static files and open it in a browser:

```bash
# Option A — Firebase CLI (also gives Hosting emulation)
firebase serve --only hosting

# Option B — any static server
cd public && python3 -m http.server 5000
```

Then open the served URL (the app reads/writes the live Firestore project defined in
`public/firebase-config.js`). There is no automated test or lint pipeline documented yet.

## Deployment

Deployment is **manual** via the Firebase CLI (no CI/CD, no GitHub Actions):

```bash
firebase deploy --only hosting          # deploy the static site
firebase deploy --only firestore:rules  # deploy security rules (when changed)
```

Live site: https://mondial2026-family-pool.web.app

## Version History

- **v0.1.0** — Initial public backup after production state alignment.
