from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Job
from ..auth import resolve_project

router = APIRouter(prefix="/workers", tags=["workers"])

@router.get("/status")
def get_workers_status(
    db: Session = Depends(get_db),
    project_id: uuid.UUID = Depends(resolve_project)
):
    running_jobs = db.query(Job).filter(
        Job.project_id == project_id,
        Job.status == "RUNNING",
        Job.claimed_by.isnot(None)
    ).all()
    
    now = datetime.now(timezone.utc)
    
    KNOWN_WORKERS = ["worker-01", "worker-02", "worker-03"]
    worker_map = {
        w: {"worker_id": w, "status": "IDLE", "current_job_id": None, "last_heartbeat": None}
        for w in KNOWN_WORKERS
    }
    
    for job in running_jobs:
        w_id = job.claimed_by
        if w_id not in worker_map:
            worker_map[w_id] = {"worker_id": w_id, "status": "IDLE", "current_job_id": None, "last_heartbeat": None}
            
        # If we already marked it offline based on another job, keep looking? 
        # Actually any single job that is recent means it is ONLINE.
        # But for simplicity, we just use the latest heartbeat we find.
        hb = job.last_heartbeat
        
        # In python datetime minus datetime with timezone returns timedelta
        # Ensure hb is timezone aware. SQLAlchemy returns timezone-aware if configured.
        status = "ONLINE"
        if hb and hb.tzinfo is None:
             hb = hb.replace(tzinfo=timezone.utc)
             
        if hb and (now - hb).total_seconds() > 15:
            status = "OFFLINE"
            
        worker_map[w_id]["status"] = status
        worker_map[w_id]["current_job_id"] = str(job.id)
        worker_map[w_id]["last_heartbeat"] = hb.isoformat() if hb else None
        
    return list(worker_map.values())
