from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Job, Queue
from ..schemas import JobCreate, JobResponse
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


@router.get("/", response_model=list[JobResponse])
def list_jobs(
    status: Optional[str] = Query(None, description="Filter by status"),
    queue_name: Optional[str] = Query(None, description="Filter by queue name"),
    project_id: UUID = Depends(resolve_project),
    db: Session = Depends(get_db),
):
    """List all jobs, newest first. Optionally filter by status or queue."""
    query = db.query(Job).join(Queue).filter(Queue.project_id == project_id).order_by(Job.created_at.desc())
    if status:
        query = query.filter(Job.status == status)
    if queue_name:
        query = query.filter(Queue.name == queue_name)
    jobs = query.all()
    return [_job_to_response(j) for j in jobs]


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    """Get a single job by ID."""
    job = db.query(Job).join(Queue).filter(Job.id == job_id, Queue.project_id == project_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)
