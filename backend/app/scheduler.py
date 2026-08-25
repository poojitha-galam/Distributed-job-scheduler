import time
import logging
from datetime import datetime, timezone
import croniter
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import ScheduledJob, Job

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def process_due_schedules():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        
        while True:
            # Atomic claim for due schedules
            schedule = (
                db.query(ScheduledJob)
                .filter(ScheduledJob.enabled == True)
                .filter(ScheduledJob.next_run_at <= now)
                .order_by(ScheduledJob.next_run_at.asc())
                .with_for_update(skip_locked=True)
                .first()
            )
            
            if not schedule:
                break
                
            logger.info("[scheduler] schedule %s is due (was scheduled for %s)", schedule.id, schedule.next_run_at)
            
            # 1. Create Job execution
            job = Job(
                name=schedule.name,
                payload=schedule.payload,
                status="QUEUED",
                scheduled_at=schedule.next_run_at,
                is_recurring=True,
                cron_expression=schedule.cron_expression,
                schedule_id=schedule.id,
                queue_id=schedule.queue_id
            )
            
            db.add(job)
            
            # 2. Calculate next cron occurrence
            cron = croniter.croniter(schedule.cron_expression, now)
            next_run = cron.get_next(datetime)
            
            # 3. Update ScheduledJob
            schedule.last_run_at = now
            schedule.next_run_at = next_run
            
            # 4. Commit atomically
            try:
                db.commit()
                logger.info("[scheduler] created job %s", job.id)
                logger.info("[scheduler] next run for schedule %s = %s", schedule.id, next_run)
                
                # Push to Redis
                import redis
                import os
                REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
                r = redis.from_url(REDIS_URL, decode_responses=True)
                queue_name = schedule.queue.name if schedule.queue else "default"
                r.lpush(f"queue:{queue_name}", str(job.id))
            except IntegrityError:
                # Unique constraint violation: duplicate execution already created!
                db.rollback()
                logger.warning("[scheduler] duplicate execution prevented for schedule %s at %s", schedule.id, job.scheduled_at)
                
                # Fast forward the schedule's next_run_at so it doesn't get stuck
                schedule_retry = db.query(ScheduledJob).filter(ScheduledJob.id == schedule.id).with_for_update().first()
                if schedule_retry and schedule_retry.next_run_at <= now:
                    cron_retry = croniter.croniter(schedule_retry.cron_expression, now)
                    schedule_retry.next_run_at = cron_retry.get_next(datetime)
                    db.commit()

    except Exception as e:
        db.rollback()
        logger.error("[scheduler] error: %s", e)
    finally:
        db.close()

def process_delayed_jobs():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        import redis
        import os
        REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(REDIS_URL, decode_responses=True)
        
        while True:
            job = (
                db.query(Job)
                .filter(Job.status == "QUEUED")
                .filter(
                    (Job.claimed_by != "redis") | (Job.claimed_by == None)
                )
                .filter(
                    (Job.scheduled_at <= now) | (Job.next_retry_at <= now)
                )
                .with_for_update(skip_locked=True)
                .first()
            )
            
            if not job:
                break
                
            job.claimed_by = "redis"
            queue_name = job.queue.name if job.queue else "default"
            db.commit()
            r.lpush(f"queue:{queue_name}", str(job.id))
            logger.info("[scheduler] Pushed delayed/retry job %s to Redis", job.id)
    except Exception as e:
        db.rollback()
        logger.error("[scheduler] error in delayed jobs: %s", e)
    finally:
        db.close()

if __name__ == "__main__":
    logger.info("Starting scheduler service...")
    while True:
        import redis
        import os
        REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(REDIS_URL, decode_responses=True)
        
        try:
            # Try to acquire lock, expiring in 5 seconds
            lock = r.set("lock:scheduler", "1", nx=True, ex=5)
            if lock:
                logger.info("Scheduler lock acquired, processing...")
                process_due_schedules()
                logger.info("Finished due schedules, starting delayed jobs...")
                process_delayed_jobs()
                logger.info("Finished delayed jobs, tick complete.")
            else:
                pass
        except Exception as e:
            logger.error("Scheduler outer error: %s", e)
        time.sleep(1)
