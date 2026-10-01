# Rank Checker

A small web app: enter a website URL, paste a list of keywords, and see where the site ranks on Google for each one (top 100, by country and language). Results can be sorted and downloaded as CSV.

It has no dependencies and needs only Node 18 or newer.

```sh
cd rank-checker
npm run demo                               # try it with fake data, no key needed
SERP_API_KEY=your_key npm start            # real Google results via Serper.dev
SERP_PROVIDER=serpapi SERP_API_KEY=... npm start   # or via SerpApi
npm test
```

Then open http://localhost:3000. (`PORT` changes the port.)

## Why it needs an API key

Google blocks automated scraping of its search results and its terms prohibit it, so the tool reads live Google results through a SERP API instead:

- **[Serper.dev](https://serper.dev)** (default): 2,500 free searches to start, then low per-search pricing.
- **[SerpApi](https://serpapi.com)**: has a small free monthly allowance.

Each keyword costs one search per 10 results scanned. The checker stops as soon as it finds your site, so a keyword where you rank #1 to #10 costs 1 search, and one where you don't rank in the top 100 costs 10. Choose "Top 10" depth to keep costs at 1 search per keyword.

You can also paste a key under **API settings** in the page instead of setting `SERP_API_KEY`. That key is kept in your browser's local storage and sent only to this app's server.

## How matching works

Any result on the entered domain or its subdomains counts (`example.com` matches `www.example.com` and `blog.example.com`, but not `notexample.com`). The position is the first organic result from your site; ads, map packs, and other SERP features are not counted.

## Deploying

The repo root has a `render.yaml`, so on [Render](https://render.com): **New → Blueprint**, pick this repo, and fill in the two values it asks for:

- `SERP_API_KEY`: your Serper.dev key.
- `ACCESS_PASSWORD`: a password for the page. The browser asks for it on first visit; type anything as the username. Leave it blank only if the URL will stay private, since anyone who can open the page can spend your searches.

Render then gives you a public URL. On the free plan the app sleeps when idle, so the first visit after a break takes about 30 seconds.

`server.js` is a plain Node HTTP server, so it also runs on any other Node host (Railway, Fly.io, a VPS) with the same environment variables.
