# Sales Team Leader Practice Scenarios

Static GitHub Pages app for Sales TL applicants to submit text responses to four scenario videos.

Target live site: https://emersoncoaching.github.io/sales-tl-practice-scenarios/

## Current Setup

- `config.js` points at the Supabase project for response storage.
- The base Supabase response-storage schema has been applied.
- The four compressed scenario videos are included in `assets/videos/`.
- Applicants submit text responses with light rich text formatting.
- Dan reviews submissions from the private dashboard URL stored in `private/admin-dashboard.md`.
- Dan-facing dashboard and review pages require a one-time private-access password in each browser.

## Private Dashboard Setup

Email notifications are intentionally not required. The dashboard uses an unguessable `?admin=` URL and a Supabase RPC function that compares the token to a SHA-256 hash.

To enable the dashboard in Supabase, run `supabase/admin-dashboard.sql` in the Supabase SQL editor.

The real admin token is not committed to GitHub. Keep `private/admin-dashboard.md` local.

The private-access password itself is not committed; the public app stores only the SHA-256 hash used for the browser gate.
