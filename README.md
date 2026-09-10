# Facthor8

Marketing site and brand system for **Facthor8**, a Human Risk Management consultancy focused on strengthening the eighth layer of cybersecurity: people.

## Positioning

- Category: Human Risk Management
- Claim: The Human Security Layer
- Core offer: six-month Cyber Culture Transformation Program
- Markets: Spain and Latin America
- Audience: organizations with 20–500 employees

## Local preview

Serve the `dist` directory with any static server for the front end. The site itself has no build step. The contact form posts to a Vercel Serverless Function at `/api/contact`, so to test the full flow locally use the Vercel CLI instead of a plain static server:

```
npm i -g vercel
vercel dev
```

## Deployment

The project is configured for Vercel. `vercel.json` points the static output at `dist`; the `api/` directory at the repository root is deployed automatically as a Serverless Function alongside it — no separate build step is required for either.

## Environment variables

The contact form (`api/contact.js`) sends email via [Resend](https://resend.com). Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Yes | — | From your Resend account (Settings → API Keys). |
| `CONTACT_TO_EMAIL` | No | `info@facthor8.com` | Inbox that receives new leads. |
| `CONTACT_FROM_EMAIL` | No | `Facthor8 <onboarding@resend.dev>` | Resend's shared testing domain works with zero setup. For a `@facthor8.com` sender address, verify the `facthor8.com` domain in Resend (DNS records) and set this to `Facthor8 <info@facthor8.com>`. |

Redeploy after adding or changing environment variables.

## Brand assets

Production-ready SVG and high-resolution PNG variants live in `brand/`. The website uses the optimized copies under `dist/assets/brand/`. The editable and PDF brand manuals are stored in `brand/manual/`.

## Before public launch

- [x] Connect the primary CTA to the approved commercial email, calendar or CRM form. — Done: the contact form posts to `/api/contact`, which emails `CONTACT_TO_EMAIL` via Resend. Requires `RESEND_API_KEY` to be set in Vercel (see Environment variables above).
- [ ] Add the legal entity, privacy policy and cookie notice if analytics or tracking are enabled.
- [ ] Confirm the trademark and domain protection strategy for the Facthor8 name and claim.
- [ ] Replace any unapproved claims, logos or credentials before adding them.
