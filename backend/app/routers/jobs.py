from typing import Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Job, Queue
from ..schemas import JobCreate, JobResponse, JobExecutionResponse, PaginatedResponse
from ..auth import resolve_project

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _resolve_queue(db: Session, queue_name: str | None, project_id: UUID) -> Queue:
    """Resolve a queue by name, defaulting to 'default'."""
    name = queue_name or "default"
    queue = db.query(Queue).filter(Queue.name == name, Queue.project_id == project_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail=f"Queue '{name}' not found in this project")
    return queue


def _job_to_response(job: Job) -> JobResponse:
    """Convert a Job ORM object to a response, populating queue_name."""
    data = {c.key: getattr(job, c.key) for c in job.__table__.columns}
    data["queue_name"] = job.queue.name if job.queue else None
    return JobResponse(**data)


@router.post("/", response_model=JobResponse, status_code=201)
def create_job(body: JobCreate, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    """Create a new job. It starts in QUEUED status."""
    queue = _resolve_queue(db, body.queue_name, project_id)
    job = Job(
        name=body.name,
        payload=body.payload,
        scheduled_at=body.scheduled_at,
        queue_id=queue.id,
        max_attempts=queue.max_attempts,
        retry_policy=queue.retry_policy,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _job_to_response(job)

@router.post("/scheduled", response_model=JobResponse, status_code=201)
def create_scheduled_job(body: JobCreate, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    """Create a new scheduled or delayed job."""
    if not body.scheduled_at:
        raise HTTPException(status_code=400, detail="scheduled_at is required for scheduled jobs")
    queue = _resolve_queue(db, body.queue_name, project_id)
    job = Job(
        name=body.name,
        payload=body.payload,
        scheduled_at=body.scheduled_at,
        queue_id=queue.id,
        max_attempts=queue.max_attempts,
        retry_policy=queue.retry_policy,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _job_to_response(job)


@router.get("/", response_model=PaginatedResponse[JobResponse])
def list_jobs(
    status: Optional[str] = Query(None, description="Filter by status"),
    queue_name: Optional[str] = Query(None, description="Filter by queue name"),
    start_date: Optional[datetime] = Query(None, description="Filter jobs created after this date"),
    end_date: Optional[datetime] = Query(None, description="Filter jobs created before this date"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    project_id: UUID = Depends(resolve_project),
    db: Session = Depends(get_db),
):
    """List all jobs, newest first. Optionally filter by status, queue, or creation date."""
    query = db.query(Job).join(Queue).filter(Queue.project_id == project_id).order_by(Job.created_at.desc())
    if status:
        query = query.filter(Job.status == status)
    if queue_name:
        query = query.filter(Queue.name == queue_name)
    if start_date:
        query = query.filter(Job.created_at >= start_date)
    if end_date:
        query = query.filter(Job.created_at <= end_date)
        
    total = query.count()
    jobs = query.offset(offset).limit(limit).all()
    
    return {
        "items": [_job_to_response(j) for j in jobs],
        "total": total
    }


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    """Get a single job by ID."""
    job = db.query(Job).join(Queue).filter(Job.id == job_id, Queue.project_id == project_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)

@router.get("/{job_id}/executions", response_model=list[JobExecutionResponse])
def get_job_executions(job_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    """Get executions for a job."""
    from ..models import JobExecution
    job = db.query(Job).join(Queue).filter(Job.id == job_id, Queue.project_id == project_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    executions = db.query(JobExecution).filter(JobExecution.job_id == job_id).order_by(JobExecution.attempt_number.asc()).all()
    return executions
