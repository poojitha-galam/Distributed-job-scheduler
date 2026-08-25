# Distributed Job Scheduler

A robust, multi-tenant distributed job scheduling system built on Postgres, FastAPI, and Next.js. 

This project implements a complete distributed task queue without relying on Redis or Celery, using PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` for atomic concurrency and safe horizontal scaling.

## Features

- **Distributed Workers**: Run any number of stateless worker processes simultaneously without duplicate job execution.
- **Advanced Scheduling**: Supports delayed execution (e.g. "run in 5 minutes") and cron-based recurring jobs.
- **Robust Retry & DLQ**: Configurable retry policies (fixed, linear, exponential) with a Dead Letter Queue for permanently failed jobs.
- **Multi-tenant Architecture**: Strong isolation via Projects and Organizations.
- **API Key & JWT Auth**: API Keys for headless job submission and JWTs for dashboard access.
- **Queue Management**: Priority ordering, per-queue concurrency limits, and pausing.
- **Dashboard**: Full-stack Next.js dashboard to monitor jobs, queues, and schedules in real-time.

## Prerequisites

- [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/)

## Quickstart

1. **Clone the repository and start the stack:**
   ```bash
   docker compose up --build
   ```
   This spins up PostgreSQL, the FastAPI Backend, 3 Worker nodes, the Scheduler service, and the Next.js Frontend.
   
   > **Note:** Database schema is created automatically on first startup via SQLAlchemy's `create_all()` — no manual migration step is needed. Just run the command above and the backend will provision all tables before accepting requests.
   
2. **Access the Dashboard:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.
   - Default login is configured via environment variables, or you can sign up via the UI.

3. **Backend API Docs:**
   Open [http://localhost:8000/docs](http://localhost:8000/docs) to view the interactive OpenAPI documentation.

## Running Tests

The test suite ensures that atomic claiming, scheduling, dead-letter queues, and multi-tenant isolation all function correctly under concurrency.

To run the pytest suite inside the backend container:

```bash
docker compose exec backend pytest tests/
```

## Known Limitations / Future Work

Given the project timeline, the following features were not implemented and would be the next additions for a production version:
- **Batch Jobs:** Grouping jobs and tracking aggregate group completion.
- **Idempotency Keys:** Native deduplication on job submission.
- **Metrics/Charts:** Visualizing throughput over time in the dashboard rather than just current totals.
