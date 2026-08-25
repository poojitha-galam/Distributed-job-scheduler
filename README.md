# Distributed Job Scheduler

## Overview
The **Distributed Job Scheduler** is a robust, scalable system designed to handle background tasks, scheduled execution, and distributed job processing. It provides a reliable way to manage, monitor, and scale delayed or asynchronous workloads across multiple worker nodes, solving the complexities of distributed task execution with built-in AI-powered failure diagnostics.

## Features
- **Multi-Tenant Architecture:** Secure isolation of projects and queues with Role-Based Access Control (RBAC).
- **Scheduled & Delayed Jobs:** Schedule tasks for future execution or delay processing effortlessly.
- **Idempotency Guarantees:** Ensures jobs are processed exactly once, even during network retries.
- **Batch Processing:** Group multiple jobs together for efficient, synchronized execution.
- **AI Diagnostics:** Automatically analyzes failing jobs using Groq LLMs to provide actionable debugging insights.
- **Real-Time Dashboard:** A responsive Next.js dashboard with live updates and metrics.
- **Dead Letter Queue (DLQ):** Automatically catches and stores permanently failed jobs for manual review.

## Tech Stack
- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** FastAPI (Python), SQLAlchemy, Pydantic
- **Database:** PostgreSQL (durable source of truth for job state)
- **Message Broker:** Redis (fast dispatch, rate limiting, and pub/sub)
- **AI Integration:** Groq API (for job diagnostics)
- **Infrastructure:** Docker, Docker Compose

## Installation

### Prerequisites
- Docker and Docker Compose installed
- A [Groq API Key](https://console.groq.com/keys) for AI diagnostics

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/poojitha-galam/Distributed-job-scheduler.git
   cd Distributed-job-scheduler
   ```

2. **Setup environment variables**
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and add your Groq API key:
   ```env
   GROQ_API_KEY=your_actual_api_key_here
   ```

3. **Run the project**
   ```bash
   docker compose up --build
   ```
   *This command spins up the Postgres database, Redis, the FastAPI backend, the Scheduler, multiple Worker nodes, and the Next.js frontend.*

## Usage

1. **Access the Dashboard:** Open `http://localhost:3000` in your browser.
2. **Register/Login:** Create a new account to access your workspace.
3. **Create a Queue:** Navigate to the Queues tab and create a new job queue.
4. **Submit Jobs:** Use the dashboard or API to enqueue jobs (immediate, delayed, or scheduled).
5. **Monitor Execution:** Watch the workers pick up and execute jobs in real-time. If a job fails repeatedly, check the AI summary for a diagnostic breakdown.

## Project Structure

```text
├── backend/            # FastAPI application (API, Scheduler, Reaper)
├── frontend/           # Next.js web dashboard
├── worker/             # Job execution nodes (Python)
├── docs/               # Architecture and design decisions
├── docker-compose.yml  # Multi-container orchestration
└── README.md           # Project documentation
```

## API
Key REST endpoints (Interactive Swagger docs available at `http://localhost:8000/docs`):

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/jobs` - Enqueue a new job
- `GET /api/v1/jobs/{id}` - Retrieve job status and AI diagnostics
- `POST /api/v1/queues` - Create a new message queue
- `GET /api/v1/schedules` - List recurring scheduled tasks

## Configuration
The system relies on the following key environment variables (configured automatically in `docker-compose.yml` for local dev):

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `GROQ_API_KEY`: Required for AI failure analysis features

## Future Improvements
- **Webhook Integration:** Fire HTTP webhooks upon job completion or failure.
- **Priority Queues:** Introduce strict priority weighting for urgent tasks.
- **Advanced Dashboard Analytics:** Add historical charts for throughput and failure rates.
- **Worker Auto-scaling:** Dynamically spin up worker containers based on queue depth.

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. 

## Author
Developed by **Galam Poojitha**
