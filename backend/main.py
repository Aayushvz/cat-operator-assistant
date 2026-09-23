"""
Cat Operator Assistant backend.

    pip install -r requirements.txt
    python train_models.py            (once)
    uvicorn main:app --port 8000      API docs: http://localhost:8000/docs
                                      Machine remote for demos: http://localhost:8000/remote
"""
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import delete, select

import db
import train_models as tm

HERE = Path(__file__).parent
db.init()
if not tm.MODEL_FILE.exists():
    tm.train()
M = joblib.load(tm.MODEL_FILE)
lock = threading.Lock()

app = FastAPI(title="Cat Operator Assistant API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

AGES = list(range(0, 16))
PLANNED = list(range(10, 250, 10))   # 10 ... 240 min; the app interpolates between points
REF = {"weather": "Sunny", "skill": "Intermediate", "machine_age": 3}


def now_label():
    return datetime.now().strftime("Today %H:%M")


# ---------------------------------------------------------------- operator pace (learned)
def operator_factor(operator_id="OP1001"):
    """How this operator's real times compare with our predictions, learned from finished jobs."""
    with db.Session() as s:
        rows = s.scalars(select(db.JobResult).where(db.JobResult.operator_id == operator_id)
                         .order_by(db.JobResult.id)).all()
    f = 1.0
    for r in rows:
        ratio = min(2.0, max(0.5, r.actual_min / max(r.predicted_min, 1)))
        f = 0.7 * f + 0.3 * ratio
    return round(min(1.4, max(0.7, f)), 3), len(rows)


# ---------------------------------------------------------------- job time
def ratios(frame: pd.DataFrame):
    return {k: M[k].predict(frame[tm.FEATURES]) for k in ("mean", "lo", "hi")}


@app.get("/health")
def health():
    f, n = operator_factor()
    return {"ok": True, "database": db.engine.dialect.name, "trained_on": M["trained_on"],
            "operator_factor": f, "finished_jobs": n}


@app.get("/model/grid")
def model_grid():
    """Every combination the app can ask for, so estimates on the cab screen stay instant."""
    combos = [(w, s, a, p) for s in tm.SKILLS for w in tm.WEATHERS for a in AGES for p in PLANNED]
    frame = pd.DataFrame(combos, columns=tm.FEATURES)
    r = ratios(frame)
    shape = (len(tm.SKILLS), len(tm.WEATHERS), len(AGES), len(PLANNED))
    f, n = operator_factor()
    real = tm.REAL_JOBS
    pred = M["mean"].predict(real[tm.FEATURES]) * real["planned_min"]
    return {
        "skills": tm.SKILLS, "weathers": tm.WEATHERS, "ages": AGES, "planned": PLANNED,
        "ref": REF, "operator_factor": f, "finished_jobs": n, "trained_on": M["trained_on"],
        "error_on_dataset": round(float(np.mean(np.abs(pred - real["actual_min"]) / real["actual_min"])), 4),
        **{k: np.round(v, 4).reshape(shape).tolist() for k, v in r.items()},
    }


class EstimateIn(BaseModel):
    weather: str
    skill: str
    machine_age: int
    planned_min: float


@app.post("/estimate")
def estimate(e: EstimateIn):
    frame = pd.DataFrame([e.model_dump()])
    r = {k: float(v[0]) for k, v in ratios(frame).items()}
    f, _ = operator_factor()
    base = e.planned_min * f
    out = {"minutes": round(base * r["mean"], 1),
           "range": [round(base * min(r["lo"], r["mean"])), round(base * max(r["hi"], r["mean"]))],
           "operator_factor": f, "explanation": []}
    for k, ref in REF.items():
        if getattr(e, k) != ref:
            alt = pd.DataFrame([{**e.model_dump(), k: ref}])
            out["explanation"].append({"factor": k, "minutes": round(base * (r["mean"] - float(M["mean"].predict(alt)[0])), 1)})
    return out


# ---------------------------------------------------------------- jobs
class JobIn(BaseModel):
    id: str
    type: str
    zone: str
    planned_min: float
    weather: str
    skill: str
    machine_age: int


@app.get("/jobs")
def list_jobs():
    with db.Session() as s:
        return [{"id": j.id, "type": j.type, "zone": j.zone, "planned_min": j.planned_min, "weather": j.weather,
                 "skill": j.skill, "machine_age": j.machine_age} for j in s.scalars(select(db.Job)).all()]


@app.post("/jobs")
def add_job(j: JobIn):
    with db.Session() as s:
        s.merge(db.Job(**j.model_dump()))
        s.commit()
    return {"ok": True}


@app.delete("/jobs/{job_id}")
def remove_job(job_id: str):
    with db.Session() as s:
        s.execute(delete(db.Job).where(db.Job.id == job_id))
        s.commit()
    return {"ok": True}


class DoneIn(BaseModel):
    type: str
    weather: str
    skill: str
    machine_age: int
    planned_min: float
    predicted_min: float
    actual_min: float
    time_label: str = ""


@app.post("/jobs/{job_id}/done")
def job_done(job_id: str, d: DoneIn):
    with db.Session() as s:
        s.execute(delete(db.JobResult).where(db.JobResult.job_id == job_id))   # one result per job
        s.add(db.JobResult(job_id=job_id, **d.model_dump()))
        s.commit()
    f, n = operator_factor()
    return {"operator_factor": f, "finished_jobs": n}


@app.delete("/jobs/{job_id}/done")
def job_undo(job_id: str):
    with db.Session() as s:
        s.execute(delete(db.JobResult).where(db.JobResult.job_id == job_id))
        s.commit()
    f, n = operator_factor()
    return {"operator_factor": f, "finished_jobs": n}


@app.get("/results")
def results():
    with db.Session() as s:
        rows = s.scalars(select(db.JobResult).order_by(db.JobResult.id.desc())).all()
    return [{"job_id": r.job_id, "type": r.type, "planned_min": r.planned_min, "predicted_min": r.predicted_min,
             "actual_min": r.actual_min, "operator_id": r.operator_id, "machine_id": r.machine_id,
             "time_label": r.time_label, "at": r.created_at.isoformat(timespec="minutes")} for r in rows]


@app.post("/model/retrain")
def retrain():
    """Retrain the job-time model with every job finished in the app."""
    global M
    with db.Session() as s:
        rows = s.scalars(select(db.JobResult)).all()
    res = pd.DataFrame([{"type": r.type, "weather": r.weather, "skill": r.skill, "machine_age": r.machine_age,
                         "planned_min": r.planned_min, "actual_min": r.actual_min} for r in rows])
    with lock:
        M = tm.train(res if len(res) else None)
    return {"ok": True, "trained_on": M["trained_on"]}


# ---------------------------------------------------------------- reports
class ReportIn(BaseModel):
    id: str
    time_label: str
    type: str
    source: str
    severity: str
    status: str = "New"
    operator: str = ""
    machine_id: str = "EXC001"
    snapshot: dict = {}


@app.get("/reports")
def list_reports():
    with db.Session() as s:
        rows = s.scalars(select(db.Report).order_by(db.Report.created_at.desc())).all()
    return [{"id": r.id, "time_label": r.time_label, "type": r.type, "source": r.source, "severity": r.severity,
             "status": r.status, "operator": r.operator, "machine_id": r.machine_id, "snapshot": r.snapshot,
             "at": r.created_at.isoformat(timespec="minutes")} for r in rows]


@app.post("/reports")
def save_reports(items: list[ReportIn]):
    """Takes one report or a whole queue saved while there was no signal."""
    with db.Session() as s:
        for r in items:
            s.merge(db.Report(**r.model_dump()))
        s.commit()
    return {"saved": len(items)}


# ---------------------------------------------------------------- habits
class Metric(BaseModel):
    name: str
    values: list[float]
    higher_is_worse: bool = True


@app.post("/habits")
def habits(metrics: list[Metric]):
    out = []
    for m in metrics:
        x = tm.habit_features(tm.habit_kind(m.name), m.values, m.higher_is_worse)
        p = M["habits"].predict_proba([x])[0]
        k = int(np.argmax(p))
        out.append({"name": m.name, "level": tm.LABELS[k], "confidence": round(float(p[k]), 2)})
    return out


# ---------------------------------------------------------------- machine data (simulated telemetry)
MACHINE = {"id": "EXC001", "moving": False, "belt": True, "engine_hours": 1527.0, "fuel_l": 17.0,
           "nearest_m": None, "since": time.time()}
EVENTS: list[dict] = []


def event(kind, value):
    with db.Session() as s:
        e = db.MachineEvent(kind=kind, value=str(value))
        s.add(e)
        s.commit()
        EVENTS.append({"id": e.id, "kind": kind, "value": value, "at": now_label()})
    del EVENTS[:-100]


def tick():
    """Engine hours and fuel go up while the machine moves."""
    t = time.time()
    if MACHINE["moving"]:
        h = (t - MACHINE["since"]) / 3600
        MACHINE["engine_hours"] = round(MACHINE["engine_hours"] + h, 3)
        MACHINE["fuel_l"] = round(MACHINE["fuel_l"] + h * 14, 2)
    MACHINE["since"] = t


@app.get("/telemetry")
def telemetry(since: int = 0):
    tick()
    return {"machine": MACHINE, "events": [e for e in EVENTS if e["id"] > since]}


@app.post("/sim/drive")
def sim_drive(on: bool):
    tick()
    MACHINE["moving"] = on
    event("moving", on)
    if on and not MACHINE["belt"]:
        event("belt_off_moving", True)
    return MACHINE


@app.post("/sim/belt")
def sim_belt(on: bool):
    MACHINE["belt"] = on
    event("belt", on)
    if MACHINE["moving"] and not on:
        event("belt_off_moving", True)
    return MACHINE


@app.post("/sim/person")
def sim_person(distance: float = 5.8):
    MACHINE["nearest_m"] = distance
    event("person", distance)
    return MACHINE


@app.get("/remote", response_class=HTMLResponse)
def remote():
    return (HERE / "remote.html").read_text(encoding="utf-8")
