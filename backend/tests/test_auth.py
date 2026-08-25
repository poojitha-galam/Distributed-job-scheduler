import uuid
from app.models import Project, Queue, ApiKey, Job
from app.auth import get_password_hash

def test_project_isolation(client, db, test_auth_headers, test_project, test_user):
    """
    Test that a user cannot access resources in a project they don't belong to.
    """
    # Create a second project that test_user does not belong to
    from app.models import Organization
    org2 = Organization(name="Other Org")
    db.add(org2)
    db.commit()
    db.refresh(org2)
    
    project2 = Project(organization_id=org2.id, name="Other Project")
    db.add(project2)
    db.commit()
    db.refresh(project2)
    
    q2 = Queue(project_id=project2.id, name="other_queue", priority=0, concurrency_limit=10)
    db.add(q2)
    db.commit()
    
    # Attempt to list queues using test_user's token, but specifying project2's ID
    response = client.get(f"/api/v1/queues?project_id={project2.id}", headers=test_auth_headers)
    assert response.status_code == 403
    assert "User does not have access" in response.json()["detail"]

def test_api_key_authentication(client, db, test_project):
    """
    Test that a valid API key works and a revoked one doesn't.
    """
    # Create an API Key manually
    import hashlib
    import secrets
    
    raw_key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]
    
    api_key = ApiKey(
        project_id=test_project.id,
        name="test_key",
        key_hash=key_hash,
        key_prefix=key_prefix,
        revoked=False
    )
    db.add(api_key)
    
    q = Queue(project_id=test_project.id, name="api_queue", priority=0, concurrency_limit=10)
    db.add(q)
    db.commit()
    db.refresh(api_key)
    db.refresh(q)
    
    headers = {
        "x-api-key": raw_key
    }
    
    # Valid key
    response = client.post("/api/v1/jobs", json={
        "name": "api_job",
        "payload": {},
        "queue_name": "api_queue"
    }, headers=headers)
    
    assert response.status_code == 201, response.json()
    assert response.json()["name"] == "api_job"
    
    # Revoke key
    api_key.revoked = True
    db.commit()
    
    response_revoked = client.post("/api/v1/jobs", json={
        "name": "api_job_2",
        "payload": {},
        "queue_name": "api_queue"
    }, headers=headers)
    
    assert response_revoked.status_code == 401
    assert "Invalid or revoked API Key" in response_revoked.json()["detail"]
