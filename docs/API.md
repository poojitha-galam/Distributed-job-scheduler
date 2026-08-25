# API Reference

The backend exposes a REST API via FastAPI. An interactive OpenAPI schema is available at `http://localhost:8000/docs`.

## Authentication

The API supports two methods of authentication, which can be provided interchangeably on any route:

### 1. API Keys (Recommended for Services)
API Keys are tied directly to a specific Project.
Pass the raw key in the `x-api-key` header:
```http
x-api-key: your-raw-api-key
```

### 2. JWT Tokens (Recommended for Dashboard)
JWT Tokens are tied to a User. Because a user can belong to an organization with many projects, endpoints using JWTs require an explicit `project_id` query parameter to resolve context.
```http
Authorization: Bearer <your_jwt_token>
```
Example: `GET /api/v1/jobs?project_id=<uuid>`

## Core Endpoints

### Jobs

**Submit a Job**
```http
POST /api/v1/jobs
```
Payload:
```json
{
  "name": "send_email",
  "payload": {"to": "user@example.com"},
  "queue_name": "default"
}
```

**List Jobs**
```http
GET /api/v1/jobs
```
Returns a paginated list of jobs filtered by the active project.

### Queues

**Create a Queue**
```http
POST /api/v1/queues
```
Payload:
```json
{
  "name": "high_priority",
  "priority": 10,
  "concurrency_limit": 5,
  "retry_policy": "exponential",
  "max_attempts": 3
}
```

**List Queues**
```http
GET /api/v1/queues
```
Returns all queues belonging to the active project, alongside real-time statistics (queued, running, completed counts).

### Schedules

**Create a Schedule**
```http
POST /api/v1/schedules
```
Payload:
```json
{
  "name": "daily_report",
  "cron_expression": "0 0 * * *",
  "payload": {"report_type": "summary"},
  "queue_name": "default"
}
```
