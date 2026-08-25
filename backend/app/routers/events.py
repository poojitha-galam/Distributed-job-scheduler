from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from pydantic import BaseModel
from typing import List

from ..database import get_db
from ..models import EventRule
from ..auth import resolve_project, resolve_project_admin

router = APIRouter(prefix="/events", tags=["events"])

class EventRuleCreate(BaseModel):
    event_type: str
    webhook_url: str

class EventRuleResponse(BaseModel):
    id: UUID
    project_id: UUID
    event_type: str
    webhook_url: str

    class Config:
        orm_mode = True

@router.post("/", response_model=EventRuleResponse, status_code=status.HTTP_201_CREATED)
def create_event_rule(rule: EventRuleCreate, project_id: UUID = Depends(resolve_project_admin), db: Session = Depends(get_db)):
    if rule.event_type not in ["JOB_COMPLETED", "JOB_FAILED"]:
        raise HTTPException(status_code=400, detail="Invalid event_type")
        
    db_rule = EventRule(
        project_id=project_id,
        event_type=rule.event_type,
        webhook_url=rule.webhook_url
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule

@router.get("/", response_model=List[EventRuleResponse])
def list_event_rules(project_id: UUID = Depends(resolve_project), db: Session = Depends(get_db)):
    return db.query(EventRule).filter(EventRule.project_id == project_id).all()

@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event_rule(rule_id: UUID, project_id: UUID = Depends(resolve_project_admin), db: Session = Depends(get_db)):
    db_rule = db.query(EventRule).filter(EventRule.id == rule_id, EventRule.project_id == project_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Event rule not found")
        
    db.delete(db_rule)
    db.commit()
    return None
