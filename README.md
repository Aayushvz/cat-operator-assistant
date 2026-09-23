# Cat Operator Assistant

A smart operator assistant for Cat® machinery, built for the "Smart Operator Assistant for CAT machinery" hackathon challenge. It supports an excavator operator through the whole shift: tasks, safety, training, unusual machine behaviour and task time estimation, all driven by the telemetry and task data from the problem statement. Written in plain words an operator uses on site.

**Live demo:** https://aayushvz.github.io/cat-operator-assistant/
Pick an operator, enter the demo PIN (the last 4 digits of their ID, e.g. **1001**), put the belt on and start the engine. Or choose **Open fleet view** for the manager view.

## Run it locally

No build step and no dependencies to install. You need Python 3.

```bash
python serve.py
```

Then open http://localhost:4173.

## Features

### Start of shift (SRS 3.1, 3.4)
- **1. Who is driving**: pick an operator; each shows their level (Beginner, Intermediate, Expert), which sets the job time estimates. Fleet managers open the fleet view from the same screen.
- **2. PIN**: PIN pad with large keys for gloved hands, or "Scan ID badge".
- **3. Belt on, start**: the engine stays locked until the seatbelt is on. A blocked start is logged as a report. Walk-around checks are offered before starting. With the backend running, the belt comes from the machine.
- Then the main screen opens. Every report is tied to the operator and machine. Sign out from the profile.

### Home: the machine (SRS 3.2)
- Realistic 3D model of excavator EXC001 with Cat branding. Opens in a fixed pose and turns slowly; drag to rotate.
- Parts coloured by condition: **boom and hydraulics red** (fault: boom cylinder leaking), **tracks amber** (check soon).
- Six clickable component points. The open part glows **green** on the model and its details show in a card.
- **Your pace**: time ahead of or behind your personal best on the same kind of job.
- **Seatbelt**: live status with a real dashboard warning light; flashes red and says "Stop. Put your belt on." if the machine moves unbuckled.
- **Today's shift**: replay of the day with labelled blocks (working, waiting, lunch), alert markers, and a plain sentence of what you were doing.
- **While you wait**: after 3 minutes of idling, a short Cat video is offered, picked from your data.

### My tasks (SRS 3.3, 3.7)
- **Today**: Now / Next / Shift left tiles, then the job list with one line per job.
- **Dynamic rescheduling**: mark a job done with its real time, or tap **Running late +15**; later jobs move. A job that no longer fits before 18:00 moves to tomorrow and shorter jobs move ahead of it.
- **Add job**: pick the job, place and planned time; it joins the plan with an estimate. Added jobs are saved on the device and can be removed.
- **Job time**: estimate any job from planned time × operator level × weather × machine age, shown as a range, with the working shown. On the five dataset jobs the plan is off by 13.2% on average and the estimate by 2.4% (the factors were fitted on those jobs).

### Locked screen while moving (SRS 3.3, 5)
- A **Parked / Moving** switch in the top bar (a demo stand-in for travel and joystick telemetry).
- While moving, the screen locks to one strip: current job, minutes left, belt status, and hold-to-use **Report** and **SOS**.

### Safety and reports (SRS 3.4)
- **Site warnings**: All clear, Slow down, Stop now, Give way, shown as a colour around the screen edge.
- **Who is near you**: radar with stop and slow zones; each zone crossing is logged and becomes a report.
- **Site conditions** tighten the rules: in rain the stop zone grows from 6 to 7.5 m, the slow zone from 10 to 12.5 m, and the engine switches off after 4 minutes of waiting instead of 5.
- **Emergency SOS**: hold 1.5 seconds; stops the machine, calls the supervisor and medic, shares location, saves the data.
- **Reports**: hold, then two taps (what happened, how bad). Every report carries a snapshot of the machine (operator, engine hours, belt, state, fuel, place).

### Learn (SRS 3.5, 3.6)
- **Controls**: a realistic top-down drawing of the cab with 8 numbered controls. Each shows what it does, how to be careful, and a Cat video.
- **Videos**: real videos from the official Cat® Products YouTube channel, played in the app. Marking one watched raises the operator's level.
- **Your habits**: the last 5 shifts compared with the operator's own usual, rated Normal / Worth a look / Concerning. Kept separate from safety alerts, which fire instantly.

### Machine (SRS 3.2)
- The 3D machine coloured by condition, then **Fix now**, **Check soon** and **Fine**, and the next service in hours.

### Fleet view for managers (SRS 3.8)
- Filters by operator and machine, a review list of habit flags (Talk to operator / Dismiss), waiting-time trends, reports per day, fuel per load, plan accuracy and a full log.

### Works without signal (SRS 5)
- Reports are saved on the device first. With no signal the top bar shows how many are waiting; they send when signal returns. Try it with **Settings → No signal (demo)**.

### Everywhere
- Five-item menu, collapsible side panels, and a right panel with live job, health and alerts.
- Day and night mode, English and हिंदी, custom dropdowns, and large controls sized for gloves.
- Operator profile with licence, certifications, video progress and settings.

## Data

All numbers come from the two datasets in the problem statement (4 telemetry snapshots for EXC001 and 5 completed tasks), in `data.js`. Values the brief lets us assume are marked as sample data in the code: sensor readings such as hydraulic temperature and track wear, personal-best times, the boom fault, earlier shift history, proximity events, one extra job (Backfill trench), and the other operators and machines in the fleet view.

## Not built (prototype limits)

- The backend runs on SQLite by default. PostgreSQL is supported but not yet hosted online, so the public demo uses the app's built-in sample data.
- The job time model and the habits classifier are trained on sample data built from the five dataset jobs and labelled sample shifts, so their scores on those jobs are not a fair test yet.
- Motion comes from the machine remote or the Parked / Moving switch, standing in for real travel and joystick telemetry.

## Tech

Plain HTML, CSS and JavaScript. The excavator is built procedurally in [Three.js](https://threejs.org/) r128, icons are [Lucide](https://lucide.dev/), and fonts are Barlow Condensed, Roboto Condensed and Noto Sans Devanagari from Google Fonts.

| File | Purpose |
| --- | --- |
| `index.html` | Page shell: top bar, side panels, SOS |
| `styles.css` | Cat design tokens, day and night themes, all component styles |
| `app.js` | Every screen and interaction |
| `machine3d.js` | 3D excavator, camera, part highlighting |
| `data.js` | Datasets, estimation model, schedule, videos, fleet sample data |
| `serve.py` | Local dev server |

## Notes

Cat®, Caterpillar® and the Cat logo are trademarks of Caterpillar Inc. This is an independent hackathon prototype, not an official Caterpillar product. Training videos are embedded from the official Cat® Products YouTube channel.

## Backend (optional)

The app works on its own. With the backend running, these parts become real:

| Part | With the backend |
| --- | --- |
| Job time | A trained model gives the time and a range (8 in 10 jobs finish inside it). It learns from every job marked Done. |
| Your habits | A trained classifier rates each habit Normal, Worth a look or Concerning. |
| Reports | Saved in a database. With no signal they wait on the tablet and send when the connection is back. |
| Added jobs | Saved in the database. |
| Machine | The machine remote moves the machine (the screen locks), takes the belt off, or walks a worker into a zone. |
| Fleet view | The log shows the cab's reports and finished jobs. |

Run it:

```bash
cd backend
pip install -r requirements.txt
python train_models.py
uvicorn main:app --port 8000
```

Then run `python serve.py` from the main folder and open http://localhost:4173.

- API docs: http://localhost:8000/docs
- Machine remote for demos: http://localhost:8000/remote
- Database: a SQLite file by default. For PostgreSQL, install `psycopg[binary]` and set `DATABASE_URL`, for example `postgresql+psycopg://user:password@localhost:5432/cat`.
- `POST /model/retrain` retrains the job time model with every job finished in the app.

| File | What is in it |
| --- | --- |
| `live.js` | Connects the app to the backend. The hooks in `app.js` are marked `// LIVE`. |
| `backend/main.py` | FastAPI server: estimates, jobs, reports, habits, machine data |
| `backend/train_models.py` | Trains the job time model and the habits classifier |
| `backend/db.py` | Database tables |
| `backend/remote.html` | Machine remote page |

The models are trained on sample data built from the five jobs in the problem statement, so their scores on those five jobs are not a fair test. The habits classifier is trained on labelled sample shifts.

On a hosted copy (GitHub Pages) the backend is off unless the page is opened once with `?api=https://your-backend`.
