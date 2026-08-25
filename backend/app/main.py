import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import jobs, dlq, schedules, queues

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure database tables and default queue exist on startup."""
    from .database import engine, Base
    Base.metadata.create_all(bind=engine)
    
    from .models import Queue
    from .database import SessionLocal
    db = SessionLocal()
    try:
        # Wait for migrations to finish before trying to query
        import time
        for _ in range(5):
            try:
                default_q = db.query(Queue).filter(Queue.name == "default").first()
                if not default_q:
                    default_q = Queue(name="default", priority=0, concurrency_limit=10)
                    db.add(default_q)
                    db.commit()
                    logger.info("Created default queue")
                break
            except Exception:
                db.rollback()
                time.sleep(2)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Distributed Job Scheduler",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs.router, prefix="/api/v1")
app.include_router(dlq.router, prefix="/api/v1")
app.include_router(schedules.router, prefix="/api/v1")
app.include_router(queues.router, prefix="/api/v1")
from .routers import auth, api_keys, workers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(api_keys.router, prefix="/api/v1")
app.include_router(workers.router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}
