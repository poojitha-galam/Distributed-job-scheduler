from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from datetime import datetime, timezone

from ..database import get_db
from ..models import User, Organization, OrganizationMember, Project, Queue
from ..auth import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    organization_name: str

class LoginRequest(BaseModel):
    email: str
    password: str

from fastapi import APIRouter, Depends, HTTPException, status, Response

@router.post("/register")
def register(req: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    project_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    
    # 1. Create User
    new_user = User(
        id=user_id,
        email=req.email,
        password_hash=get_password_hash(req.password),
        name=req.name,
        created_at=now
    )
    db.add(new_user)
    
    # 2. Create Organization
    new_org = Organization(
        id=org_id,
        name=req.organization_name,
        created_at=now
    )
    db.add(new_org)
    
    db.flush()
    
    # 3. Create Member
    new_member = OrganizationMember(
        organization_id=org_id,
        user_id=user_id,
        role="owner",
        created_at=now
    )
    db.add(new_member)
    
    # 4. Create Default Project
    new_proj = Project(
        id=project_id,
        organization_id=org_id,
        name="Default Project",
        created_at=now
    )
    db.add(new_proj)
    
    # 5. Create Default Queue for the new Project
    new_queue = Queue(
        id=uuid.uuid4(),
        project_id=project_id,
        name="default",
        priority=0,
        concurrency_limit=10,
        created_at=now
    )
    db.add(new_queue)
    
    db.commit()
    
    # Return JWT
    token = create_access_token({"sub": str(user_id)})
    response.set_cookie(
        key="cws_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=24 * 3600
    )
    response.set_cookie(
        key="cws_auth_status",
        value="1",
        httponly=False,
        samesite="lax",
        max_age=24 * 3600
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/login")
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    token = create_access_token({"sub": str(user.id)})
    response.set_cookie(
        key="cws_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=24 * 3600
    )
    response.set_cookie(
        key="cws_auth_status",
        value="1",
        httponly=False,
        samesite="lax",
        max_age=24 * 3600
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="cws_token", samesite="lax")
    response.delete_cookie(key="cws_auth_status", samesite="lax")
    return {"message": "Logged out successfully"}


@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Fetch orgs and projects
    memberships = db.query(OrganizationMember).filter(OrganizationMember.user_id == user.id).all()
    org_ids = [m.organization_id for m in memberships]
    
    orgs = db.query(Organization).filter(Organization.id.in_(org_ids)).all()
    projects = db.query(Project).filter(Project.organization_id.in_(org_ids)).all()
    
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "organizations": [{"id": str(o.id), "name": o.name} for o in orgs],
        "projects": [{"id": str(p.id), "name": p.name, "organization_id": str(p.organization_id)} for p in projects]
    }
