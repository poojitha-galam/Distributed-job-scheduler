import requests
import time
import sys
import uuid
import secrets

BASE_URL = "http://localhost:8000/api/v1"

def print_result(test_name, passed, msg=""):
    status = "\033[92mPASS\033[0m" if passed else "\033[91mFAIL\033[0m"
    print(f"[{status}] {test_name} {msg}")
    if not passed:
        sys.exit(1)

def main():
    print("--- Phase 5 Verification ---")
    
    # 1. Register User
    test_email = f"test_{secrets.token_hex(4)}@example.com"
    test_pass = "password123"
    r = requests.post(f"{BASE_URL}/auth/register", json={
        "email": test_email,
        "password": test_pass,
        "name": "Test User",
        "organization_name": "Test Org"
    })
    print_result("Register User", r.status_code == 200, f"- Code {r.status_code}")
    
    # 2. Login User
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "email": test_email,
        "password": test_pass
    })
    print_result("Login User", r.status_code == 200)
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Get Me & Project ID
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    print_result("Get /me", r.status_code == 200)
    me_data = r.json()
    project_id = me_data["projects"][0]["id"]
    print(f"   -> project_id: {project_id}")
    
    # 4. Create API Key
    r = requests.post(f"{BASE_URL}/projects/{project_id}/api-keys", headers=headers, json={"name": "Prod Key"})
    print_result("Create API Key", r.status_code == 200)
    api_key_data = r.json()
    api_key = api_key_data["key"]
    key_id = api_key_data["id"]
    
    # 5. Dashboard call (JWT + project_id query) to list queues
    r = requests.get(f"{BASE_URL}/queues?project_id={project_id}", headers=headers)
    print_result("Dashboard: List Queues", r.status_code == 200)
    
    # 6. Machine call (API Key, no query param needed) to create queue
    api_headers = {"x-api-key": api_key}
    queue_name = f"queue_{secrets.token_hex(4)}"
    r = requests.post(f"{BASE_URL}/queues", headers=api_headers, json={"name": queue_name})
    print_result("Machine: Create Queue via API Key", r.status_code == 201)
    
    # 7. Dashboard missing project_id should 400
    r = requests.get(f"{BASE_URL}/queues", headers=headers)
    print_result("Dashboard: Missing project_id fails", r.status_code == 400)
    
    # 8. API Key unauthorized on other projects
    other_proj = str(uuid.uuid4())
    r = requests.get(f"{BASE_URL}/queues?project_id={other_proj}", headers=api_headers)
    print_result("Machine: Cross-project access denied", r.status_code == 403)
    
    # 9. List API keys (dashboard)
    r = requests.get(f"{BASE_URL}/projects/{project_id}/api-keys", headers=headers)
    print_result("Dashboard: List API Keys", r.status_code == 200)
    
    # 10. Revoke API key
    r = requests.delete(f"{BASE_URL}/projects/{project_id}/api-keys/{key_id}", headers=headers)
    print_result("Dashboard: Revoke API Key", r.status_code == 204)
    
    # 11. Use revoked API key
    r = requests.post(f"{BASE_URL}/queues", headers=api_headers, json={"name": "will_fail"})
    print_result("Machine: Revoked API key fails", r.status_code == 401)
    
    print("\nALL PHASE 5 TESTS PASSED")

if __name__ == "__main__":
    main()
