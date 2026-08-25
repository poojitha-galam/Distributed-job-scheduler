import pytest
import uuid
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import User, Project, Queue, ApiKey, Job, ScheduledJob, DeadLetterJob
from app.auth import get_password_hash, create_access_token

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture(scope="function")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture(scope="function")
def test_user(db):
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"test_{user_id}@example.com",
        password_hash=get_password_hash("password123"),
        name="Test User"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    # Cascade deletes to avoid constraint errors
    db.delete(user)
    db.commit()

@pytest.fixture(scope="function")
def test_project(db, test_user):
    from app.models import Organization, OrganizationMember
    org = Organization(name="Test Org")
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(organization_id=org.id, user_id=test_user.id, role="owner")
    db.add(member)
    
    project = Project(organization_id=org.id, name="Test Project")
    db.add(project)
    db.commit()
    db.refresh(project)

    yield project

    # Cleanup dependencies
    queues = db.query(Queue).filter(Queue.project_id == project.id).all()
    queue_ids = [q.id for q in queues]
    if queue_ids:
        db.query(DeadLetterJob).filter(DeadLetterJob.job_id.in_(db.query(Job.id).filter(Job.queue_id.in_(queue_ids)))).delete(synchronize_session=False)
        db.query(Job).filter(Job.queue_id.in_(queue_ids)).delete(synchronize_session=False)
        db.query(ScheduledJob).filter(ScheduledJob.queue_id.in_(queue_ids)).delete(synchronize_session=False)
    db.query(ApiKey).filter(ApiKey.project_id == project.id).delete(synchronize_session=False)
    db.query(Queue).filter(Queue.project_id == project.id).delete(synchronize_session=False)
    db.query(Project).filter(Project.id == project.id).delete(synchronize_session=False)
    db.query(OrganizationMember).filter(OrganizationMember.id == member.id).delete()
    db.query(Organization).filter(Organization.id == org.id).delete()
    db.commit()

@pytest.fixture(scope="function")
def test_queue(db, test_project):
    q_name = f"queue_{uuid.uuid4().hex[:8]}"
    queue = Queue(project_id=test_project.id, name=q_name, priority=0, concurrency_limit=10)
    db.add(queue)
    db.commit()
    db.refresh(queue)
    yield queue

@pytest.fixture(scope="function")
def test_auth_headers(test_user, test_project):
    token = create_access_token({"sub": str(test_user.id)})
    return {
        "Authorization": f"Bearer {token}"
    }
