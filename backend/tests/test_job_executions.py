import pytest
from app.models import Job, JobExecution, Queue
import time

def test_job_executions_recorded(client, db, test_auth_headers, test_project, test_queue):
    # Create a job that will fail 2 times, and succeed on the 3rd attempt
    res = client.post(f"/api/v1/jobs/?project_id={test_project.id}", json={
        "name": "test_executions",
        "payload": {"fail_times": 2, "work_seconds": 0},
        "queue_name": test_queue.name
    }, headers=test_auth_headers)
    assert res.status_code == 201
    job_id = res.json()["id"]

    # The worker loop will process it
    # We don't have a live worker in pytest, so we mock the worker process logic
    # Actually, we can just call claim_next_job and process_job directly
    from worker.worker import claim_next_job, process_job
    
    # Attempt 1
    job1 = claim_next_job(db, "test-worker")
    assert str(job1.id) == str(job_id)
    process_job(db, job1, "test-worker")
    
    # Reset next_retry_at so we can claim it immediately
    job1.next_retry_at = None
    db.commit()
    
    # Attempt 2
    job2 = claim_next_job(db, "test-worker")
    assert str(job2.id) == str(job_id)
    process_job(db, job2, "test-worker")
    
    # Reset next_retry_at
    job2.next_retry_at = None
    db.commit()
    
    # Attempt 3
    job3 = claim_next_job(db, "test-worker")
    assert str(job3.id) == str(job_id)
    process_job(db, job3, "test-worker")
    
    # Verify the job is completed
    db.expire_all()
    final_job = db.query(Job).filter(Job.id == job_id).first()
    assert final_job.status == "COMPLETED"
    
    # Check the API endpoint
    exec_res = client.get(f"/api/v1/jobs/{job_id}/executions?project_id={test_project.id}", headers=test_auth_headers)
    assert exec_res.status_code == 200
    executions = exec_res.json()
    
    assert len(executions) == 3
    assert executions[0]["attempt_number"] == 1
    assert executions[0]["status"] == "FAILED"
    
    assert executions[1]["attempt_number"] == 2
    assert executions[1]["status"] == "FAILED"
    
    assert executions[2]["attempt_number"] == 3
    assert executions[2]["status"] == "COMPLETED"
