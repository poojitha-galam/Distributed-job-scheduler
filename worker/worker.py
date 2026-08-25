"""
Worker — single-threaded polling loop.

Picks one QUEUED job at a time using concurrency-aware claiming,
simulates execution, and marks it COMPLETED (or FAILED on exception).
"""

import logging
import os
import signal
import time
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import String, DateTime, Integer, Boolean, Index, UniqueConstraint, ForeignKey, func, create_engine
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
    relationship,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("worker")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/jobscheduler",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Project(Base):
    """Mirror of backend Project model — read-only for logs."""
    __tablename__ = "projects"
    __table_args__ = {'extend_existing': True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)


class Queue(Base):
    """Mirror of backend Queue model — read-only for JOIN in claim query."""
    __tablename__ = "queues"
    __table_args__ = {'extend_existing': True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    concurrency_limit: Mapped[int] = mapped_column(Integer, default=10)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    retry_policy: Mapped[str] = mapped_column(String, default="exponential")
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    
    project = relationship("Project", lazy="joined")


class Job(Base):
    """Mirror of backend/app/models.py — kept in sync manually."""

    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint('schedule_id', 'scheduled_at', name='uq_job_schedule_time_worker'),
        Index('ix_jobs_scheduled_at_worker', 'scheduled_at'),
        Index('ix_jobs_next_run_at_worker', 'next_run_at'),
        Index('ix_jobs_status_worker', 'status'),
        Index('ix_jobs_queue_id_worker', 'queue_id'),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="QUEUED")
    claimed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    claim_token: Mapped[str | None] = mapped_column(String, nullable=True)
    attempt_count: Mapped[int] = mapped_column(default=0)
    max_attempts: Mapped[int] = mapped_column(default=3)
    retry_policy: Mapped[str] = mapped_column(String, default="exponential")
    last_error: Mapped[str | None] = mapped_column(String, nullable=True)
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    cron_expression: Mapped[str | None] = mapped_column(String, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    parent_job_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    queue_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("queues.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    queue = relationship("Queue")

class DeadLetterJob(Base):
    __tablename__ = "dead_letter_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    failure_reason: Mapped[str] = mapped_column(String, nullable=False)
    attempt_count: Mapped[int] = mapped_column(default=0)
    first_failed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_failed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

class JobExecution(Base):
    __tablename__ = "job_executions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    worker_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Job processing
# ---------------------------------------------------------------------------
POLL_INTERVAL = 2  # seconds

def compute_delay_seconds(policy: str, attempt: int) -> int:
    if policy == "fixed": return 5
    if policy == "linear": return 5 * attempt
    if policy == "exponential": return 5 * (2 ** (attempt - 1))
    return 5

def claim_next_job(db: Session, worker_id: str) -> Job | None:
    """Atomically claim the next QUEUED job using concurrency-aware query.

    Respects per-queue concurrency limits and priority ordering.
    """
    now = datetime.now(timezone.utc)

    # Subquery: count of active (CLAIMED or RUNNING) jobs per queue
    active_count_subq = (
        db.query(func.count(Job.id))
        .filter(Job.queue_id == Queue.id)
        .filter(Job.status.in_(["CLAIMED", "RUNNING"]))
        .correlate(Queue)
        .scalar_subquery()
    )

    job = (
        db.query(Job)
        .join(Queue, Job.queue_id == Queue.id)
        .filter(Job.status == "QUEUED")
        .filter((Job.scheduled_at == None) | (Job.scheduled_at <= now))
        .filter((Job.next_retry_at == None) | (Job.next_retry_at <= now))
        .filter(Queue.paused == False)
        .filter(active_count_subq < Queue.concurrency_limit)
        .order_by(Queue.priority.desc(), Job.created_at.asc())
        .with_for_update(of=Job, skip_locked=True)
        .first()
    )
    if job:
        job.status = "CLAIMED"
        job.claimed_by = worker_id
        job.claim_token = str(uuid.uuid4())
        job.attempt_count += 1
        db.commit()
        queue_name = job.queue.name if job.queue else "unknown"
        project_name = job.queue.project.name if job.queue and job.queue.project else "unknown"
        logger.info("[%s] claimed job %s from queue '%s' (project: %s)", worker_id, job.id, queue_name, project_name)
        return job
    return None


def process_job(db: Session, job: Job, worker_id: str) -> None:
    """Transition a job from CLAIMED -> RUNNING -> COMPLETED/FAILED."""
    queue_name = job.queue.name if job.queue else "unknown"
    project_name = job.queue.project.name if job.queue and job.queue.project else "unknown"

    # -- CLAIMED -> RUNNING --
    job.status = "RUNNING"
    job.started_at = datetime.now(timezone.utc)
    job.last_heartbeat = datetime.now(timezone.utc)
    
    execution = JobExecution(
        job_id=job.id,
        attempt_number=job.attempt_count,
        worker_id=worker_id,
        status="RUNNING",
        started_at=job.started_at
    )
    db.add(execution)
    
    db.commit()
    logger.info("Job %s | CLAIMED -> RUNNING (queue '%s')", job.id, queue_name)

    # Start heartbeat thread
    import threading
    done_event = threading.Event()
    def heartbeat(job_id):
        while not done_event.wait(5):
            try:
                hb_db = SessionLocal()
                hb_job = hb_db.query(Job).filter(Job.id == job_id).first()
                if hb_job and hb_job.status == "RUNNING":
                    hb_job.last_heartbeat = datetime.now(timezone.utc)
                    hb_db.commit()
                hb_db.close()
            except Exception as e:
                pass

    hb_thread = threading.Thread(target=heartbeat, args=(job.id,), daemon=True)
    hb_thread.start()

    try:
        # Configurable work duration via payload
        work_seconds = job.payload.get("work_seconds", 3)
        time.sleep(work_seconds)
        
        # Test hook for failures
        fail_times = job.payload.get("fail_times", 0)
        if fail_times >= job.attempt_count:
            raise RuntimeError(f"Simulated failure (attempt {job.attempt_count} <= {fail_times})")
            
        result = {"echo": job.payload}

        # -- RUNNING -> COMPLETED --
        job.status = "COMPLETED"
        job.completed_at = datetime.now(timezone.utc)
        job.result = result
        
        execution.status = "COMPLETED"
        execution.completed_at = job.completed_at
        
        db.commit()
        logger.info("Job %s | RUNNING -> COMPLETED (queue '%s')", job.id, queue_name)

    except Exception as exc:
        if job.attempt_count >= job.max_attempts:
            # DLQ -- mark FAILED first, then try DLQ insert separately
            job.status = "FAILED"
            job.completed_at = datetime.now(timezone.utc)
            job.error = str(exc)
            
            execution.status = "FAILED"
            execution.completed_at = job.completed_at
            execution.error = str(exc)
            
            db.commit()
            logger.error("Job %s | RUNNING -> FAILED (max attempts) | %s", job.id, exc)
            
            # Try to create DLQ entry (may fail if already exists from a previous cycle)
            try:
                dlq = DeadLetterJob(
                    job_id=job.id,
                    failure_reason=str(exc),
                    attempt_count=job.attempt_count,
                    first_failed_at=job.started_at or datetime.now(timezone.utc),
                    last_failed_at=datetime.now(timezone.utc),
                    payload_snapshot=job.payload
                )
                db.add(dlq)
                db.commit()
                logger.info("Job %s | Added to DLQ", job.id)
            except Exception as dlq_exc:
                db.rollback()
                logger.warning("Job %s | DLQ insert skipped (already exists?): %s", job.id, dlq_exc)
        else:
            # Retry
            delay = compute_delay_seconds(job.retry_policy, job.attempt_count)
            job.status = "QUEUED"
            job.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
            job.last_error = str(exc)
            job.claimed_by = None
            
            execution.status = "FAILED"
            execution.completed_at = datetime.now(timezone.utc)
            execution.error = str(exc)
            
            db.commit()
            logger.warning("Job %s | RUNNING -> QUEUED (Retry in %ds) | %s", job.id, delay, exc)
    finally:
        done_event.set()


# ---------------------------------------------------------------------------
# Main polling loop
# ---------------------------------------------------------------------------
SHUTDOWN_REQUESTED = False

def handle_shutdown(signum, frame):
    global SHUTDOWN_REQUESTED
    logger.info("Shutdown requested. Worker will exit after current job finishes.")
    SHUTDOWN_REQUESTED = True

def poll() -> None:
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    worker_id = os.getenv("WORKER_ID", f"worker-{uuid.uuid4().hex[:6]}")
    logger.info("Worker [%s] started -- polling every %ds", worker_id, POLL_INTERVAL)

    while not SHUTDOWN_REQUESTED:
        db: Session | None = None
        try:
            db = SessionLocal()
            job = claim_next_job(db, worker_id)
            if job:
                process_job(db, job, worker_id)
        except Exception as exc:
            logger.error("Polling error: %s", exc)
        finally:
            if db:
                db.close()

        if not SHUTDOWN_REQUESTED:
            time.sleep(POLL_INTERVAL)
            
    logger.info("Worker [%s] stopped cleanly.", worker_id)


if __name__ == "__main__":
    poll()
