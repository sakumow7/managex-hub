from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEvent, Notification, User, WorkOrder, utcnow
from .schemas import OrderUpdate
from .security import is_manager

TRANSITIONS = {
    "submitted": {"assigned"},
    "assigned": {"in_progress"},
    "in_progress": {"completed"},
    "completed": {"closed", "in_progress"},
    "closed": set(),
}


def visible_orders(user):
    query = select(WorkOrder)
    if user.role == "requester":
        query = query.where(WorkOrder.requester_id == user.id)
    elif user.role == "technician":
        query = query.where(WorkOrder.assignee_id == user.id)
    return query


def get_order(db: Session, user: User, order_id: int):
    order = db.scalar(visible_orders(user).where(WorkOrder.id == order_id).with_for_update())
    if order is None:
        raise HTTPException(404, "Work order not found")
    return order


def record(db, order, user, action, detail):
    db.add(AuditEvent(work_order_id=order.id, actor_id=user.id, action=action, detail=detail))
    recipients = {order.requester_id, order.assignee_id} - {None, user.id}
    for recipient in recipients:
        db.add(Notification(user_id=recipient, message=f"WO-{order.id:04d}: {detail}"[:300]))


def update_order(db: Session, order: WorkOrder, user: User, data: OrderUpdate):
    if user.role == "requester":
        raise HTTPException(403, "Requesters cannot update workflow")
    if order.status == "closed":
        raise HTTPException(409, "Closed work orders are read-only")
    changes = []
    if data.priority is not None:
        if not is_manager(user):
            raise HTTPException(403, "Only supervisors or administrators can prioritize")
        if data.priority != order.priority:
            changes.append(f"Priority: {order.priority} → {data.priority}")
            order.priority = data.priority
    if "assignee_id" in data.model_fields_set:
        if not is_manager(user):
            raise HTTPException(403, "Only supervisors or administrators can assign")
        technician = db.get(User, data.assignee_id) if data.assignee_id else None
        if technician is None or technician.role != "technician":
            raise HTTPException(422, "Assign an existing technician")
        if order.status == "completed":
            raise HTTPException(409, "Reopen completed work before reassigning")
        if order.assignee_id != technician.id:
            order.assignee_id = technician.id
            changes.append(f"Assigned to {technician.name}")
        if order.status == "submitted":
            changes.append("Status: submitted → assigned")
            order.status = "assigned"
    if data.status is not None and data.status != order.status:
        if data.status not in TRANSITIONS[order.status]:
            raise HTTPException(409, "Invalid status transition")
        if data.status in {"assigned", "closed"} and not is_manager(user):
            raise HTTPException(403, "Only supervisors or administrators can assign or close")
        if data.status == "assigned" and not order.assignee_id:
            raise HTTPException(422, "Assign a technician first")
        changes.append(f"Status: {order.status} → {data.status}")
        order.status = data.status
        if data.status == "closed":
            order.closed_at = utcnow()
    if data.note.strip():
        changes.append(f"Note: {data.note.strip()}")
    if not changes:
        raise HTTPException(422, "No changes supplied")
    record(db, order, user, "updated", "; ".join(changes))
    db.commit()
    db.refresh(order)
    return order
