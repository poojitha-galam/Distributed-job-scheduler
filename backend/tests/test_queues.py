import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from app.models import Job, Queue
from worker.worker import claim_next_job

def test_paused_queue_blocks_claiming(db, test_queue):
    """
    Test that jobs in a paused queue cannot be claimed.
    """
    job = Job(name="job", payload={}, queue_id=test_queue.id, status="QUEUED")
    db.add(job)
    
    test_queue.paused = True
    db.commit()

    claimed = claim_next_job(db, "test_worker")
    assert claimed is None

    test_queue.paused = False
    db.commit()

    claimed_now = claim_next_job(db, "test_worker")
    assert claimed_now is not None

def test_concurrency_limit_enforcement(db, test_queue):
    """
    Test that workers cannot claim jobs exceeding the queue's concurrency limit.
    """
    # Set limit to 1
    test_queue.concurrency_limit = 1
    db.commit()

    job1 = Job(name="job1", payload={}, queue_id=test_queue.id, status="QUEUED")
    job2 = Job(name="job2", payload={}, queue_id=test_queue.id, status="QUEUED")
    db.add(job1)
    db.add(job2)
    db.commit()

    # First claim should succeed
    claimed1 = claim_next_job(db, "test_worker1")
    assert claimed1 is not None

    # Second claim should fail because concurrency limit is 1 and job1 is still CLAIMED
    claimed2 = claim_next_job(db, "test_worker2")
    assert claimed2 is None

    # Completing the first job allows the second to be claimed
    claimed1.status = "COMPLETED"
    db.commit()

    claimed3 = claim_next_job(db, "test_worker2")
    assert claimed3 is not None
