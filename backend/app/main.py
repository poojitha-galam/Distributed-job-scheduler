import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from app.routers import auth, queues, jobs, schedules, dlq, api_keys, ws

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure database tables and default queue exist on startup."""
    from .database import engine, Base
    Base.metadata.create_all(bind=engine)
    
    from .models import Queue
    from .database import SessionLocal
    from app.routers.ws import redis_listener
    import asyncio
    
    # Start the redis pubsub listener in the background
    listener_task = asyncio.create_task(redis_listener())
    
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
    listener_task.cancel()


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

import time
from fastapi import Request

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time_ms = (time.time() - start_time) * 1000
    logger.info(f"method={request.method} path={request.url.path} status_code={response.status_code} processing_time_ms={process_time_ms:.2f}")
    return response

app.include_router(jobs.router, prefix="/api/v1")
app.include_router(dlq.router, prefix="/api/v1")
app.include_router(schedules.router, prefix="/api/v1")
app.include_router(queues.router, prefix="/api/v1")
from .routers import auth, api_keys, workers, ws, events
app.include_router(auth.router, prefix="/api/v1")
app.include_router(api_keys.router, prefix="/api/v1")
app.include_router(workers.router, prefix="/api/v1")
app.include_router(ws.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}
