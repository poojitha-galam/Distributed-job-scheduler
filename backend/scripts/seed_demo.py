import requests
import time
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000/api/v1"

def seed_demo():
    print("Seeding Demo Data for Invigilator...")
    
    # 1. Register or Login User
    email = "invigilator@demo.com"
    password = "password123"
    
    print(f"Logging in / Registering {email}...")
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        # Try registering
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "email": email,
            "password": password,
            "name": "Invigilator Demo",
            "organization_name": "Reviewer Org"
        })
        if r.status_code not in [201, 400]:
            print(f"Failed to register demo user. Status: {r.status_code}, {r.text}")
            return
        
        # Login again
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
        
    if r.status_code != 200:
        print(f"Failed to login. Status: {r.status_code}, {r.text}")
        return
        
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Get Project ID
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    project_id = r.json()["projects"][0]["id"]
    
    # 3. Create API Key
    r = requests.post(f"{BASE_URL}/projects/{project_id}/api-keys", headers=headers, json={"name": "Demo Key"})
    api_key = r.json().get("key")
    if not api_key: # Key might already exist if we ran this before, but let's just make a new one anyway
        api_headers = headers # Fallback to bearer token for some things, but jobs need API key
    else:
        api_headers = {"x-api-key": api_key}
        
    print("API Key generated.")

    # 4. Create Queues
    queues = ["Data Pipeline", "Email Notifications", "AI Training"]
    queue_ids = {}
    
    for q_name in queues:
        r = requests.post(f"{BASE_URL}/queues", headers=api_headers, json={"name": q_name})
        if r.status_code == 201:
            queue_ids[q_name] = r.json()["id"]
        else:
            # Maybe it already exists, let's fetch it
            all_q = requests.get(f"{BASE_URL}/queues", headers=api_headers).json()
            for existing in all_q:
                if existing["name"] == q_name:
                    queue_ids[q_name] = existing["id"]
                    break

    print(f"Queues ready: {queue_ids}")

    # 5. Populate Data Pipeline (Standard Jobs)
    print("Populating 'Data Pipeline'...")
    for i in range(5):
        requests.post(f"{BASE_URL}/jobs/", headers=api_headers, json={
            "name": f"ETL Job {i+1}",
            "queue_id": queue_ids["Data Pipeline"],
            "payload": {"work_seconds": 2},
            "max_attempts": 3,
            "retry_policy": "exponential"
        })

    # 6. Populate Email Notifications (Fast batch jobs)
    print("Populating 'Email Notifications'...")
    for i in range(20):
        requests.post(f"{BASE_URL}/jobs/", headers=api_headers, json={
            "name": f"Send Welcome Email #{i+1}",
            "queue_id": queue_ids["Email Notifications"],
            "payload": {"work_seconds": 0, "user_id": i},
            "max_attempts": 1,
            "retry_policy": "fixed"
        })
        
    # 7. Populate AI Training (Failing Jobs to trigger AI Diagnostics)
    print("Populating 'AI Training' (Failing Jobs)...")
    for i in range(2):
        requests.post(f"{BASE_URL}/jobs/", headers=api_headers, json={
            "name": f"Model Tuning (Will Fail) {i+1}",
            "queue_id": queue_ids["AI Training"],
            "payload": {"fail_times": 5, "work_seconds": 0},
            "max_attempts": 1,
            "retry_policy": "fixed"
        })

    # 8. Create Scheduled/Delayed Jobs
    print("Populating Scheduled Jobs...")
    future_time = (datetime.utcnow() + timedelta(minutes=5)).isoformat() + "Z"
    requests.post(f"{BASE_URL}/jobs/", headers=api_headers, json={
        "name": "Database Backup (Delayed)",
        "queue_id": queue_ids["Data Pipeline"],
        "payload": {"work_seconds": 5},
        "max_attempts": 3,
        "retry_policy": "exponential",
        "scheduled_at": future_time
    })
    
    # 9. Create a Cron Schedule
    requests.post(f"{BASE_URL}/schedules", headers=api_headers, json={
        "name": "Hourly Report Generation",
        "cron_expression": "0 * * * *",
        "queue_id": queue_ids["Data Pipeline"],
        "payload": {"report_type": "hourly"},
        "max_attempts": 3
    })

    print("\n[SUCCESS] Demo data seeded successfully!")
    print("--------------------------------------------------")
    print(f"Login Email: {email}")
    print(f"Password:    {password}")
    print("--------------------------------------------------")
    print("Check the dashboard at http://localhost:3000 to view the data.")

if __name__ == "__main__":
    seed_demo()
