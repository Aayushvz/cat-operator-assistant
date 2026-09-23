"""
Trains the two models and saves them to models.joblib.

1. Job time: predicts actual time / planned time from weather, operator level, machine age and
   planned minutes. Three gradient-boosted models give the likely time and a 10th to 90th
   percentile range. Training data = sample jobs built from the five real jobs in the problem
   statement, plus every job finished in the app (job_results table), which count 10 times.
2. Habits: classifies a metric's last 5 shifts as Normal / Worth a look / Concerning against the
   operator's own usual. Trained on labelled sample shift histories.

Run:  python train_models.py      (the server also retrains through POST /model/retrain)
"""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

HERE = Path(__file__).parent
MODEL_FILE = HERE / "models.joblib"

FEATURES = ["weather", "skill", "machine_age", "planned_min"]
WEATHERS = ["Sunny", "Cloudy", "Windy", "Rainy"]
SKILLS = ["Beginner", "Intermediate", "Expert"]

# The five jobs from the problem statement: type, weather, level, machine age, planned, actual
REAL_JOBS = pd.DataFrame([
    ("Earth Excavation", "Sunny", "Expert", 2, 60, 58),
    ("Trenching", "Rainy", "Intermediate", 4, 45, 52),
    ("Material Loading", "Cloudy", "Beginner", 3, 30, 42),
    ("Grading", "Sunny", "Expert", 5, 35, 33),
    ("Demolition", "Windy", "Intermediate", 6, 90, 105),
], columns=["type", "weather", "skill", "machine_age", "planned_min", "actual_min"])

# Effects read off the five real jobs, used only to build sample training jobs around them
W_FX = {"Sunny": 1.00, "Cloudy": 1.05, "Rainy": 1.12, "Windy": 1.10}
S_FX = {"Expert": 0.93, "Intermediate": 1.05, "Beginner": 1.32}
TYPES = {"Earth Excavation": 60, "Trenching": 45, "Material Loading": 30, "Grading": 35,
         "Demolition": 90, "Backfill trench": 25}


def sample_jobs(rng, n=2500):
    rows = []
    for _ in range(n):
        t = rng.choice(list(TYPES))
        w = rng.choice(WEATHERS, p=[0.45, 0.25, 0.15, 0.15])
        s = rng.choice(SKILLS, p=[0.2, 0.45, 0.35])
        age = int(rng.integers(0, 13))
        planned = int(round(TYPES[t] * rng.uniform(0.5, 1.8)))
        r = W_FX[w] * S_FX[s] * (1 + 0.015 * (age - 3))
        if w in ("Rainy", "Windy") and t in ("Trenching", "Demolition", "Backfill trench"):
            r *= 1.03   # bad weather hurts digging near edges and demolition more
        rows.append((t, w, s, age, planned, planned * r * rng.lognormal(0, 0.07)))
    return pd.DataFrame(rows, columns=REAL_JOBS.columns)


def time_model(**kw):
    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), ["weather", "skill"])],
                            remainder="passthrough")
    return Pipeline([("pre", pre), ("m", GradientBoostingRegressor(
        n_estimators=250, max_depth=3, learning_rate=0.05, random_state=0, **kw))])


# ---------------------------------------------------------------- habits
HABIT_KINDS = ["waiting", "fuel", "belt", "pace"]
LABELS = ["Normal", "Worth a look", "Concerning"]


def habit_kind(name: str) -> str:
    n = name.lower()
    if "belt" in n:
        return "belt"
    if "fuel" in n:
        return "fuel"
    if "wait" in n or "idle" in n:
        return "waiting"
    return "pace"


def habit_features(kind: str, values, higher_is_worse=True):
    v = np.asarray(values, dtype=float)
    base = v[:-1].mean() if len(v) > 1 else v[0]
    now = v[-1]
    sign = 1 if higher_is_worse else -1
    rel = sign * (now - base) / max(abs(base), 0.05)
    absd = sign * (now - base)
    slope = sign * np.polyfit(np.arange(len(v)), v, 1)[0] / max(abs(base), 0.05)
    spread = v[:-1].std() / max(abs(base), 0.05) if len(v) > 2 else 0.0
    onehot = [1.0 if kind == k else 0.0 for k in HABIT_KINDS]
    return onehot + [rel, absd, slope, spread]


def habit_samples(rng, n=4000):
    X, y = [], []
    for _ in range(n):
        kind = rng.choice(HABIT_KINDS)
        if kind == "belt":
            base = rng.choice([0, 0, 0.3, 0.5, 1])
            hist = np.clip(rng.poisson(base, 4), 0, 4).astype(float)
            now = float(np.clip(rng.poisson(rng.choice([base, base + 1, base + 2])), 0, 5))
            change = now - hist.mean()
            # any rise in belt-off events matters for safety
            label = 2 if change >= 1.5 or now >= 2 else 1 if change >= 0.5 or now >= 1 else 0
        else:
            base = {"waiting": rng.uniform(15, 35), "fuel": rng.uniform(0.4, 0.7), "pace": rng.uniform(18, 26)}[kind]
            hist = base * (1 + rng.normal(0, 0.05, 4))
            now = base * (1 + rng.choice([rng.normal(0, 0.06), rng.uniform(0.15, 0.4), rng.uniform(0.4, 0.8)]))
            change = (now - hist.mean()) / hist.mean()
            hi, mid = (0.35, 0.12) if kind == "waiting" else (0.4, 0.15)
            label = 2 if change > hi else 1 if change > mid else 0
        if rng.random() < 0.04:   # label noise: real labels are never perfect
            label = int(rng.integers(0, 3))
        X.append(habit_features(kind, list(hist) + [now]))
        y.append(label)
    return np.array(X), np.array(y)


def train(results: pd.DataFrame | None = None, seed=42):
    rng = np.random.default_rng(seed)
    parts = [sample_jobs(rng), *[REAL_JOBS] * 20]
    n_results = 0
    if results is not None and len(results):
        n_results = len(results)
        parts += [results[REAL_JOBS.columns]] * 10
    df = pd.concat(parts, ignore_index=True)
    X, y = df[FEATURES], df["actual_min"] / df["planned_min"]
    m = {
        "mean": time_model().fit(X, y),
        "lo": time_model(loss="quantile", alpha=0.1).fit(X, y),
        "hi": time_model(loss="quantile", alpha=0.9).fit(X, y),
    }
    hx, hy = habit_samples(rng)
    m["habits"] = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=0).fit(hx, hy)
    m["trained_on"] = {"sample_jobs": 2500, "real_jobs": 5, "finished_in_app": n_results}
    joblib.dump(m, MODEL_FILE)
    return m


if __name__ == "__main__":
    m = train()
    print("Job time check on the five real jobs (fitted on them too):")
    pred = m["mean"].predict(REAL_JOBS[FEATURES]) * REAL_JOBS["planned_min"]
    for (_, r), p in zip(REAL_JOBS.iterrows(), pred):
        print(f"  {r.type:17s} planned {r.planned_min:3d}  actual {r.actual_min:5.1f}  model {p:5.1f}")
    print("\nHabits check on the app's sample shifts:")
    for name, vals in [("Time spent waiting", [24, 26, 27, 31, 39]), ("Fuel per load", [0.52, 0.55, 0.54, 0.61, 0.72]),
                       ("Belt off after a wait", [0, 1, 0, 1, 2]), ("Time per load", [22, 21, 21, 22, 21])]:
        k = habit_kind(name)
        print(f"  {name:22s} -> {LABELS[m['habits'].predict([habit_features(k, vals)])[0]]}")
