from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
import secrets
from datetime import datetime, timezone

from ..database import get_db
from ..models import ApiKey, Project, User
from ..auth import get_current_user, require_project_access, hash_api_key

router = APIRouter(prefix="/projects/{project_id}/api-keys", tags=["api_keys"])

class CreateApiKeyRequest(BaseModel):
    name: str

class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked: bool

    model_config = {"from_attributes": True}

class CreateApiKeyResponse(ApiKeyResponse):
    key: str  # Raw key, returned only once

@router.post("", response_model=CreateApiKeyResponse)
def create_api_key(
    project_id: uuid.UUID,
    req: CreateApiKeyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_project_access(project_id, user=user, db=db)
    
    raw_key = "cws_live_" + secrets.token_urlsafe(32)
    key_hash = hash_api_key(raw_key)
    key_prefix = raw_key[:15] + "..."
    
    new_key = ApiKey(
        project_id=project_id,
        name=req.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        revoked=False
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)
    
    return {
        "id": new_key.id,
        "name": new_key.name,
        "key_prefix": new_key.key_prefix,
        "created_at": new_key.created_at,
        "last_used_at": new_key.last_used_at,
        "revoked": new_key.revoked,
        "key": raw_key
    }

@router.get("", response_model=list[ApiKeyResponse])
def list_api_keys(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_project_access(project_id, user=user, db=db)
    keys = db.query(ApiKey).filter(ApiKey.project_id == project_id).all()
    return keys

@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    project_id: uuid.UUID,
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_project_access(project_id, user=user, db=db)
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.project_id == project_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API Key not found")
        
    key.revoked = True
    db.commit()
