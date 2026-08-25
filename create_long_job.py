import requests
import time

BASE_URL = "http://localhost:8000/api/v1"

# Login
login_res = requests.post(f"{BASE_URL}/auth/login", json={"email": "test_user_id@example.com", "password": "password123"})
if login_res.status_code != 200:
    # try registering
    reg_res = requests.post(f"{BASE_URL}/auth/register", json={"email": "test_user_id@example.com", "password": "password123", "name": "Test User", "organization_name": "Test Org"})
    login_res = requests.post(f"{BASE_URL}/auth/login", json={"email": "test_user_id@example.com", "password": "password123"})

if login_res.status_code != 200:
    print(login_res.json())
    exit(1)

token = login_res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Get project
me_res = requests.get(f"{BASE_URL}/auth/me", headers=headers)
project_id = me_res.json()["projects"][0]["id"]

# Get queues
queues = requests.get(f"{BASE_URL}/queues/?project_id={project_id}", headers=headers).json()
queue_name = queues["items"][0]["name"] if "items" in queues else queues[0]["name"]

# Post job
job_res = requests.post(
    f"{BASE_URL}/jobs/?project_id={project_id}",
    json={"name": "long_job", "payload": {"work_seconds": 15}, "queue_name": queue_name},
    headers=headers
)
print("Job submitted:", job_res.json())
