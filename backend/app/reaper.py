import time
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import or_

from app.database import SessionLocal
from app.models import Job, DeadLetterJob
from app.retry import compute_delay_seconds

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def reap_stale_jobs():
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=15)
        
        while True:
            # Atomic claim for stale running jobs
            job = (
                db.query(Job)
                .filter(Job.status == "RUNNING")
                .filter(or_(Job.last_heartbeat == None, Job.last_heartbeat < cutoff))
                .with_for_update(skip_locked=True)
                .first()
            )
            
            if not job:
                break
                
            logger.info("Reaper found stale job: %s (attempt %d/%d)", job.id, job.attempt_count, job.max_attempts)
            
            exc_msg = "Worker crashed (heartbeat timeout)"
            
            if job.attempt_count >= job.max_attempts:
                # Mark FAILED first (separate commit so DLQ failure doesn't rollback status)
                job.status = "FAILED"
                job.completed_at = datetime.now(timezone.utc)
                job.error = exc_msg
                db.commit()
                logger.error("Job %s | STALE RUNNING -> FAILED (max attempts)", job.id)
                import os, redis, json
                REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
                r = redis.from_url(REDIS_URL, decode_responses=True)
                r.publish("job_updates", json.dumps({"job_id": str(job.id), "status": "FAILED"}))
                
                # Try DLQ insert separately
                try:
                    dlq = DeadLetterJob(
                        job_id=job.id,
                        failure_reason=exc_msg,
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
                job.last_error = exc_msg
                job.claimed_by = None
                db.commit()
                import os, redis, json
                REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
                r = redis.from_url(REDIS_URL, decode_responses=True)
                r.publish("job_updates", json.dumps({"job_id": str(job.id), "status": "QUEUED"}))
                logger.warning("Job %s | STALE RUNNING -> QUEUED (Retry in %ds)", job.id, delay)

    except Exception as e:
        db.rollback()
        logger.error("Reaper error: %s", e)
    finally:
        db.close()

if __name__ == "__main__":
    logger.info("Starting reaper service...")
    while True:
        import redis, os
        REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(REDIS_URL, decode_responses=True)
        try:
            lock = r.set("lock:reaper", "1", nx=True, ex=30)
            if lock:
                reap_stale_jobs()
            else:
                logger.debug("Reaper lock held by another instance. Skipping tick.")
        except Exception as e:
            logger.error("Reaper outer error: %s", e)
        time.sleep(10)
