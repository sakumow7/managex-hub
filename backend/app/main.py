import csv
import io
from datetime import timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .config import settings
from .demo import router as demo_router
from .models import Attachment, AuditEvent, Comment, Notification, TicketLink, User, WorkOrder, utcnow
from .schemas import CommentCreate, Login, OrderCreate, OrderOut, OrderUpdate, SampleAttachment, UserCreate, UserOut
from .security import DUMMY_HASH, create_token, current_user, passwords
from .services import can_work, get_order, new_order, record, update_order, visible_orders

app = FastAPI(title="ManageX Hub Portfolio API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings().cors_origins,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(demo_router)


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


SAMPLES = {
    "troubleshooting-note": "SAMPLE ONLY — CST troubleshooting record\nDevice: DEMO-LAPTOP\nObserved: Fictional VPN error\nAction: Verify client version and record the result.\n",
    "change-checklist": "SAMPLE ONLY — IT change checklist\n[ ] Document test result\n[ ] Confirm review\n[ ] Record rollback steps\n",
    "inspection-checklist": "SAMPLE ONLY — Fictional inspection checklist\n[ ] Inspect exterior\n[ ] Verify signage\n[ ] Record observations\n",
    "maintenance-note": "SAMPLE ONLY — Fictional maintenance note\nLocation: Example facility\nObservation: Demonstration item, no real facility data.\n",
}


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/live")
def live():
    # Platform probes must not keep a scale-to-zero database awake all day.
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(data: Login, db: Session = Depends(get_db)):
    if settings().demo_enabled:
        raise HTTPException(403, "Use the portfolio role selector to start your own demo.")
    user = db.scalar(select(User).where(User.email == data.email.strip().lower(), User.demo_workspace_id.is_(None)))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": create_token(user.id), "token_type": "bearer"}


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@app.get("/api/users", response_model=list[UserOut])
def users(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "requester":
        raise HTTPException(403, "Staff access required")
    return db.scalars(select(User).where(User.demo_workspace_id == user.demo_workspace_id).order_by(User.name)).all()


@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if settings().demo_enabled:
        raise HTTPException(403, "Account creation is disabled in the public demo")
    if user.role != "administrator":
        raise HTTPException(403, "Administrator access required")
    account = User(
        email=data.email.lower(),
        name=data.name,
        role=data.role,
        team=data.team,
        password_hash=passwords.hash(data.password),
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email already exists") from None
    db.refresh(account)
    return account


def filtered(user, q, status, priority, kind, team="", mine=False):
    query = visible_orders(user)
    if kind != "legacy":
        query = query.where(WorkOrder.kind.not_in(["maintenance", "inspection"]))
    else:
        query = query.where(WorkOrder.kind.in_(["maintenance", "inspection"]))
        kind = ""
    if team:
        query = query.where(WorkOrder.team == team)
    if mine:
        query = query.where(WorkOrder.assignee_id == user.id)
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(WorkOrder.title.ilike(pattern), WorkOrder.location.ilike(pattern), WorkOrder.description.ilike(pattern))
        )
    for column, value in [(WorkOrder.status, status), (WorkOrder.priority, priority), (WorkOrder.kind, kind)]:
        if value:
            query = query.where(column == value)
    return query.order_by(WorkOrder.created_at.desc(), WorkOrder.id.desc())


@app.get("/api/tickets", response_model=list[OrderOut])
def list_orders(
    q: str = "",
    status: str = "",
    priority: str = "",
    kind: str = "",
    team: str = "",
    mine: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(filtered(user, q, status, priority, kind, team, mine).offset(offset).limit(limit)).all()


@app.post("/api/tickets", response_model=OrderOut, status_code=201)
def create_order(data: OrderCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = new_order(db, user, data)
    db.commit()
    db.refresh(order)
    return order


@app.get("/api/tickets/{order_id}", response_model=OrderOut)
def read_order(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return get_order(db, user, order_id)


@app.patch("/api/tickets/{order_id}", response_model=OrderOut)
def patch_order(order_id: int, data: OrderUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return update_order(db, get_order(db, user, order_id), user, data)


@app.get("/api/tickets/{order_id}/history")
def history(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_order(db, user, order_id)
    # Legacy audit entries may contain notes predating the public/internal split.
    if user.role == "requester":
        return []
    return db.scalars(
        select(AuditEvent).where(AuditEvent.work_order_id == order_id).order_by(AuditEvent.id.desc())
    ).all()


@app.get("/api/tickets/{order_id}/attachments")
def attachments(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_order(db, user, order_id)
    return db.scalars(select(Attachment).where(Attachment.work_order_id == order_id)).all()


@app.post("/api/tickets/{order_id}/attachments", status_code=201)
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


@app.get("/api/tickets/{order_id}/attachments/{attachment_id}")
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
    orders = db.scalars(visible_orders(user).where(WorkOrder.kind.not_in(["maintenance", "inspection"]))).all()
    active = [o for o in orders if o.status != "closed"]
    durations = [(aware(o.closed_at) - aware(o.created_at)).total_seconds() / 86400 for o in orders if o.closed_at]
    categories = {}
    for order in orders:
        categories[order.category] = categories.get(order.category, 0) + 1
    return {
        "unassigned": sum(1 for o in active if o.assignee_id is None),
        "blocked": sum(1 for o in active if o.status == "blocked"),
        "my_open": sum(1 for o in active if o.assignee_id == user.id),
        "teams": {
            team: sum(1 for o in active if o.team == team)
            for team in ["cst", "cybersecurity", "development", "it_operations"]
        },
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


@app.get("/api/reports/tickets.csv")
def export(
    q: str = "",
    status: str = "",
    priority: str = "",
    kind: str = "",
    team: str = "",
    mine: bool = False,
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
        "team",
        "restricted",
        "priority",
        "status",
        "requester_id",
        "assignee_id",
        "due_at",
        "created_at",
        "closed_at",
    ]
    writer.writerow(fields)
    for order in db.scalars(filtered(user, q, status, priority, kind, team, mine)):
        writer.writerow([csv_safe(getattr(order, field)) for field in fields])
    return Response(
        buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="managex-tickets.csv"'},
    )


@app.get("/api/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    visible_ids = visible_orders(user).with_only_columns(WorkOrder.id)
    return db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id, Notification.work_order_id.in_(visible_ids))
        .order_by(Notification.id.desc())
        .limit(50)
    ).all()


@app.patch("/api/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(Notification, notification_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    if item.work_order_id is None:
        raise HTTPException(404, "Notification not found")
    get_order(db, user, item.work_order_id)
    item.read = True
    db.commit()
    return {"ok": True}


@app.get("/api/tickets/{order_id}/comments")
def comments(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_order(db, user, order_id)
    query = select(Comment).where(Comment.work_order_id == order_id)
    if user.role == "requester":
        query = query.where(Comment.internal.is_(False))
    return db.scalars(query.order_by(Comment.id)).all()


@app.post("/api/tickets/{order_id}/comments", status_code=201)
def add_comment(order_id: int, data: CommentCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = get_order(db, user, order_id)
    if order.status == "closed":
        raise HTTPException(409, "Closed tickets are read-only")
    if data.internal and user.role == "requester":
        raise HTTPException(403, "Only staff may write internal notes")
    comment = Comment(work_order_id=order_id, author_id=user.id, **data.model_dump())
    db.add(comment)
    record(db, order, user, "comment", "Internal note added" if data.internal else "Requester-visible reply added")
    db.commit()
    db.refresh(comment)
    return comment


@app.get("/api/tickets/{order_id}/related", response_model=list[OrderOut])
def related(order_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_order(db, user, order_id)
    # No hidden titles, identifiers, counts or status leak through links.
    linked = (
        select(TicketLink.target_id)
        .where(TicketLink.source_id == order_id)
        .union(select(TicketLink.source_id).where(TicketLink.target_id == order_id))
    )
    return db.scalars(visible_orders(user).where(WorkOrder.id.in_(linked))).all()


@app.post("/api/tickets/{order_id}/tasks", status_code=201)
def create_task(order_id: int, data: OrderCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    source = get_order(db, user, order_id)
    if user.role == "requester" or not can_work(user, source):
        raise HTTPException(403, "Owning team or supervisor access required")
    if source.status == "closed":
        raise HTTPException(409, "Closed tickets are read-only")
    target = new_order(db, user, data)
    db.add(TicketLink(source_id=source.id, target_id=target.id))
    record(db, source, user, "linked", "Related task created; visibility follows the destination team's access rules")
    target_id = target.id
    db.commit()
    return {"id": target_id, "visible": db.scalar(visible_orders(user).where(WorkOrder.id == target_id)) is not None}
