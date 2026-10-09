# Reputation Pilot

A small web app for tracking Google review postings. It has no dependencies and needs only Node.js 18 or newer.

```sh
cd review-tracker
npm start          # http://localhost:3000
```

## Logins

- **Admin** (full access): `edygal` / `55555`. To change it, set the `ADMIN_USER` and `ADMIN_PASS` environment variables.
- **Posters**: in the **Posters** tab, add each person who posts reviews, with a login. A poster sees the reviews assigned to them (their **Poster ID**) plus the **unassigned** reviews of the companies ticked for them, never another poster's. When they update an unassigned review it becomes theirs. They can only change **Posted As**, **Review Link** and **Status**, using the **Update** button on each row. The server refuses anything else. Use **Edit** to change a poster's name, companies or password (leave it blank to keep it).
- **Poster notifications**: posters have a bell in the top bar with a count of unread notifications. They are notified about Pending reviews in their feed: when one is added for their companies or assigned to them, when its **Post on** date arrives, and while it is overdue. Opening the panel marks everything read (saved on the server, so it carries across devices); clicking a notification opens that review's Update window. The poster's page checks for new work every minute.
- **Client notifications**: viewers also have a bell. They are notified when a review for their company is first posted (set to Posted or Live) in the last 30 days; clicking the notification opens the review on Google when it has a review link. Reviews added with an older Posted-on date don't notify. Read state is saved per viewer, and the page checks for new posts every minute.
- Clients (viewers) see the **Posted As** name, never the Poster ID.
- **Viewers** (read-only): after signing in as admin, click **Viewer logins** in the top bar, create a username and password, and pick the one company that login may see. A viewer sees only records whose **Client** matches their company. If that company is deleted, the login sees nothing until you assign another. The server does this filtering, so other clients' records never reach their browser. Viewers can search, filter and export their own records but cannot change anything. Use **Edit** to change a login's company or password (leave the password blank to keep it). Renaming a company renames its records too, so viewers keep access. Removing a viewer signs them out right away.

## Records

Each record has: Client, Platform (Google, Houzz, Angi, BuildZoom, HomeAdvisor, Facebook, BBB, Porch, Thumbtack or Networx; Google if left blank), Listing, Post On (the date you want it posted; Pending reviews past that date show as overdue), Review, Image URL (a link to the photos to post with the review), Posted On (called Post Date in CSV files), Poster ID (the username of the poster doing the work), Posted As (the name the review is published under), Review Link, Status (Pending, Posted, Live, Removed) and Paid (whether the poster was paid).

- **+ Add record** adds one record at a time.
- **Import CSV** loads many at once. The first row must hold the column names above; `Paid` accepts Yes/No.
- **Filters**: client, platform, **Poster ID** (each poster, or *No poster ID* for unassigned reviews; admin and posters only), status, warranty and payment.
- **Export CSV** downloads whatever the current filters show.
- **Bulk changes** (admin): tick the boxes on the left of the Reviews table (or the header box to select everything shown), then use **Mark poster paid**, **Mark poster unpaid** or **Change status to…**.

**Warranty**: every posted review is covered for 30 days from its **Post Date** (set `WARRANTY_DAYS` to change it). The admin sees a review's warranty in its **Edit** window, and posters in the **Update** window: under warranty with the days left, removed while still covered (needs replacing), or expired. To list reviews by warranty, use the **Any warranty** filter on the Reviews page. When a poster (or a bulk change) first marks a review Posted or Live, its Post Date is set to that day so the warranty starts then; a posted review saved with no date also gets today's date. Clients (viewers) don't see warranty details.

**Paid** means whether the poster was paid for that review. Only the admin sees it; viewers and posters never receive it.

Each company can have a listing link per platform (Companies tab → Edit). When you add a review and choose the client and platform, that platform's listing link is filled in. Filter the Reviews table by platform, and see a **By platform** breakdown in Statistics.

**Package renewals**: a company's package is the **Number of reviews** ordered, counted from its **Start date**. The Reviews column shows how many are Posted or Live in the current package. When it reaches the number ordered, the company shows *Package complete* and the admin's bell notifies them to renew with the client. Click the notification (or Edit the company) and use **Start a new package**: it sets the start date to today and clears the payment so you can enter the new one. Reviews posted before the renewal don't count toward the new package.

## Credit (admin and posters)

A **credit** is a review the poster was paid for (marked Poster paid) that was then marked **Removed** within the warranty (30 days from its Posted on date). The poster owes a replacement. The app records when a review is removed to tell.

- **Admin**: the Credit tab lists every credit with the poster, dates and poster pay. Filter by owed / replaced / all and by poster, and use **Mark replaced** once the poster has made up for it (**Reopen** undoes it). Statistics → By poster has a Credit column with each poster's open credits.
- **Posters**: the Credit tab lists every review they were paid for, with the pay. Paid reviews show **Paid**; ones removed within the warranty show **Credit** (or **Credit · replaced** once settled). Posters see pay only on their own reviews, never the client price.

## Statistics and prices (admin only)

The **Statistics** tab shows, for a chosen period and company: reviews posted, **charged to clients**, **paid to posters**, **owed to posters** and **profit** (charged minus paid and owed), with breakdowns by company and by poster.

- *Charged* counts Posted and Live reviews at the client price. *Paid* counts reviews marked **Poster paid** (any status) at the poster pay. *Owed* counts Posted and Live reviews not yet marked Poster paid. Periods use each review's Post Date.
- Prices are set per company: a **client price per review** (what the client is charged) and a **poster pay per review** (what the poster is paid). Set them in the company's Edit window or in the Prices table at the bottom of the Statistics tab.
- When a review is posted, it keeps the company's prices in force at that moment, so later price changes only affect new reviews. Tick **Also update reviews already posted** to re-price existing ones. Editing a review never changes its prices. Posters and viewers never see prices.
- The By poster breakdown and notifications are matched by the review's **Poster ID** (the poster's username; older reviews holding the poster's display name still match).

## Companies (admin only)

The **Companies** tab stores each company's name, listing URL, number of reviews ordered, start date, payment date and amount paid. It also shows how many of that company's reviews are live, by matching record **Client** names to the company name. Viewers never see this tab, and the server refuses company requests from viewer logins. When you add a record and pick a known company as the client, its listing URL fills in automatically.

## Data and hosting

Records are saved to `data/db.json`. Set `DATA_DIR` to put the file somewhere else. That folder is git-ignored, so back it up.

To reach it from anywhere, deploy to any host that runs Node (Render, Railway, Fly.io, a VPS). Use `npm start` as the start command, add a persistent disk for `DATA_DIR`, and serve it over HTTPS. Set `PORT` if your host needs it. Sign-in sessions last 12 hours and reset when the server restarts. After 10 wrong passwords, logins from that IP are blocked for 15 minutes.
