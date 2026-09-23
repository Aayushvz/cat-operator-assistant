"""
Database. SQLite file by default so it runs anywhere with no setup.
For PostgreSQL (as in the SRS) set DATABASE_URL, for example:
    DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/cat
"""
import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import JSON, DateTime, Float, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DEFAULT = f"sqlite:///{Path(__file__).with_name('cat.db')}"
URL = os.environ.get("DATABASE_URL", DEFAULT)
engine = create_engine(URL, connect_args={"check_same_thread": False} if URL.startswith("sqlite") else {})
Session = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Job(Base):
    """Jobs added on the cab screen (the five dataset jobs live in the app itself)."""
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    type: Mapped[str] = mapped_column(String(64))
    zone: Mapped[str] = mapped_column(String(64))
    planned_min: Mapped[float] = mapped_column(Float)
    weather: Mapped[str] = mapped_column(String(16))
    skill: Mapped[str] = mapped_column(String(16))
    machine_age: Mapped[int] = mapped_column(Integer)
    operator_id: Mapped[str] = mapped_column(String(16), default="OP1001")
    machine_id: Mapped[str] = mapped_column(String(16), default="EXC001")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class JobResult(Base):
    """A finished job: what the plan said, what we predicted, and how long it really took."""
    __tablename__ = "job_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(String(32))
    type: Mapped[str] = mapped_column(String(64))
    weather: Mapped[str] = mapped_column(String(16))
    skill: Mapped[str] = mapped_column(String(16))
    machine_age: Mapped[int] = mapped_column(Integer)
    planned_min: Mapped[float] = mapped_column(Float)
    predicted_min: Mapped[float] = mapped_column(Float)
    actual_min: Mapped[float] = mapped_column(Float)
    time_label: Mapped[str] = mapped_column(String(40), default="")
    operator_id: Mapped[str] = mapped_column(String(16), default="OP1001")
    machine_id: Mapped[str] = mapped_column(String(16), default="EXC001")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Report(Base):
    """A report from the cab (operator or machine), with the machine snapshot attached."""
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    time_label: Mapped[str] = mapped_column(String(40))
    type: Mapped[str] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(80))
    severity: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(32), default="New")
    operator: Mapped[str] = mapped_column(String(80), default="")
    machine_id: Mapped[str] = mapped_column(String(16), default="EXC001")
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MachineEvent(Base):
    """Machine data events: started or stopped moving, belt on or off, someone in a zone."""
    __tablename__ = "machine_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(String(16), default="EXC001")
    kind: Mapped[str] = mapped_column(String(32))
    value: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


def init():
    Base.metadata.create_all(engine)
