import hashlib
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import uuid

from .database import get_db
from .models import User, ApiKey, Project, Queue, OrganizationMember

import os
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-phase5-must-be-at-least-32-bytes")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode('utf-8')).hexdigest()

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


from fastapi import Depends, HTTPException, status, Header, Request

def get_current_user(request: Request, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    actual_token = request.cookies.get("cws_token") or token
    if not actual_token:
        raise credentials_exception
        
    try:
        payload = jwt.decode(actual_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


def get_project_from_api_key(x_api_key: str = Header(None), db: Session = Depends(get_db)) -> Project:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API Key required")
        
    hashed_key = hash_api_key(x_api_key)
    api_key_obj = db.query(ApiKey).filter(ApiKey.key_hash == hashed_key).first()
    
    if not api_key_obj or api_key_obj.revoked:
        raise HTTPException(status_code=401, detail="Invalid or revoked API Key")
        
    api_key_obj.last_used_at = datetime.now(timezone.utc)
    db.commit()
    
    project = db.query(Project).filter(Project.id == api_key_obj.project_id).first()
    return project


ROLE_HIERARCHY = {
    "viewer": 1,
    "member": 2,
    "admin": 3,
    "owner": 4
}

def require_project_access(project_id: uuid.UUID, user: User | None = None, api_key_project: Project | None = None, db: Session = Depends(get_db), require_role: str = None):
    """Verifies that the caller has access to the specified project."""
    if api_key_project:
        if api_key_project.id != project_id:
            raise HTTPException(status_code=403, detail="API Key does not have access to this project")
        return
        
    if user:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
            
        member = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == project.organization_id,
            OrganizationMember.user_id == user.id
        ).first()
        
        if not member:
            raise HTTPException(status_code=403, detail="User does not have access to this project")
            
        if require_role:
            req_level = ROLE_HIERARCHY.get(require_role.lower(), 0)
            user_level = ROLE_HIERARCHY.get(member.role.lower(), 0)
            if user_level < req_level:
                raise HTTPException(status_code=403, detail=f"{require_role} access required")
            
        return
        
    raise HTTPException(status_code=401, detail="Authentication required")


def get_optional_auth(
    request: Request,
    token: str = Depends(oauth2_scheme),
    x_api_key: str = Header(None),
    db: Session = Depends(get_db)
):
    """Returns either a User (if valid JWT), a Project (if valid API Key), or raises 401."""
    if x_api_key:
        return get_project_from_api_key(x_api_key, db)
    
    actual_token = request.cookies.get("cws_token") or token
    if actual_token:
        try:
            return get_current_user(request, token, db)
        except HTTPException:
            pass # Fall through to 401
            
    raise HTTPException(status_code=401, detail="Authentication required (JWT or X-API-Key)")


from fastapi import Query

class RequireRole:
    def __init__(self, role: str = None):
        self.role = role

    def __call__(
        self,
        project_id: uuid.UUID = Query(None),
        auth_entity: User | Project = Depends(get_optional_auth),
        db: Session = Depends(get_db)
    ) -> uuid.UUID:
        """Returns the resolved project_id. Infers from API key if present, otherwise requires query param and verifies User access."""
        if isinstance(auth_entity, Project):
            if project_id and project_id != auth_entity.id:
                raise HTTPException(status_code=403, detail="API Key cannot access this project")
            return auth_entity.id
            
        if not project_id:
            raise HTTPException(status_code=400, detail="project_id query parameter is required")
            
        require_project_access(project_id, user=auth_entity, db=db, require_role=self.role)
        return project_id

resolve_project = RequireRole()
resolve_project_admin = RequireRole("admin")
resolve_project_member = RequireRole("member")
