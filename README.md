# Ghana Jobs Digest

A free website that refreshes itself every morning at **06:00 GMT** (06:00 in Ghana) with new jobs pulled from trusted sources. It runs on GitHub (Actions + Pages), so there is no server to pay for or maintain.

## What it shows
- **Work mode:** remote, hybrid, on-site.
- **Where the job is:** in Ghana · remote and open to Ghana · remote (check eligibility) · outside Ghana on-site/hybrid · remote but *not* open to Ghana (hidden unless you tick it).
- **Relocation support (jobs outside Ghana):** offered / explicitly not offered / not stated, with the exact sentence from the posting so you can check it. Visa sponsorship is shown separately.
- **New today**, search, save (star) jobs, light/dark theme, and an RSS feed.

## Where the jobs come from ("verified")
| Type | Sources | Badge |
|---|---|---|
| Employer career sites | Greenhouse, Lever and Ashby public job feeds for the companies listed in `scripts/sources.json` | ✓ Employer site |
| Curated job boards | Remotive, Arbeitnow, Jobicy (free public APIs, linked back to the original posting) | Curated board |

Every card links to the original posting. Postings are dropped automatically if they ask for fees or deposits, tell you to apply by WhatsApp/Telegram, use a free-mail contact address, or use other common scam wording. When the same job is on a board and an employer site, the employer version is kept.
"Verified" means *trusted source*, not a guarantee about any single employer: always confirm on the company's own website before sending documents or money.

## Set up (about 10 minutes, free)
1. Create a new GitHub repository (public is simplest for free Pages) and upload this whole folder, keeping the `.github` folder.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions → "Daily jobs update" → Run workflow** to do the first fetch now. After that it runs by itself every day at 06:00 GMT.
4. Your site will be at `https://<your-username>.github.io/<repo-name>/`.
5. **Get told each morning:** the workflow opens a GitHub Issue with the day's new jobs, so GitHub emails you (make sure notifications are on for the repo: *Watch → All activity*). Turn this off with a repository variable `DAILY_DIGEST` = `false`. Or subscribe to `…/feed.xml` in any RSS reader.

## Choose what you see
Edit `scripts/sources.json`:
- `ats`: add employers by their careers-page slug, e.g. `jobs.lever.co/acme` → add `"acme"` under `lever`. Wrong slugs are skipped (the "Where these jobs come from" list on the site shows which sources worked).
- `filters.include_keywords`: e.g. `["fibre", "telecom", "network", "gis"]` to only keep jobs mentioning those words. `exclude_keywords` removes unwanted ones.

## Notes and limits
- Relocation / visa status is read from the job text. If a posting says nothing, it shows "not stated"; it is never guessed.
- Remotive shows jobs with a 24-hour delay and asks for a link back, which every card gives. Free APIs can change; if one stops working the others continue.
- Run `npm test` to check the classifier; `npm run demo` shows the site with sample data.
