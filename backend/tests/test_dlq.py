import sys
import os
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from app.models import Job, DeadLetterJob
from worker.worker import process_job

def test_job_exhausts_attempts_lands_in_dlq(db, test_queue):
    """
    Test that a job failing max_attempts times is routed to the dead letter queue.
    """
    job = Job(
        name="fail_job",
        payload={"work_seconds": 0, "fail_times": 5},
        queue_id=test_queue.id,
        status="CLAIMED",
        attempt_count=3,
        max_attempts=3,
        claimed_by="test_worker"
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Process job (simulates RUNNING -> FAILED)
    process_job(db, job, "test_worker")

    # Refresh from db
    db.refresh(job)
    assert job.status == "FAILED"
    
    # Check DLQ
    dlq = db.query(DeadLetterJob).filter(DeadLetterJob.job_id == job.id).first()
    assert dlq is not None
    assert dlq.failure_reason.startswith("Simulated failure")
    assert dlq.attempt_count == 3
