from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import croniter
from datetime import datetime, timezone

from ..database import get_db
from ..models import ScheduledJob, Queue
from ..schemas import ScheduledJobCreate, ScheduledJobResponse, PaginatedResponse
from ..auth import resolve_project, resolve_project_member

router = APIRouter(prefix="/schedules", tags=["schedules"])

@router.post("/", response_model=ScheduledJobResponse, status_code=201)
def create_schedule(body: ScheduledJobCreate, project_id: UUID = Depends(resolve_project_member), db: Session = Depends(get_db)):
    if not croniter.croniter.is_valid(body.cron_expression):
        raise HTTPException(status_code=400, detail="Invalid cron expression")
    
    # Resolve queue
    queue_name = body.queue_name or "default"
    queue = db.query(Queue).filter(Queue.name == queue_name, Queue.project_id == project_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail=f"Queue '{queue_name}' not found in this project")
        
    now = datetime.now(timezone.utc)
    cron = croniter.croniter(body.cron_expression, now)
    next_run = cron.get_next(datetime)
    
    schedule = ScheduledJob(
        name=body.name,
        payload=body.payload,
        cron_expression=body.cron_expression,
        next_run_at=next_run,
        queue_id=queue.id
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule

@router.get("/", response_model=PaginatedResponse[ScheduledJobResponse])
def list_schedules(
    enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    project_id: UUID = Depends(resolve_project),
    db: Session = Depends(get_db),
):
    query = db.query(ScheduledJob).join(Queue).filter(Queue.project_id == project_id).order_by(ScheduledJob.created_at.desc())
    if enabled is not None:
        query = query.filter(ScheduledJob.enabled == enabled)
        
    total = query.count()
    schedules = query.offset(offset).limit(limit).all()
    
    return {
        "items": schedules,
        "total": total
    }

@router.get("/{schedule_id}", response_model=ScheduledJobResponse)
def get_schedule(schedule_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    schedule = db.query(ScheduledJob).join(Queue).filter(ScheduledJob.id == schedule_id, Queue.project_id == project_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule

@router.post("/{schedule_id}/pause", response_model=ScheduledJobResponse)
def pause_schedule(schedule_id: UUID, project_id: UUID = Depends(resolve_project_member), db: Session = Depends(get_db)):
    schedule = db.query(ScheduledJob).join(Queue).filter(ScheduledJob.id == schedule_id, Queue.project_id == project_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    schedule.enabled = False
    db.commit()
    db.refresh(schedule)
    return schedule

@router.post("/{schedule_id}/resume", response_model=ScheduledJobResponse)
def resume_schedule(schedule_id: UUID, project_id: UUID = Depends(resolve_project_member), db: Session = Depends(get_db)):
    schedule = db.query(ScheduledJob).join(Queue).filter(ScheduledJob.id == schedule_id, Queue.project_id == project_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    now = datetime.now(timezone.utc)
    cron = croniter.croniter(schedule.cron_expression, now)
    schedule.next_run_at = cron.get_next(datetime)
    schedule.enabled = True
    db.commit()
    db.refresh(schedule)
    return schedule

@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: UUID, project_id: UUID = Depends(resolve_project_member), db: Session = Depends(get_db)):
    schedule = db.query(ScheduledJob).join(Queue).filter(ScheduledJob.id == schedule_id, Queue.project_id == project_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    db.delete(schedule)
    db.commit()
