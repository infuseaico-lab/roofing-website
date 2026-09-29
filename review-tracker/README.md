# Review Tracker

A small web app for tracking Google review postings. It has no dependencies and needs only Node.js 18 or newer.

```sh
cd review-tracker
npm start          # http://localhost:3000
```

## Logins

- **Admin** (full access): `edygal` / `55555`. To change it, set the `ADMIN_USER` and `ADMIN_PASS` environment variables.
- **Viewers** (read-only): after signing in as admin, click **Viewer logins** and create a username and password for each client. Viewers can search, filter and export records to CSV, but they cannot add, edit or delete anything. The server enforces this, so it is not just hidden buttons. Entering an existing username resets that viewer's password. Removing a viewer signs them out right away.

## Records

Each record has: Client, Listing, Pace, Review, Post Date, Poster Name, Review Link, Status (Pending, Posted, Live, Removed) and Paid.

- **+ Add record** adds one record at a time.
- **Import CSV** loads many at once. The first row must hold the column names above; `Paid` accepts Yes/No.
- **Export CSV** downloads whatever the current filters show.

## Data and hosting

Records are saved to `data/db.json`. Set `DATA_DIR` to put the file somewhere else. That folder is git-ignored, so back it up.

To reach it from anywhere, deploy to any host that runs Node (Render, Railway, Fly.io, a VPS). Use `npm start` as the start command, add a persistent disk for `DATA_DIR`, and serve it over HTTPS. Set `PORT` if your host needs it. Sign-in sessions last 12 hours and reset when the server restarts. After 10 wrong passwords, logins from that IP are blocked for 15 minutes.
