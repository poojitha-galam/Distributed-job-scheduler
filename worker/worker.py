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
    ai_summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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
    ai_summary: Mapped[str | None] = mapped_column(String, nullable=True)
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

class JobDependency(Base):
    __tablename__ = "job_dependencies"
    __table_args__ = {'extend_existing': True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    depends_on_job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

class EventRule(Base):
    __tablename__ = "event_rules"
    __table_args__ = {'extend_existing': True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    webhook_url: Mapped[str] = mapped_column(String, nullable=False)
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

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

def claim_next_job(db: Session, worker_id: str) -> Job | None:
    """Pop the next job ID from Redis, then atomically claim it in Postgres."""
    now = datetime.now(timezone.utc)

    # For sharding, we could listen to specific queues based on worker_id.
    # For now, we fetch all active queues and listen to them in priority order.
    # Note: In a real distributed system, queue names would be cached or 
    # pushed to workers via PubSub.
    queues = db.query(Queue).filter(Queue.paused == False).order_by(Queue.priority.desc()).all()
    if not queues:
        return None
        
    redis_keys = [f"queue:{q.name}" for q in queues]
    
    # BRPOP from the highest priority queues first (timeout 2 seconds)
    popped = redis_client.brpop(redis_keys, timeout=POLL_INTERVAL)
    if not popped:
        return None
        
    queue_key, job_id_str = popped
    
    try:
        job_id = uuid.UUID(job_id_str)
    except ValueError:
        return None

    # We popped a job. Now we must claim it in Postgres.
    # We still check concurrency limit here to be safe.
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
        .filter(Job.id == job_id)
        .filter(Job.status == "QUEUED")
        .filter(active_count_subq < Queue.concurrency_limit)
        .filter(
            (Job.scheduled_at <= now) | (Job.scheduled_at.is_(None))
        )
        .filter(
            (Job.next_retry_at <= now) | (Job.next_retry_at.is_(None))
        )
        .with_for_update(of=Job, skip_locked=True)
        .first()
    )
    
    if not job:
        # Check why it failed. Only push back if it's still QUEUED (e.g. concurrency limit, schedule delay, paused queue)
        job_check = db.query(Job).filter(Job.id == job_id).first()
        if job_check and job_check.status == "QUEUED":
            redis_client.rpush(queue_key, job_id_str)
            time.sleep(0.1)
        return None

    job.status = "CLAIMED"
    job.claimed_by = worker_id
    job.claim_token = str(uuid.uuid4())
    job.attempt_count += 1
    db.commit()
    
    queue_name = job.queue.name if job.queue else "unknown"
    project_name = job.queue.project.name if job.queue and job.queue.project else "unknown"
    logger.info("[%s] claimed job %s from queue '%s' (project: %s)", worker_id, job.id, queue_name, project_name)
    return job


import json
import re

def diagnose_failure(error_trace: str) -> dict:
    """Diagnose job failure using LLM, or fallback to regex."""
    api_key = os.getenv("GROQ_API_KEY")
    fallback_used = False
    diagnosis = None
    prompt = f"Analyze the following job failure:\n{error_trace}\n\nReturn exactly a JSON object with these 4 keys: 'severity' (string: low/medium/high/critical), 'transience' (string: transient/permanent), 'root_cause' (string: brief explanation), 'suggested_fix' (string: how to fix it)."

    if api_key:
        try:
            import requests
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            data = {
                "model": "openai/gpt-oss-20b",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            }
            resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=data, timeout=10)
            resp.raise_for_status()
            
            # The model responds with JSON
            result_text = resp.json()["choices"][0]["message"]["content"]
            parsed = json.loads(result_text)
            
            diagnosis = {
                "severity": parsed.get("severity", "medium"),
                "transience": parsed.get("transience", "permanent"),
                "root_cause": parsed.get("root_cause", "Unknown"),
                "suggested_fix": parsed.get("suggested_fix", "None provided.")
            }
        except Exception as e:
            logger.error("LLM diagnosis failed, using fallback: %s", e)
            fallback_used = True
    else:
        logger.warning("GROQ_API_KEY missing, using fallback diagnosis.")
        fallback_used = True

    if fallback_used or not diagnosis:
        # Regex Fallback
        diagnosis = {
            "severity": "medium",
            "transience": "permanent",
            "root_cause": "Unknown error",
            "suggested_fix": "Inspect the error trace manually."
        }
        if re.search(r'Timeout|ConnectionError|ConnectionRefused', error_trace, re.I):
            diagnosis.update({"severity": "high", "transience": "transient", "root_cause": "Network or service timeout", "suggested_fix": "Retry the job or check network connectivity."})
        elif re.search(r'IntegrityError|KeyError|ValueError', error_trace, re.I):
            diagnosis.update({"severity": "high", "transience": "permanent", "root_cause": "Data constraint or validation error", "suggested_fix": "Fix the job payload or check database constraints."})
        elif re.search(r'SyntaxError|ModuleNotFoundError', error_trace, re.I):
            diagnosis.update({"severity": "critical", "transience": "permanent", "root_cause": "Code issue (Syntax or missing dependency)", "suggested_fix": "Fix the worker code and redeploy."})
        
        diagnosis["fallback_used"] = True

    return diagnosis

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
    redis_client.publish("job_updates", json.dumps({"job_id": str(job.id), "status": "RUNNING"}))

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
        
        # Check for dependent jobs
        deps = db.query(JobDependency).filter(JobDependency.depends_on_job_id == job.id).all()
        for dep in deps:
            dep_job = db.query(Job).filter(Job.id == dep.job_id).first()
            if dep_job and dep_job.status == "PENDING_DEPENDENCY":
                # Check if all dependencies are met
                other_deps = db.query(JobDependency).filter(JobDependency.job_id == dep_job.id).all()
                all_met = True
                for od in other_deps:
                    od_job = db.query(Job).filter(Job.id == od.depends_on_job_id).first()
                    if not od_job or od_job.status != "COMPLETED":
                        all_met = False
                        break
                
                if all_met:
                    dep_job.status = "QUEUED"
                    redis_client.lpush(f"queue:{dep_job.queue.name if dep_job.queue else 'default'}", str(dep_job.id))
                    logger.info("Job %s | Dependency met, pushing to Redis", dep_job.id)
                    redis_client.publish("job_updates", json.dumps({"job_id": str(dep_job.id), "status": "QUEUED"}))
        
        db.commit()
        logger.info("Job %s | RUNNING -> COMPLETED (queue '%s')", job.id, queue_name)
        redis_client.publish("job_updates", json.dumps({"job_id": str(job.id), "status": "COMPLETED"}))

        # Check for EventRules
        if job.queue and job.queue.project_id:
            rules = db.query(EventRule).filter(EventRule.project_id == job.queue.project_id, EventRule.event_type == "JOB_COMPLETED").all()
            if rules:
                import requests
                for rule in rules:
                    try:
                        requests.post(rule.webhook_url, json={"job_id": str(job.id), "status": "COMPLETED", "result": result}, timeout=2)
                    except:
                        pass

    except Exception as exc:
        if job.attempt_count >= job.max_attempts:
            # DLQ -- mark FAILED first, then try DLQ insert separately
            job.status = "FAILED"
            job.completed_at = datetime.now(timezone.utc)
            job.error = str(exc)
            job.ai_summary = diagnose_failure(str(exc))
            
            execution.status = "FAILED"
            execution.completed_at = job.completed_at
            execution.error = str(exc)
            
            db.commit()
            logger.error("Job %s | RUNNING -> FAILED (max attempts) | %s", job.id, exc)
            redis_client.publish("job_updates", json.dumps({"job_id": str(job.id), "status": "FAILED"}))
            
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
                
            # Check for EventRules
            if job.queue and job.queue.project_id:
                rules = db.query(EventRule).filter(EventRule.project_id == job.queue.project_id, EventRule.event_type == "JOB_FAILED").all()
                if rules:
                    import requests
                    for rule in rules:
                        try:
                            requests.post(rule.webhook_url, json={"job_id": str(job.id), "status": "FAILED", "error": str(exc)}, timeout=2)
                        except:
                            pass
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
            redis_client.publish("job_updates", json.dumps({"job_id": str(job.id), "status": "QUEUED"}))
            
            # For a real delayed retry queue, we'd use a sorted set or send it back to the scheduler.
            # To keep it simple, we push it to Redis, but it will be picked up immediately.
            # Since the `claim_next_job` filters `next_retry_at <= now`, the worker will fail to claim it
            # and push it back, essentially busy-waiting it. 
            # Better approach: We don't push it to Redis here. The `scheduler.py` can be modified to 
            # poll for Jobs where `status == QUEUED` and `next_retry_at <= now` and push them to Redis!
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
