import sys
import os
import time
from datetime import datetime, timezone, timedelta

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from app.models import Job, ScheduledJob
from app.scheduler import process_due_schedules
from worker.worker import claim_next_job

def test_delayed_job_not_claimable(db, test_queue):
    """
    Test that a delayed job is not claimable before its scheduled_at time.
    """
    future_time = datetime.now(timezone.utc) + timedelta(seconds=10)
    job = Job(
        name="delayed_job",
        payload={},
        queue_id=test_queue.id,
        status="QUEUED",
        scheduled_at=future_time
    )
    db.add(job)
    db.commit()

    # Try to claim
    claimed = claim_next_job(db, "test_worker")
    assert claimed is None

    # Fast forward the job to the past to verify it becomes claimable
    job.scheduled_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    claimed_now = claim_next_job(db, "test_worker")
    assert claimed_now is not None
    assert claimed_now.id == job.id

def test_recurring_schedule_produces_executions(db, test_queue):
    """
    Test that a recurring schedule produces a job and calculates next_run_at.
    """
    now = datetime.now(timezone.utc)
    schedule = ScheduledJob(
        name="cron_job",
        payload={},
        cron_expression="* * * * *", # every minute
        enabled=True,
        next_run_at=now - timedelta(seconds=1), # due now
        queue_id=test_queue.id
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    process_due_schedules()

    db.refresh(schedule)
    assert schedule.last_run_at is not None
    assert schedule.next_run_at > now

    # Verify job was created
    jobs = db.query(Job).filter(Job.schedule_id == schedule.id).all()
    assert len(jobs) == 1
    assert jobs[0].status == "QUEUED"
    assert jobs[0].is_recurring is True
