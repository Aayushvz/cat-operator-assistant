# Cat Operator Assistant

A smart operator assistant for Cat® machinery, built for the "Smart Operator Assistant for CAT machinery" hackathon challenge. It supports an excavator operator through the whole shift: tasks, safety, training, unusual machine behaviour and task time estimation, all driven by the telemetry and task data from the problem statement.

The interface is organised like an F1 race engineer: the shift is a race, each task is a stint, idle time is a pit stop, safety alerts are flags, and the seatbelt check is the start lights.

**Live demo:** https://aayushvz.github.io/cat-operator-assistant/

## Run it locally

No build step and no dependencies to install. You need Python 3.

```bash
python serve.py
```

Then open http://localhost:4173.

## What is in it

| Screen | What it does |
| --- | --- |
| **Home** | Interactive 3D model of excavator EXC001 with 6 clickable components, shift replay from 08:00 to 18:00, ghost delta (you vs your personal best), live seatbelt card, and a pit stop lesson that appears after 3 minutes of idling |
| **Tasks** | Today's shift as a strategy strip with predicted overruns and a rain window |
| **Estimator** | Predicts task time from planned time, operator skill, weather and machine age, shown as a range |
| **Safety** | Flag system with screen-edge glow, seatbelt start lights, seatbelt vs idle chart, proximity radar, working conditions, hold-to-log incidents, SOS |
| **Incidents** | Full incident log, including SOS events |
| **Training** | Licence progress (F3 / F2 / F1), lessons recommended from the operator's own data, real videos from the Cat® Products YouTube channel with an in-app player |
| **Insights** | Idle share, fuel per load cycle, sector timing, engine hours per load cycle, and anomaly cards with a suggested action |
| **Machine** | Component health and next service |
| **Profile and settings** | Operator profile, certifications, lesson progress, language (English / हिंदी), alerts, sign-in and privacy settings |

## Data

All numbers come from the two datasets in the problem statement (4 telemetry snapshots for EXC001 and 5 completed tasks), in `data.js`. Values the brief lets us assume, such as hydraulic temperature, track wear, proximity readings and personal-best times, are marked as sample data in the code.

The time estimation model is `planned x skill x weather x machine age`. On the five tasks in the dataset, the planner's estimates are off by 13.2% on average and the model's by 2.4%. The factors were tuned on those same five tasks, so they should recalibrate as new jobs finish.

## Tech

Plain HTML, CSS and JavaScript. The excavator is built procedurally in [Three.js](https://threejs.org/) r128, icons are [Lucide](https://lucide.dev/), and fonts are Barlow Condensed, Roboto Condensed and Noto Sans Devanagari from Google Fonts.

| File | Purpose |
| --- | --- |
| `index.html` | Page shell: top bar, side panels, SOS |
| `styles.css` | Cat design tokens, type scale, all component styles |
| `app.js` | Every screen and interaction |
| `machine3d.js` | 3D excavator, camera and rotation |
| `data.js` | Datasets, estimation model, videos, operator profile |
| `serve.py` | Local dev server |

## Notes

Cat®, Caterpillar® and the Cat logo are trademarks of Caterpillar Inc. This is an independent hackathon prototype, not an official Caterpillar product. Training videos are embedded from the official Cat® Products YouTube channel.
