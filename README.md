# Roofing website

Astro static site for a family-owned residential roofer serving Los Angeles and Orange County.

```sh
npm install
npm run dev      # local preview at http://localhost:4321
npm run build    # static output in dist/, deploy anywhere
```

## Before launch

Anything shown on the site as a dashed yellow chip or a labeled photo box is a placeholder. Fill these in:

1. **Business facts**: `src/data/site.ts`. Company name, phone, email, address, CA license number, year founded, hours, emergency hours.
2. **Estimate form**: set `formAction` in `src/data/site.ts` (Formspree, Netlify Forms, or your CRM endpoint).
3. **Online booking**: set `bookingUrl` (Calendly, Jobber, Housecall Pro...).
4. **Reviews**: add real reviews to `reviews` in `src/data/site.ts`, and set `googleReviewsUrl`.
5. **Certifications**: list the ones you hold in `certifications`.
6. **Photos**: put them in `public/images/` and pass `src="/images/..."` to each `<Photo>` (hero, services, about).
7. **Logo**: replace the house mark in `src/components/Header.astro` and `public/favicon.svg`.
8. **Copy to write or confirm**: your story (About page), insurance carrier, financing provider and approved terms (Financing page), and the city list in `areas`.
9. **Domain**: set `site` in `astro.config.mjs`.

Design system: see `DESIGN.md`. Product context: see `PRODUCT.md`.

## Reputation Pilot

`review-tracker/` is the Reputation Pilot, a separate small app for tracking Google review postings, with admin and read-only viewer logins. See `review-tracker/README.md`.
