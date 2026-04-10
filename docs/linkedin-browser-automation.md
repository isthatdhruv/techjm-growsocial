# LinkedIn Browser Automation

This repository now includes a standalone Python utility at `scripts/linkedin_poster.py` for posting LinkedIn company updates without the official LinkedIn API.

## What it does

- Logs into LinkedIn with environment variables
- Reuses a persistent browser session from storage state
- Opens the company admin page
- Clicks the post composer
- Inserts generated text plus optional hashtags
- Posts with explicit waits and retry handling
- Saves screenshots on failure

## Environment variables

Set these in your shell or `.env`:

```bash
LINKEDIN_EMAIL=you@example.com
LINKEDIN_PASSWORD=your-password
LINKEDIN_COMPANY_ADMIN_URL=https://www.linkedin.com/company/112822225/admin/dashboard/
LINKEDIN_HEADLESS=false
LINKEDIN_TIMEOUT_MS=30000
LINKEDIN_POST_RETRIES=2
LINKEDIN_STORAGE_STATE_PATH=.linkedin_storage_state.json
LINKEDIN_SCREENSHOT_DIR=artifacts/linkedin
LINKEDIN_POST_CONTENT=Your generated content here
LINKEDIN_POST_HASHTAGS=AI,Automation,LinkedIn
```

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements-linkedin.txt
playwright install chromium
```

## Save login session once

```bash
python3 scripts/linkedin_poster.py --bootstrap-login
```

This opens a visible browser, logs in with `LINKEDIN_EMAIL` / `LINKEDIN_PASSWORD`, and stores the session in `.linkedin_storage_state.json`.

## Post content

```bash
python3 scripts/linkedin_poster.py "Hello from TechJM" --hashtags "AI,Automation"
```

or use env-provided content:

```bash
python3 scripts/linkedin_poster.py
```

## Integrate from Python

```python
from scripts.linkedin_poster import post_to_linkedin

post_to_linkedin(
    "Generated content goes here",
    hashtags=["AI", "Automation"],
)
```

## Notes

- The script targets the company admin dashboard by default:
  `https://www.linkedin.com/company/112822225/admin/dashboard/`
- If LinkedIn asks for extra verification, complete it once during bootstrap and rerun bootstrap.
- Failed runs save screenshots under `artifacts/linkedin/`.
