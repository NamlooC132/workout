# Workout Log (web app)

A fast, offline workout logger for iPhone (and any phone), built as an installable web app.
No account, no server, no internet needed after the first visit. Each person's data stays on their own phone.

Free to host on GitHub Pages. You install it from Safari with **Share → Add to Home Screen**, and it opens full-screen like a normal app.

---

## 1. Publish it (free, about 5 minutes)

1. Sign in at **github.com** and click **+ → New repository**.
   - Name: `workout` · choose **Public** (free GitHub Pages needs a public project; your workout data is **not** in it) → **Create repository**.
2. Click **uploading an existing file**. Open the `WorkoutLog-Web` folder, select **everything inside it** (`index.html`, `manifest.webmanifest`, `sw.js`, `README.md`, and the folders `css`, `js`, `icons`, `tests`) and drag it onto the page. Wait until all files are listed → **Commit changes**.
3. In the project, open **Settings → Pages**. Under *Build and deployment*: Source **Deploy from a branch**, Branch **main** and **/ (root)** → **Save**.
4. Wait 1–2 minutes and refresh the Pages screen. Your link appears: `https://YOUR-USERNAME.github.io/workout/`

## 2. Install it on the iPhone

1. Open the link in **Safari** (it must be Safari on iPhone).
2. Tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open it from the new home-screen icon. It works offline from now on.
4. Friends do the same with your link. Each phone has its own data.

> Use the home-screen icon, not a Safari tab: the data belongs to the installed app. **Never delete the icon** without exporting a backup first (Settings → Export all data), and don't use "Clear History and Website Data" in Safari settings.

## 3. Updating the app later

1. Change the files and upload them again to the same GitHub project (same names replace the old ones).
2. In `sw.js` change `VERSION` (e.g. `workoutlog-v1.0.1`) so phones notice the update.
3. On the phone, open the app; a "New version is ready → Reload" message appears. Your data is untouched.

---

## 4. What's inside

```
index.html              app page
manifest.webmanifest    name, icon, full-screen settings for "Add to Home Screen"
sw.js                   offline support (caches every file)
css/app.css             design: light & dark, big touch targets
icons/                  app icons
js/
  main.js               start-up, routing, tab bar, sheets
  vdom.js               tiny renderer (no libraries)
  db.js                 IndexedDB storage + schema migrations
  store.js              in-memory state, autosave, import transaction
  timer.js              rest timer (end-time based), sound, keep-screen-on
  workoutService.js     live workout: prefill, sets, supersets, finish, deload
  logic/                pure, unit-tested training logic
    model.js            data shapes, defaults, routine overrides, snapshots
    progression.js      progressive overload rules
    records.js          e1RM, PRs, stagnation, chart series
    volume.js           sets per muscle (direct/indirect)
    blocks.js           training blocks, deload weeks, schedule
    analytics.js        frequency, streaks, routine summaries
    backup.js           JSON export/validation/duplicate detection (+ iPhone-app backups)
    history.js, units.js, muscles.js, restTimer.js, samples.js, util.js
  ui/                   screens: routines, exercises, workout, history, progress, plan, settings
tests/unit.test.mjs     23 unit tests for the logic
```

No third-party libraries and no build step: what you upload is what runs.

## 5. Key decisions

| Topic | Decision |
|---|---|
| Storage | IndexedDB in the browser, written on **every** change. The app asks the browser to keep the data ("persistent storage"). |
| Weights | Always stored in kg, lengths in cm; converted for display. Switching kg ⇄ lbs never changes data. |
| Shared history | Exercises live in one library; routines point to them. History is per exercise, so it's shared across routines. |
| Routine overrides | Each routine can override sets, warm-ups, rep range, rest, weight step and RIR target without changing the library. |
| History snapshots | Every logged exercise stores a snapshot (name, muscles, type, rep range…). Editing or deleting an exercise later never rewrites old workouts or old weekly volume. |
| Replace / delete | Replacing an exercise keeps both histories. Deleting an exercise removes it from routines; past workouts keep their sets. |
| Progressive overload | Default rule: every straight working set at the same weight reached the top of the rep range → suggest +2.5 kg / +5 lbs. Also "average reps" and "custom (reps + RIR)" rules, per-exercise step. Requires at least the target number of working sets. Warm-ups, drop and rest-pause sets are ignored. Never applied without a tap. Assisted exercises suggest less assistance; pure bodyweight suggests "make it harder". |
| Warm-ups | Never count toward volume, PRs or progression. |
| Unilateral | Left and right reps logged separately; the weaker side counts for progression. |
| Dumbbells | Per-hand or total weight per exercise; per-hand tonnage is doubled. |
| Volume | Completed non-warm-up sets × contribution (default 1 direct, 0.5 indirect, editable per exercise; drop/rest-pause sets 1 or ½). Shown as a training guide, not a measure of muscle growth. |
| Deload | Deload weeks (from a training block) pause suggestions and offer one-tap "Apply deload" (½ sets, ~10 % lighter). "Last time" and suggestions skip deload sessions. |
| Rest timer | Stores an absolute end time, so it survives reloads and backgrounding. One timer at a time. In supersets it starts after the last exercise of each round. |
| Lock screen | A website can't play sounds while the phone is locked, so the app keeps the screen awake during workouts (Wake Lock). Sound follows the silent switch; iPhones don't let websites vibrate (Android does). |
| Import | Validated first, previewed with duplicate counts, then written in **one transaction** (all or nothing). Never overwrites or deletes. Same-name exercises are reused so history stays together. Accepts backups from the earlier iPhone (Swift) app. |
| Unfinished workout | An active workout is a normal saved record; it reopens automatically on launch. |

## 6. Testing

**Automated** (needs Node 18+): `node --test tests/unit.test.mjs`. This covers progression rules, units, e1RM/PRs, stagnation, volume, the rest timer, backup validation/duplicates, iPhone-backup conversion, blocks/deload, streaks and templates.

**Feature checklist (on the phone):**
- **Routines:** + new (or from a template) · Edit → drag ≡ to reorder · ⋯ rename / folder / duplicate / delete (Undo) · routine screen shows exercises, sets, minutes, last done, muscles.
- **Exercises:** tap an exercise in a routine → change sets/reps/rest just for that routine · Superset with next · Replace · Remove (Undo) · Edit in library: photo (camera or library), type, unilateral, muscles %, defaults, progression rule, notes.
- **Workout:** Start → sets prefilled from last time · "Last time: 60 kg × 10, 10, 9" · − / + weight · RIR chips · tap the set number for type/note/delete · Add set (working/warm-up/drop/rest-pause) · ⋯ menu: note, replace, skip, superset, reorder, remove.
- **Overload:** finish a session with max reps on all sets → next time a green banner shows → Apply fills all sets.
- **Rest timer:** tick a set → countdown with −15s / +15s / Skip and "Next: …". Ends with a chime (silent switch off). Manual timer via the ⏱ button.
- **Never lose data:** in the middle of a workout, swipe the app away → reopen → "Your workout was restored". ⌄ minimizes it (orange bar at the bottom).
- **Finish:** choose to drop unticked sets or mark them done → summary with PRs and sets per muscle → optional "Save them to the routine".
- **History:** tap a workout → details, PRs, sets per muscle · Edit → change weights/reps/type, add/delete sets, add/remove exercises, date and duration · Delete (Undo).
- **Progress:** Overview (this week, streak, frequency chart, calendar, plan adherence, recent PRs, stalled exercises) · Volume (weekly/monthly sets per muscle vs targets, direct vs indirect, change vs last period, 12-week trend) · Exercises (charts of weight, e1RM, reps, volume; records; comparisons) · Body (log weight & measurements, charts, custom measurements).
- **Plan:** Routines → 📅 → new block: phase, start, weeks, deload weeks, weekly schedule → Routines shows "Today: Push"; the calendar shows planned/missed days.
- **Settings:** kg/lbs, cm/in, week start, defaults, RIR off/optional/required, progression defaults, volume targets, custom muscles, timer options, theme, Export all, Share routines, Import, storage status, erase all.
- **Offline:** turn on Airplane mode → the app still opens and works.
- **Dark mode:** follows the phone, or set it in Settings → Theme.
