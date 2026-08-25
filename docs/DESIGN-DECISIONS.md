# Design Decisions

Throughout the development of the Distributed Job Scheduler, several deliberate architectural choices were made to optimize for simplicity, robustness, and ease of deployment.

## PostgreSQL vs. Redis for the Message Broker

A common approach for building job queues is to use Redis as the primary message broker (e.g., Celery, BullMQ). We opted for a pure-PostgreSQL approach instead for the following reasons:

1. **Simplicity of Operational Stack:** By keeping both application state and queue state in Postgres, we eliminate the need to run, monitor, and scale a separate Redis cluster.
2. **Transactional Guarantees:** When a job transitions from QUEUED to CLAIMED, it happens in an atomic database transaction. Postgres provides out-of-the-box ACID compliance. 
3. **Relational Querying:** The Next.js dashboard needs to join Jobs to their corresponding Queues, Projects, and Users to display rich tables with sorting and filtering. Doing this natively with SQL `JOIN`s is trivial, whereas aggregating state across Postgres and Redis would require complex manual synchronization.

The performance trade-off is negligible for moderate-to-high workloads due to `SELECT ... FOR UPDATE SKIP LOCKED`, which allows high concurrent throughput without the lock contention that typically plagues relational queues.

## API Polling vs. WebSockets (Dashboard)

For updating the dashboard UI with the latest job states, we evaluated WebSockets/SSE vs. standard API polling. We chose API polling.

1. **Stateless Frontend / Backend:** WebSockets require the backend to maintain stateful, persistent TCP connections with every active client. This complicates horizontal scaling of the FastAPI layer, requiring a pub/sub backplane (like Redis) just to broadcast events across API nodes.
2. **Simplicity:** Polling with React Query/SWR over standard HTTP is extremely resilient to network drops, whereas WebSocket reconnections require careful state reconciliation. 

## Dedicated Scheduler Process

The system separates the cron evaluation (Scheduler) from the job processing (Worker).

- The **Scheduler** acts exclusively as a watch-tower, pushing tangible execution records into the queue at the correct times.
- The **Workers** remain perfectly oblivious to time, simply burning down the queue as fast as they can.

This decouples scaling: if jobs back up, you scale the Workers. The Scheduler remains a cheap, lightweight singleton.

## `create_all()` vs. Alembic Migration Chain

For the final submission, database tables are created at startup via SQLAlchemy's `Base.metadata.create_all()` rather than through the Alembic migration chain that was used during phased development.

1. **Zero migration-state risk:** Alembic tracks schema versions in a `alembic_version` table. If that table is missing, out of date, or conflicts with the actual schema (easy to trigger after a `docker compose down -v` wipe), `alembic upgrade head` can fail or partially apply, leaving the database in an inconsistent state. `create_all()` is idempotent — it creates missing tables and silently skips existing ones.
2. **No production data to preserve:** Alembic's primary value is safe, incremental schema changes on databases that already contain real data. This project has no persistent production data across deploys; every demo starts from a clean volume. `create_all()` is the correct tool for this lifecycle.
3. **Alembic files retained as documentation:** The migration files in `backend/alembic/versions/` remain in the repository as a phase-by-phase record of how the schema evolved (adding queues, multi-tenancy columns, the DLQ table, API keys, etc.). They're useful context for anyone reviewing the project's development history.

In a production system with real user data, the next step would be to generate a single baseline Alembic migration from the final `create_all()` schema and resume the Alembic chain from there.

