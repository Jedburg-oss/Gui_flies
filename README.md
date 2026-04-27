# Boston → Japan Flight Tracker

A static site that visualizes your KAYAK scrape results and compares each new scan against the previous one. Hosted **free** on GitHub Pages — no backend, no API keys, no costs.

---

## What this gives you

- ✈️ **Hero stats** — cheapest deal, average price, biggest swing
- 📊 **Charts** — price by month + day-of-week, auto-updating from your CSVs
- 🔄 **Comparisons** — every chart and table can compare any two scans, with biggest price drops/hikes called out
- 🏆 **Top 10 deals** — clickable rows that link directly to KAYAK
- 📁 **Just drop CSVs** — no rebuilds, no compile step

---

## File structure

```
flight-tracker-site/
├── index.html          ← the site
├── style.css           ← Tokyo Twilight theme
├── app.js              ← chart rendering + CSV parsing
├── add_run.py          ← helper to add new scans
├── README.md
└── data/
    ├── manifest.json   ← tells the site which CSVs exist
    └── 2026-04-26.csv  ← your scan files
```

---

## ONE-TIME SETUP (10 minutes)

### 1. Create a GitHub repo

1. Go to https://github.com/new
2. Repo name: anything you want (e.g. `japan-flights`)
3. Set it to **Public** (required for free GitHub Pages)
4. Don't add README/license
5. Click **Create repository**

### 2. Upload these files

In the new repo, click **uploading an existing file** and drag the entire `flight-tracker-site` folder contents (not the folder itself — the files inside it).

Or via terminal:

```bash
cd flight-tracker-site
git init
git add .
git commit -m "Initial flight tracker"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

### 3. Enable GitHub Pages

1. In the repo, go to **Settings** → **Pages** (left sidebar)
2. Under "Build and deployment":
   - **Source**: Deploy from a branch
   - **Branch**: `main` / `/ (root)`
3. Click **Save**

Wait ~1 minute. Your site will be live at:

```
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

GitHub shows the exact URL on the same Settings → Pages page once it's ready.

---

## EVERY 2 WEEKS — adding a new scan

After running `kayak_finder.py` and getting a fresh `flight_results.csv`:

```bash
cd flight-tracker-site

# Adds the CSV with today's date and updates manifest
python3 add_run.py /path/to/flight_results.csv

# Push to GitHub — site updates within ~1 minute
git add data/
git commit -m "Add scan: $(date +%Y-%m-%d)"
git push
```

That's it. Refresh your site and the new scan appears in the dropdown, automatically compared against the previous one.

### Optional: label your scans

```bash
python3 add_run.py flight_results.csv --label "after announced fare sale"
```

The label shows up in the dropdown next to the date.

---

## How comparisons work

When you have two or more scans, the site:

1. Picks the most recent as "current" and the one before it as "comparison"
2. Computes deltas for cheapest, average, most expensive, and total itineraries found
3. Finds **matching (date, airport) pairs** between the two scans and shows the **5 biggest price drops** and **5 biggest hikes**
4. You can override either side via the dropdowns at the top to compare any two arbitrary scans

If a date+airport exists in the new scan but not the old (or vice versa), it's excluded from the movers tables — only true matches count.

---

## Costs

**$0.** Forever.

- GitHub Pages: free for public repos
- Chart.js + PapaParse: loaded from public CDN, no fees
- No backend, no database, no API calls
- Your $5 Anthropic credit remains untouched — it's not used by this site

---

## Troubleshooting

**Site loads but says "No data files found"**
→ Make sure `data/manifest.json` exists and lists at least one CSV that's also in `data/`.

**Charts are empty / "Failed to load"**
→ Open browser console (F12). Likely the CSV is malformed or has different column names. The site expects the columns produced by `kayak_finder.py` v6+:
`price_usd, departure_date, return_date, day_of_week, month_name, destination_code, out_airlines, out_stops, out_layovers, out_duration, is_nonstop, booking_url`

**Manifest got corrupted**
→ Just delete `data/manifest.json` and let `add_run.py` regenerate it on the next run.

**I want to delete an old scan**
→ Delete the CSV from `data/` and remove its entry from `data/manifest.json`. Commit and push.

---

## Local preview before pushing

```bash
cd flight-tracker-site
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser. You don't need a build step — it's pure static HTML + JS.
