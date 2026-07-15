# [Firm Name] — Website

A static, five-page marketing site.

## Structure

| File            | Page                    |
|-----------------|-------------------------|
| `index.html`    | Home                    |
| `founders.html` | About the founders      |
| `portfolio.html`| Portfolio               |
| `criteria.html` | Transaction criteria    |
| `contact.html`  | Contact                 |
| `styles.css`    | Shared stylesheet       |
| `scripts.js`    | Mobile nav + reveals    |

No build step — open `index.html` in a browser, or serve the folder with any static server.

## Local preview

```bash
cd site
python3 -m http.server 8080
# open http://localhost:8080
```

## What to customize

- **Founder bio & photo** — `founders.html`: replace placeholder paragraphs; drop a portrait into `assets/` and swap the `.person-photo` div for an `<img>`.
- **Portfolio companies** — `portfolio.html`: replace the six placeholder cards with real investments.
- **Criteria** — `criteria.html`: adjust deal size, EBITDA, sectors, geography.
- **Contact info** — `contact.html`: email, phone, and office address (currently placeholders).
- **Firm name / tagline / hero copy** — `index.html`.

## Deployment

Any static host works:

- **GitHub Pages** — push the `site/` folder, or set Pages to serve from it.
- **Netlify / Vercel** — drag-and-drop, no build config needed.
- **S3 + CloudFront** — upload as-is.

## Design notes

- Typography: Fraunces (display) + Inter (body), loaded from Google Fonts.
- Palette: near-black `#12151C`, warm cream `#F5F2EC`, bronze accent `#8B6F47`.
- Responsive down to ~360px. Mobile nav collapses at 780px.
- Respects `prefers-reduced-motion`.
