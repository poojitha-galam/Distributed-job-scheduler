import threading
import uuid
import sys
import os

# Add root to sys path to import worker
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from app.models import Job
from worker.worker import claim_next_job

def test_atomic_claim_prevents_duplicates(db, test_queue):
    """
    Test that concurrent workers attempting to claim jobs do not duplicate claims.
    """
    # Create 5 jobs
    for i in range(5):
        job = Job(name=f"job_{i}", payload={}, queue_id=test_queue.id, status="QUEUED")
        db.add(job)
    db.commit()

    claimed_jobs = []
    lock = threading.Lock()

    def worker_thread(worker_id):
        # We need a separate session per thread to simulate concurrent connections
        from app.database import SessionLocal
        thread_db = SessionLocal()
        try:
            job = claim_next_job(thread_db, worker_id)
            if job:
                with lock:
                    claimed_jobs.append(job.id)
        finally:
            thread_db.close()

    # Launch 10 threads trying to claim the 5 jobs concurrently
    threads = []
    for i in range(10):
        t = threading.Thread(target=worker_thread, args=(f"worker_{i}",))
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    # Assert exactly 5 jobs were claimed
    assert len(claimed_jobs) == 5
    # Assert all 5 claimed jobs are unique
    assert len(set(claimed_jobs)) == 5
