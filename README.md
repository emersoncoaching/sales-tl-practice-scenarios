# Sales Team Leader Practice Scenarios

Static GitHub Pages app for Sales TL applicants to submit text responses to four scenario videos.

## Current Setup

- `config.js` points at the Supabase project for response storage.
- `supabase/schema.sql` has been applied in Supabase.
- The four compressed scenario videos are included in `assets/videos/`.

## Remaining Email Setup

To email Dan when a new response arrives, deploy the Supabase Edge Function in `supabase/functions/notify-sales-tl-submission` and set these function secrets:

```sh
RESEND_API_KEY=...
NOTIFY_FROM=hiring@emersoncoaching.com.au
NOTIFY_TO=dan@emersoncoaching.com.au
SUPABASE_SERVICE_ROLE_KEY=...
```

The applicant-facing app only needs the public anon key. The service role key stays in Supabase function secrets.
