from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Queue, Job
from ..schemas import QueueCreate, QueueUpdate, QueueResponse, QueueStatsResponse, PaginatedResponse
from ..auth import resolve_project

router = APIRouter(prefix="/queues", tags=["queues"])


def _get_queue_stats(db: Session, queue_id: UUID) -> QueueStatsResponse:
    """Get live job counts per status for a queue."""
    rows = (
        db.query(Job.status, func.count(Job.id))
        .filter(Job.queue_id == queue_id)
        .group_by(Job.status)
        .all()
    )
    stats = QueueStatsResponse()
    for status, count in rows:
        key = status.lower()
        if hasattr(stats, key):
            setattr(stats, key, count)
    return stats


def _queue_to_response(db: Session, queue: Queue) -> QueueResponse:
    """Convert a Queue ORM object to a response with live stats."""
    stats = _get_queue_stats(db, queue.id)
    return QueueResponse(
        id=queue.id,
        name=queue.name,
        priority=queue.priority,
        concurrency_limit=queue.concurrency_limit,
        paused=queue.paused,
        retry_policy=queue.retry_policy,
        max_attempts=queue.max_attempts,
        stats=stats,
        created_at=queue.created_at,
        updated_at=queue.updated_at,
    )


@router.post("/", response_model=QueueResponse, status_code=201)
def create_queue(body: QueueCreate, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    existing = db.query(Queue).filter(Queue.name == body.name, Queue.project_id == project_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Queue '{body.name}' already exists")

    queue = Queue(
        name=body.name,
        project_id=project_id,
        priority=body.priority,
        concurrency_limit=body.concurrency_limit,
        retry_policy=body.retry_policy,
        max_attempts=body.max_attempts,
    )
    db.add(queue)
    db.commit()
    db.refresh(queue)
    return _queue_to_response(db, queue)


@router.get("/", response_model=PaginatedResponse[QueueResponse])
def list_queues(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    project_id: UUID = Depends(resolve_project),
    db: Session = Depends(get_db)
):
    query = db.query(Queue).filter(Queue.project_id == project_id).order_by(Queue.priority.desc(), Queue.name.asc())
    total = query.count()
    queues = query.offset(offset).limit(limit).all()
    
    return {
        "items": [_queue_to_response(db, q) for q in queues],
        "total": total
    }


@router.get("/{queue_id}", response_model=QueueResponse)
def get_queue(queue_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.project_id == project_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return _queue_to_response(db, queue)


@router.patch("/{queue_id}", response_model=QueueResponse)
def update_queue(queue_id: UUID, body: QueueUpdate, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.project_id == project_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    if body.priority is not None:
        queue.priority = body.priority
    if body.concurrency_limit is not None:
        queue.concurrency_limit = body.concurrency_limit
    if body.retry_policy is not None:
        queue.retry_policy = body.retry_policy
    if body.max_attempts is not None:
        queue.max_attempts = body.max_attempts

    db.commit()
    db.refresh(queue)
    return _queue_to_response(db, queue)


@router.post("/{queue_id}/pause", response_model=QueueResponse)
def pause_queue(queue_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.project_id == project_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    queue.paused = True
    db.commit()
    db.refresh(queue)
    return _queue_to_response(db, queue)


@router.post("/{queue_id}/resume", response_model=QueueResponse)
def resume_queue(queue_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.project_id == project_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    queue.paused = False
    db.commit()
    db.refresh(queue)
    return _queue_to_response(db, queue)


@router.delete("/{queue_id}", status_code=204)
def delete_queue(queue_id: UUID, project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    queue = db.query(Queue).filter(Queue.id == queue_id, Queue.project_id == project_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    # Guard: can't delete if active (non-terminal) jobs exist
    active_count = (
        db.query(func.count(Job.id))
        .filter(Job.queue_id == queue_id)
        .filter(Job.status.in_(["QUEUED", "CLAIMED", "RUNNING"]))
        .scalar()
    )
    if active_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete queue '{queue.name}': {active_count} active job(s) exist"
        )

    # Detach remaining completed/failed jobs and schedules to prevent FK violation
    db.query(Job).filter(Job.queue_id == queue_id).update({Job.queue_id: None}, synchronize_session=False)
    from ..models import ScheduledJob
    db.query(ScheduledJob).filter(ScheduledJob.queue_id == queue_id).update({ScheduledJob.queue_id: None}, synchronize_session=False)

    db.delete(queue)
    db.commit()
