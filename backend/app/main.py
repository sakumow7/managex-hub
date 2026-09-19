import csv
import io
from datetime import timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import Attachment, AuditEvent, Notification, User, WorkOrder, utcnow
from .schemas import Login, OrderCreate, OrderOut, OrderUpdate, SampleAttachment, UserCreate, UserOut
from .security import DUMMY_HASH, create_token, current_user, is_manager, passwords
from .services import get_order, record, update_order, visible_orders

app = FastAPI(title="ManageX Hub API", version="0.1.0")
SAMPLES = {
    "inspection-checklist": "SAMPLE ONLY — Fictional inspection checklist\n[ ] Inspect exterior\n[ ] Verify signage\n[ ] Record observations\n",
    "maintenance-note": "SAMPLE ONLY — Fictional maintenance note\nLocation: Example facility\nObservation: Demonstration item, no real facility data.\n",
}


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(data: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": create_token(user.id), "token_type": "bearer"}


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@app.get("/api/users", response_model=list[UserOut])
def users(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not is_manager(user):
        raise HTTPException(403, "Supervisor access required")
    return db.scalars(select(User).order_by(User.name)).all()


@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "administrator":
        raise HTTPException(403, "Administrator access required")
    account = User(
        email=data.email.lower(), name=data.name, role=data.role, password_hash=passwords.hash(data.password)
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email already exists") from None
    db.refresh(account)
    return account


def filtered(user, q, status, priority, kind):
    query = visible_orders(user)
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(WorkOrder.title.ilike(pattern), WorkOrder.location.ilike(pattern), WorkOrder.description.ilike(pattern))
        )
    for column, value in [(WorkOrder.status, status), (WorkOrder.priority, priority), (WorkOrder.kind, kind)]:
        if value:
            query = query.where(column == value)
    return query.order_by(WorkOrder.created_at.desc(), WorkOrder.id.desc())


@app.get("/api/work-orders", response_model=list[OrderOut])
def list_orders(
    q: str = "",
    status: str = "",
    priority: str = "",
    kind: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(filtered(user, q, status, priority, kind).offset(offset).limit(limit)).all()


@app.post("/api/work-orders", response_model=OrderOut, status_code=201)
def create_order(data: OrderCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "technician":
        raise HTTPException(403, "Technicians update assigned work; requesters submit work")
    order = WorkOrder(**data.model_dump(), requester_id=user.id)
    db.add(order)
    db.flush()
    record(db, order, user, "created", "Status: submitted — request created")
    managers = db.scalars(select(User).where(User.role.in_(["supervisor", "administrator"]))).all()
    for manager in managers:
        if manager.id != user.id:
            db.add(Notification(user_id=manager.id, message=f"New request WO-{order.id:04d}: {order.title}"))
    db.commit()
    db.refresh(order)
    return order


@app.get("/api/work-orders/{order_id}", response_model=OrderOut)
def read_order(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return get_order(db, user, order_id)


@app.patch("/api/work-orders/{order_id}", response_model=OrderOut)
def patch_order(order_id: int, data: OrderUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return update_order(db, get_order(db, user, order_id), user, data)


@app.get("/api/work-orders/{order_id}/history")
def history(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_order(db, user, order_id)
    return db.scalars(
        select(AuditEvent).where(AuditEvent.work_order_id == order_id).order_by(AuditEvent.id.desc())
    ).all()


@app.get("/api/work-orders/{order_id}/attachments")
def attachments(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_order(db, user, order_id)
    return db.scalars(select(Attachment).where(Attachment.work_order_id == order_id)).all()


@app.post("/api/work-orders/{order_id}/attachments", status_code=201)
def attach(order_id: int, data: SampleAttachment, user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = get_order(db, user, order_id)
    if order.status == "closed":
        raise HTTPException(409, "Closed work orders are read-only")
    existing = db.scalar(
        select(Attachment).where(Attachment.work_order_id == order_id, Attachment.sample_key == data.sample_key)
    )
    if existing:
        raise HTTPException(409, "This sample is already attached")
    attachment = Attachment(
        work_order_id=order_id, filename=f"sample-{data.sample_key}.txt", sample_key=data.sample_key
    )
    db.add(attachment)
    record(db, order, user, "attachment", f"Added {attachment.filename}")
    db.commit()
    db.refresh(attachment)
    return attachment


@app.get("/api/work-orders/{order_id}/attachments/{attachment_id}")
def download(order_id: int, attachment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_order(db, user, order_id)
    attachment = db.get(Attachment, attachment_id)
    if not attachment or attachment.work_order_id != order_id:
        raise HTTPException(404, "Attachment not found")
    return Response(
        SAMPLES[attachment.sample_key],
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{attachment.filename}"'},
    )


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@app.get("/api/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    orders = db.scalars(visible_orders(user)).all()
    active = [o for o in orders if o.status != "closed"]
    durations = [(aware(o.closed_at) - aware(o.created_at)).total_seconds() / 86400 for o in orders if o.closed_at]
    categories = {}
    for order in orders:
        categories[order.category] = categories.get(order.category, 0) + 1
    return {
        "open": len(active),
        "overdue": sum(1 for o in active if o.due_at and aware(o.due_at) < utcnow()),
        "average_completion_days": round(sum(durations) / len(durations), 1) if durations else None,
        "completed": sum(1 for o in orders if o.status in {"completed", "closed"}),
        "categories": categories,
        "recurring_issues": [
            {"category": key, "count": count}
            for key, count in sorted(categories.items(), key=lambda x: -x[1])
            if count > 1
        ],
    }


def csv_safe(value):
    value = str(value) if value is not None else ""
    return (
        "'" + value
        if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")) or value.startswith(("\t", "\r", "\n"))
        else value
    )


@app.get("/api/reports/work-orders.csv")
def export(
    q: str = "",
    status: str = "",
    priority: str = "",
    kind: str = "",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    fields = [
        "id",
        "title",
        "location",
        "category",
        "kind",
        "priority",
        "status",
        "requester_id",
        "assignee_id",
        "due_at",
        "created_at",
        "closed_at",
    ]
    writer.writerow(fields)
    for order in db.scalars(filtered(user, q, status, priority, kind)):
        writer.writerow([csv_safe(getattr(order, field)) for field in fields])
    return Response(
        buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="managex-work-orders.csv"'},
    )


@app.get("/api/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.id.desc()).limit(50)
    ).all()


@app.patch("/api/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(Notification, notification_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    item.read = True
    db.commit()
    return {"ok": True}
