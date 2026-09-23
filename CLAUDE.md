# Cat Operator Assistant: project context for Claude

Hackathon prototype for "Smart Operator Assistant for CAT machinery". A cab tablet app for an excavator operator (EXC001, operator Aayush Raj, OP1001) plus a fleet manager view. The README lists every feature; this file is the working context.

## Run and check

- `python serve.py` then http://localhost:4173. Keep serve.py a ThreadingHTTPServer with `Cache-Control: no-store`: a single-threaded server stalls page loads.
- Demo sign-in: PIN **1001**, or pick "Fleet manager".
- No build step, no npm. Three.js r128 (cdnjs) and Lucide (jsdelivr) load from CDNs.
- After a change, open the page and check the browser console for errors. `node -e "new Function(require('fs').readFileSync('app.js','utf8'))"` is a quick syntax check.
- Live site: GitHub Pages from `main` (rebuilds on push). All asset paths must stay relative.

## Files

| File | What is in it |
| --- | --- |
| `index.html` | Shell: top bar (logo, Parked/Moving switch, sync chip, night mode, avatar, SOS), left menu panel, right "Right now" panel. Theme is set in an inline script before paint. |
| `app.js` | One IIFE. State object `S`, router `go('route/arg')` with hash URLs, one `renderX()` per screen, helpers (`$`, `$$`, `icons()`, `toast()`, `head()`). |
| `machine3d.js` | Procedural 3D excavator. Meshes are tagged with `PART`, `FAULT`, `WARN`. API: `mount(stage, canvas, {fit})`, `start`, `stop`, `project`, `setSelected`, `setTheme`. |
| `data.js` | The two datasets from the brief, the estimation model, schedule, sessions, fleet sample data, videos. |
| `styles.css` | Cat tokens (`--y` #FFCD11, `--ink`, `--panel`, status colours), day and night themes. New rules are appended at the end. |

## Routes

`home` · `tasks` (`tasks/time`) · `safety` (`safety/reports`) · `training` = Learn (`training/videos`, `training/habits`) · `machine` · `profile` · `settings` · `video/<youtubeId>` · `fleet`. The menu has only five items on purpose: Home, My tasks, Safety and reports, Learn, Machine.

## Features and where they live

- **Login** (`showLogin`): PIN pad or badge, operator or manager, session in sessionStorage.
- **Home** (`renderHome`): 3D machine, boom and hydraulics red (fault: boom cylinder leaking), tracks amber (check soon), selected part glows green; six hotspots and an overview card; "Your pace" and "Seatbelt" cab instruments; "Today's shift" replay; "While you wait" video after 3 minutes idle. Do not redesign Home unless asked.
- **My tasks** (`renderTasks`, `planDay`): Now / Next / Shift left tiles, job list, mark done, dynamic rescheduling (10 min gap, shift ends 18:00, jobs that no longer fit go to tomorrow, shorter jobs move up), Add job saved in localStorage.
- **Job time** (`renderEstimator`): planned × level × weather × machine age. Plan error 13.2%, model 2.4% on the five dataset jobs (fitted on those same jobs: say so).
- **Moving lock** (`setMoving`): demo switch standing in for travel and joystick telemetry.
- **Safety** (`renderSafety`): engine-start seatbelt interlock, site warning flags, proximity radar with logged events, rain tightens the rules, SOS.
- **Reports** (`renderIncidents`, `addIncident`): each report has a machine snapshot; saved offline first (`S.offline`, `S.pending`, localStorage).
- **Learn**: `renderControls` (top-down cab, 8 controls, each linked to a Cat video), `renderTraining` (videos), `renderInsights` + `habitsPatterns` (last 5 shifts against the operator's own baseline).
- **Machine** (`renderMachine`): the 3D model in fit mode, Fix now / Check soon / Fine, next service.
- **Fleet** (`renderFleet`): manager view, hides the side panels.
- Night mode, English/Hindi menu, custom dropdowns (`enhanceSelect` upgrades every `<select>` automatically).

## Data rules

- Real: the telemetry (4 rows) and the tasks (T001 to T005) from the brief, and the 7 Cat® Products YouTube video IDs.
- Sample, and labelled as such: sensor values (hydraulic temperature, track wear, the boom fault), personal bests, earlier shift history, proximity events, the Backfill trench job (T006), other operators and machines.
- Insights worth quoting: the belt came off during about an hour of waiting both times, so the risk is at restart; fuel per load up to 2.0 L (4× the 0.5 L normal); 71% of engine time idle between 08:00 and 10:00; 3.7 engine hours for a single load.

## Writing and design rules (the team agreed these)

- Plain words an operator uses on site. Short sentences. Say "you". No data jargon (telemetry snapshot, load cycle, compliance) and no metaphors that need explaining.
- As little text as possible: one line per item, one-word status tags, no explanatory paragraphs.
- Must not look AI-generated: no stacks of look-alike cards with coloured left borders, no tinted icon squares, no spaced-out uppercase labels, no "insight" boxes.
- Prefer realistic visuals (3D model, realistic drawings, real dashboard icons, real Cat videos).
- Glove-sized controls (44px or more), black text on yellow, screens that fit without scrolling where possible.
- No em dashes anywhere in UI text or docs.
- Cat brand: yellow means brand or action, never "bad". The yellow warning flag is canary with a hatch pattern.

## Not built

Backend is optional (see README): SQLite by default, PostgreSQL not hosted yet. Models are trained on sample data. Motion comes from the machine remote or a demo switch.
