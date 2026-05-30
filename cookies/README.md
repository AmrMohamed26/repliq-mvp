# Site cookies (Upwork & LinkedIn)

Screenshots for logged-in pages need your browser session cookies.

## Setup

1. Log in to **Upwork** or **LinkedIn** in Chrome.
2. Use a cookie export extension (e.g. **Cookie-Editor** → Export → JSON).
3. Save the file here:
   - `cookies/upwork.json`
   - `cookies/linkedin.json`

Format (Cookie-Editor style):

```json
{
  "url": "https://www.upwork.com",
  "cookies": [ { "domain": ".upwork.com", "name": "...", "value": "...", ... } ]
}
```

4. **Restart the worker** after updating: `npm run worker:dev`

## Refresh

Cookies expire (especially LinkedIn). The app shows a banner when:

- Files are missing
- Login cookies are missing from the export
- Cookies are expired or expiring within 7 days

When you see the banner, export fresh cookies and replace the JSON files.

## Security

- These files are **gitignored** — never commit them.
- Treat them like passwords; anyone with the file can access your account.
