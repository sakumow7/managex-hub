from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import AuditEvent, Comment, Notification, User, WorkOrder, utcnow
from .schemas import OrderCreate, OrderUpdate
from .security import is_manager

TRANSITIONS = {
    "submitted": {"assigned"},
    "assigned": {"in_progress", "blocked"},
    "in_progress": {"completed", "blocked"},
    "blocked": {"in_progress"},
    "completed": {"closed", "in_progress"},
    "closed": set(),
}


def security_access(user):
    return user.role == "administrator" or (user.team == "cybersecurity" and user.role != "requester")


def visible_orders(user):
    query = select(WorkOrder).where(WorkOrder.demo_workspace_id == user.demo_workspace_id)
    if not security_access(user):
        query = query.where(WorkOrder.restricted.is_(False))
    if user.role == "requester":
        query = query.where(WorkOrder.requester_id == user.id)
    elif user.role == "technician":
        query = query.where(or_(WorkOrder.team == user.team, WorkOrder.requester_id == user.id))
    return query


def get_order(db: Session, user: User, order_id: int):
    order = db.scalar(visible_orders(user).where(WorkOrder.id == order_id).with_for_update())
    if order is None:
        raise HTTPException(404, "Ticket not found")
    return order


def can_work(user, order):
    return is_manager(user) or (user.role == "technician" and order.team == user.team)


def notify(db, order, recipients):
    for recipient in set(recipients) - {None}:
        person = db.get(User, recipient)
        if person and db.scalar(visible_orders(person).where(WorkOrder.id == order.id)):
            db.add(
                Notification(
                    user_id=recipient, work_order_id=order.id, message=f"IT-{order.id:04d}: ticket activity updated"
                )
            )


def record(db, order, user, action, detail):
    db.add(AuditEvent(work_order_id=order.id, actor_id=user.id, action=action, detail=detail))
    notify(db, order, {order.requester_id, order.assignee_id} - {user.id})


def new_order(db: Session, user: User, data: OrderCreate):
    if user.role == "requester" and (
        data.team != "cst" or data.kind not in {"support", "service_request", "access_request"}
    ):
        raise HTTPException(403, "Submit requests to CST; staff handle team routing")
    values = data.model_dump()
    if data.kind == "security":
        values["team"] = "cybersecurity"
    order = WorkOrder(
        **values,
        restricted=values["team"] == "cybersecurity",
        requester_id=user.id,
        demo_workspace_id=user.demo_workspace_id,
    )
    db.add(order)
    db.flush()
    record(db, order, user, "created", "Status: submitted — ticket created")
    recipients = db.scalars(
        select(User.id).where(
            User.demo_workspace_id == user.demo_workspace_id,
            User.role != "requester",
            or_(User.team == order.team, User.role == "administrator"),
        )
    ).all()
    notify(db, order, set(recipients) - {user.id})
    return order


def update_order(db: Session, order: WorkOrder, user: User, data: OrderUpdate):
    if not can_work(user, order):
        raise HTTPException(403, "Only the owning team or a supervisor can update workflow")
    if order.status == "closed":
        raise HTTPException(409, "Closed tickets are read-only")
    changes = []
    if data.priority is not None:
        if not is_manager(user):
            raise HTTPException(403, "Only supervisors or administrators can prioritize")
        if data.priority != order.priority:
            changes.append(f"Priority: {order.priority} → {data.priority}")
            order.priority = data.priority
    if data.team is not None and data.team != order.team:
        if not is_manager(user):
            raise HTTPException(403, "Only supervisors or administrators can transfer tickets")
        if order.restricted or data.team == "cybersecurity":
            raise HTTPException(422, "Create a separate restricted cybersecurity task instead of transferring")
        if order.status == "completed":
            raise HTTPException(409, "Reopen completed work before transferring")
        changes.append(f"Team: {order.team} → {data.team}; status reset to submitted; assignee cleared")
        order.team, order.assignee_id, order.status = data.team, None, "submitted"
    if "assignee_id" in data.model_fields_set:
        if not is_manager(user):
            raise HTTPException(403, "Only supervisors or administrators can assign")
        technician = db.get(User, data.assignee_id) if data.assignee_id else None
        if (
            technician is None
            or technician.role != "technician"
            or technician.team != order.team
            or technician.demo_workspace_id != user.demo_workspace_id
        ):
            raise HTTPException(422, "Assign an existing agent in the ticket's team")
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
            raise HTTPException(422, "Assign an agent first")
        changes.append(f"Status: {order.status} → {data.status}")
        order.status = data.status
        if data.status == "closed":
            order.closed_at = utcnow()
    if data.note.strip():
        db.add(Comment(work_order_id=order.id, author_id=user.id, body=data.note.strip(), internal=True))
        changes.append("Internal note added")
    if not changes:
        raise HTTPException(422, "No changes supplied")
    record(db, order, user, "updated", "; ".join(changes))
    db.commit()
    db.refresh(order)
    return order
