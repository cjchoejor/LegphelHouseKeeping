# Legphel Housekeeping

A phone-friendly page that shows the housekeeping staff which rooms are booked, the
bed setup, occupants, and any special preferences for the day.

## Files

| File | What it does |
|---|---|
| `index.html` | The whole app — mobile-first, card-based view. No framework. |
| `netlify/functions/reservations.js` | Serverless proxy so the https page can read the http-only hotel API. |
| `netlify.toml` | Tells Netlify where the site and functions live. |

## Why the proxy exists

The hotel API is **http** only (its URL is kept in the `HOTEL_API` env var). Netlify serves every
page over **https**, and browsers refuse to let an https page call an http address
("mixed content") — this is exactly why the old page failed once it was online.

The fix: the page calls `/.netlify/functions/reservations` (https, same domain).
That function runs on Netlify's server, where calling http is allowed, fetches the
data, and returns it. This also avoids any CORS problem.

Opened as a local file, the app skips login for a quick layout preview; live data needs
the proxy, so use `netlify dev` for a full local run.

## Deploy (GitHub + Netlify, free)

1. Push these files to the **LegphelHouseKeeping** GitHub repo (the contents of this
   folder should be at the repo root — i.e. `index.html` at the top level).
2. Go to https://app.netlify.com → **Add new site → Import an existing project**.
3. Choose GitHub and pick `LegphelHouseKeeping`.
4. Leave build command empty; publish directory `.` (the `netlify.toml` already sets this).
5. Deploy. You'll get a URL like `https://legphel-housekeeping.netlify.app`.
6. Open that URL on a phone and "Add to Home Screen" for an app-like icon.

Every future `git push` to the repo redeploys automatically.

## Local testing (optional)

- Quick check: just double-click `index.html` (calls the API directly).
- Full check incl. the proxy: install the Netlify CLI and run `netlify dev`.
