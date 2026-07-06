# 🏁 RaceCalendar

A small, dependency-free PWA that tracks racing calendars — F1, MotoGP, WRC, WEC, Dakar,
America's Cup and more. Plain HTML/CSS/JS, no build step: every page reads its content
from the JSON files in this repo.

**Times are entered in the track's local timezone and shown in the visitor's timezone.**

## Pages

| Page | What it shows |
|---|---|
| `index.html` | What's racing **today / this week**, plus the next event of every series |
| `calendars.html` | All series grouped by category; tap one to open it |
| `series.html?id=<id>` | One template page for *every* series: next race, weekend schedule, full season |
| `tracks.html` | Every track referenced by any calendar (auto-generated list) |
| `trivia.html` | Trivia questions from `trivia.json` |
| `more.html` | Menu: Tracks, Games, Preferences, about links |
| `preferences.html` | Preferences: theme (vintage / modern) + favourite competitions |

## 📅 Yearly update — the only routine job

Replace the files in `calendars/` with the new season's data (same filename, same format).
That's it — the year shown on the site comes from the JSON itself.

Calendar format (`calendars/<id>.json`):

```json
{
  "championship": "Formula 1",
  "year": 2027,
  "races": [
    {
      "idtrack": "Italy.Monza.F1",
      "name": "Italian Grand Prix",
      "date": "2027-09-05",
      "time": "15:00",
      "additionalInfo": {
        "sessions": [
          { "name": "Free Practice 1", "date": "2027-09-03", "time": "13:30" },
          { "name": "Race", "date": "2027-09-05", "time": "15:00" }
        ]
      }
    }
  ]
}
```

Notes:
- `date`/`time` are **local to the track** (looked up from the track's `timezone`).
- Multi-day events (rallies, Dakar) also set `"startDate"`. Sessions/stages appear on
  the day they happen.
- `time` may be empty (`""`) when unknown — the site then hides the time.
- `idtrack` may be empty for events without a fixed venue.

## ➕ Adding a new series

1. Add `calendars/<id>.json` (format above).
2. Add a logo in `logos/` and (optionally) a background photo in `backgrounds/`.
3. Add one entry to **`series.json`**:

```json
{
  "id": "indycar",
  "name": "IndyCar Series",
  "shortName": "IndyCar",
  "tag": "motorsport",
  "featured": false,
  "multiDay": false,
  "calendar": "calendars/indycar.json",
  "logo": "logos/indycar.png",
  "background": "backgrounds/indycar.jpg",
  "site": "https://www.indycar.com/",
  "accent": "#ff2d55"
}
```

No HTML, CSS or JS changes needed — the home page, calendars page, series page,
service-worker cache and tracks page all pick it up automatically.

- `tag` groups series on the calendars page (`motorsport`, `nautical`, or any new tag).
- `featured: true` makes the series a *default* favourite: shown in the home feed and
  starred on its tile. Visitors override this from Preferences (stored in localStorage).
- `multiDay: true` marks stage-based events (rally-style) that span several days.
- `accent` is the color used for the card stripe/badges.
- `background` can be `""` — the tile falls back to a gradient built from `accent`.

## 🗺️ Adding a new track

Create `tracks/<idtrack>.json` (id convention: `Country.Circuit_Name.SERIES`):

```json
{
  "id": "Italy.Monza.F1",
  "name": "Monza",
  "length_km": 5.793,
  "turns": 11,
  "lap_record": "1:21.046 (Barrichello, 2004)",
  "location": {
    "city": "Monza",
    "country": "Italy",
    "timezone": "Europe/Rome"
  },
  "image": "tracks/Italy.Monza.F1.png"
}
```

Reference the id from a calendar's `idtrack` and the track appears on the Tracks page
automatically (the list is derived from the calendars — there is no index file).
`timezone` is what converts calendar times correctly, so set it for every track.

## ❓ Trivia

Append to `trivia.json`:

```json
{ "id": "F1.4", "tag": "motorsport", "question": "…", "answer": "…" }
```

## Development

Any static file server works:

```
python -m http.server 8000
```

then open <http://localhost:8000>. (`fetch()` doesn't work from `file://`.)

Code layout:

```
scripts/data.js       data loading + all date/timezone logic (no DOM)
scripts/ui.js         app shell (bottom nav, offline banner) + shared widgets
scripts/page-*.js     one small controller per page
style.css             design tokens at the top, one section per component
sw.js                 offline cache (bump the CACHE constant when restructuring files)
```
