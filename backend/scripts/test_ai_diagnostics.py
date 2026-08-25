import requests
import time
import secrets

BASE_URL = "http://localhost:8000/api/v1"

def test_ai_diagnostics():
    # 1. Register User
    test_email = f"test_{secrets.token_hex(4)}@example.com"
    test_pass = "password123"
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "email": test_email,
        "password": test_pass,
        "name": "Test User",
        "organization_name": "Test Org"
    })
    
    # 2. Login User
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "email": test_email,
        "password": test_pass
    })
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Get Me & Project ID
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    me_data = r.json()
    project_id = me_data["projects"][0]["id"]
    
    # 4. Create API Key
    r = requests.post(f"{BASE_URL}/projects/{project_id}/api-keys", headers=headers, json={"name": "Prod Key"})
    api_key = r.json()["key"]
    api_headers = {"x-api-key": api_key}
    
    # 5. Create a queue
    queue_name = f"queue_{secrets.token_hex(4)}"
    r = requests.post(f"{BASE_URL}/queues", headers=api_headers, json={"name": queue_name})
    queue_id = r.json()["id"]

    # 6. Create a job that fails
    r = requests.post(f"{BASE_URL}/jobs/", headers=api_headers, json={
        "name": "Failing Job",
        "queue_id": queue_id,
        "payload": {"fail_times": 5, "work_seconds": 0},
        "max_attempts": 1,
        "retry_policy": "fixed"
    })
    
    if r.status_code != 201:
        print(f"Failed to create job: {r.json()}")
        return

    job_id = r.json()["id"]
    print(f"Created failing job {job_id}")

    # 7. Wait for failure
    for _ in range(30):
        time.sleep(1)
        res = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=api_headers)
        job = res.json()
        print(f"Job status: {job['status']}")
        if job["status"] == "FAILED":
            print("Job failed!")
            break

    # 8. Check ai_summary
    if "ai_summary" in job and job["ai_summary"]:
        print("Success! AI Summary found:")
        print(job["ai_summary"])
    else:
        print("Failure: ai_summary missing or empty.")
        print(job)

if __name__ == "__main__":
    test_ai_diagnostics()
