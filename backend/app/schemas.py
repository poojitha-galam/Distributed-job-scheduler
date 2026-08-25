from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from typing import Generic, TypeVar, List

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int | None = None


class JobCreate(BaseModel):
    name: str
    payload: dict
    scheduled_at: datetime | None = None
    queue_name: str | None = None
    idempotency_key: str | None = None


class JobResponse(BaseModel):
    id: UUID
    name: str
    payload: Any
    status: str
    claimed_by: str | None = None
    claim_token: str | None = None
    attempt_count: int = 0
    max_attempts: int = 3
    retry_policy: str = "exponential"
    last_error: str | None = None
    last_heartbeat: datetime | None = None
    next_retry_at: datetime | None = None
    result: Any | None = None
    error: str | None = None
    ai_summary: dict | None = None
    scheduled_at: datetime | None = None
    is_recurring: bool = False
    cron_expression: str | None = None
    next_run_at: datetime | None = None
    queue_name: str | None = None
    idempotency_key: str | None = None
    schedule_id: UUID | None = None
    parent_job_id: UUID | None = None
    queue_id: UUID | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}

class JobExecutionResponse(BaseModel):
    id: UUID
    job_id: UUID
    attempt_number: int
    worker_id: str
    status: str
    started_at: datetime
    completed_at: datetime | None = None
    error: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

class DeadLetterJobResponse(BaseModel):
    id: UUID
    job_id: UUID
    failure_reason: str
    attempt_count: int
    first_failed_at: datetime
    last_failed_at: datetime
    payload_snapshot: dict
    created_at: datetime

    model_config = {"from_attributes": True}

class ScheduledJobCreate(BaseModel):
    name: str
    payload: dict
    cron_expression: str
    queue_name: str | None = None

class ScheduledJobResponse(BaseModel):
    id: UUID
    name: str
    payload: dict
    cron_expression: str
    enabled: bool
    next_run_at: datetime
    last_run_at: datetime | None = None
    queue_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

# ── Queue schemas ──

class QueueCreate(BaseModel):
    name: str
    priority: int = 0
    concurrency_limit: int = 10
    retry_policy: str = "exponential"
    max_attempts: int = 3

class QueueUpdate(BaseModel):
    priority: int | None = None
    concurrency_limit: int | None = None
    retry_policy: str | None = None
    max_attempts: int | None = None

class QueueStatsResponse(BaseModel):
    queued: int = 0
    claimed: int = 0
    running: int = 0
    completed: int = 0
    failed: int = 0

class QueueResponse(BaseModel):
    id: UUID
    name: str
    priority: int
    concurrency_limit: int
    paused: bool
    retry_policy: str
    max_attempts: int
    stats: QueueStatsResponse = QueueStatsResponse()
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobLogCreate(BaseModel):
    message: str
    level: str = "INFO"

class JobLogResponse(BaseModel):
    id: UUID
    job_id: UUID
    timestamp: datetime
    message: str
    level: str

    model_config = {"from_attributes": True}
