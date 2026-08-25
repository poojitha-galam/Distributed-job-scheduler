from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Job, DeadLetterJob, Queue
from ..schemas import JobResponse, DeadLetterJobResponse
from ..auth import resolve_project

router = APIRouter(prefix="/dlq", tags=["dlq"])


@router.get("/", response_model=list[DeadLetterJobResponse])
def list_dlq(project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    """List all dead letter jobs."""
    return db.query(DeadLetterJob).join(Job).join(Queue).filter(Queue.project_id == project_id).order_by(DeadLetterJob.created_at.desc()).all()


@router.post("/{dlq_id}/retry", response_model=JobResponse)
def retry_dlq_job(dlq_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    """Retry a dead letter job (moves it back to QUEUED)."""
    dlq = db.query(DeadLetterJob).join(Job).join(Queue).filter(DeadLetterJob.id == dlq_id, Queue.project_id == project_id).first()
    if not dlq:
        raise HTTPException(status_code=404, detail="DLQ job not found in this project")

    job = db.query(Job).filter(Job.id == dlq.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Original Job not found")

    # Reset job
    job.status = "QUEUED"
    job.next_retry_at = None
    job.attempt_count = 0
    job.claimed_by = None
    job.error = None
    job.last_error = None
    
    # Delete from DLQ
    db.delete(dlq)
    db.commit()
    db.refresh(job)
    
    return job
