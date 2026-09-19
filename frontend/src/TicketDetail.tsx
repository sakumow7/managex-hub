import {
  ArrowDownToLine,
  ArrowRight,
  LockKeyhole,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import type { Attachment, Comment, Event, Order, User } from "./types";
import { date, kinds, label, priorities, teams, ticketId } from "./domain";
type Props = {
  ticket: Order;
  user: User;
  users: User[];
  events: Event[];
  comments: Comment[];
  attachments: Attachment[];
  related: Order[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onPatch: (data: unknown) => void;
  onReply: (body: string, internal: boolean) => Promise<void>;
  onLink: () => void;
  onOpen: (ticket: Order) => void;
  onDownload: (file: Attachment) => void;
  onAttach: () => void;
};
export default function TicketDetail(p: Props) {
  const {
    ticket,
    user,
    users,
    events,
    comments,
    attachments,
    related,
    busy,
    error,
  } = p;
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const manager = ["supervisor", "administrator"].includes(user.role);
  const staff = user.role !== "requester";
  const canWork = manager || (staff && user.team === ticket.team);
  const [assignmentTeam, setAssignmentTeam] = useState(ticket.team);
  const options: Record<string, string[]> = {
    submitted: [],
    assigned: ["in_progress", "blocked"],
    in_progress: ["blocked", "completed"],
    blocked: ["in_progress"],
    completed: manager ? ["closed", "in_progress"] : ["in_progress"],
  };
  return (
    <div className="modal-backdrop">
      <section
        className="modal detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <div className="panel-title">
          <span className="eyebrow">
            {ticketId(ticket.id)} ·{" "}
            {kinds[ticket.kind as keyof typeof kinds] || label(ticket.kind)}
          </span>
          <button
            className="icon-button"
            aria-label="Close ticket"
            onClick={p.onClose}
          >
            <X />
          </button>
        </div>
        <h2 id="detail-title">{ticket.title}</h2>
        <p className="muted">
          {ticket.location} · {ticket.category} · {teams[ticket.team]}
        </p>
        <div className="detail-badges">
          <span className={`badge status-${ticket.status}`}>
            <i />
            {label(ticket.status)}
          </span>
          <span className={`priority priority-${ticket.priority}`}>
            {label(ticket.priority)} priority
          </span>
          {ticket.restricted && (
            <span className="restricted-note">
              <LockKeyhole size={13} /> Restricted
            </span>
          )}
        </div>
        <div className="ticket-meta">
          <span>
            Owner:{" "}
            <strong>
              {users.find((u) => u.id === ticket.assignee_id)?.name ||
                (ticket.assignee_id
                  ? `Agent #${ticket.assignee_id}`
                  : "Unassigned")}
            </strong>
          </span>
          <span>
            Target: <strong>{date(ticket.due_at)}</strong>
          </span>
        </div>
        <p className="description">{ticket.description}</p>
        {canWork && ticket.status !== "closed" && (
          <form
            key={`${ticket.id}-${ticket.status}-${ticket.assignee_id}-${ticket.priority}-${ticket.team}`}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const body: Record<string, unknown> = { note: data.get("note") };
              if (data.get("status") !== ticket.status)
                body.status = data.get("status");
              if (manager) {
                if (data.get("priority") !== ticket.priority)
                  body.priority = data.get("priority");
                if (assignmentTeam !== ticket.team) body.team = assignmentTeam;
                if (
                  data.get("assignee_id") &&
                  Number(data.get("assignee_id")) !== ticket.assignee_id
                )
                  body.assignee_id = Number(data.get("assignee_id"));
              }
              p.onPatch(body);
            }}
          >
            <h3 className="form-heading">Triage & progress</h3>
            <div className="form-grid">
              {manager && (
                <>
                  <label>
                    Owning team
                    <select
                      aria-label="Owning team"
                      value={assignmentTeam}
                      disabled={
                        ticket.restricted || ticket.status === "completed"
                      }
                      onChange={(e) =>
                        setAssignmentTeam(e.target.value as Order["team"])
                      }
                    >
                      {Object.entries(teams)
                        .filter(
                          ([key]) =>
                            key !== "cybersecurity" || ticket.restricted,
                        )
                        .map(([key, title]) => (
                          <option key={key} value={key}>
                            {title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Assign agent
                    <select
                      name="assignee_id"
                      key={assignmentTeam}
                      defaultValue={
                        assignmentTeam === ticket.team
                          ? ticket.assignee_id || ""
                          : ""
                      }
                    >
                      <option value="">Choose an agent</option>
                      {users
                        .filter(
                          (u) =>
                            u.role === "technician" &&
                            u.team === assignmentTeam,
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select name="priority" defaultValue={ticket.priority}>
                      {priorities.map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label>
                Status
                <select name="status" defaultValue={ticket.status}>
                  {[ticket.status, ...(options[ticket.status] || [])].map(
                    (s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Internal update note
                <input
                  name="note"
                  maxLength={2000}
                  placeholder="Staff-only troubleshooting notes"
                />
              </label>
            </div>
            {assignmentTeam !== ticket.team && (
              <small className="muted">
                Transferring clears the previous owner and returns the ticket to
                triage.
              </small>
            )}
            <button className="primary" disabled={busy}>
              Save update
            </button>
          </form>
        )}
        <h3>Conversation</h3>
        <div className="conversation">
          {comments.length === 0 && <p className="muted">No replies yet.</p>}
          {comments.map((c) => (
            <article
              key={c.id}
              className={c.internal ? "comment internal" : "comment"}
            >
              <div>
                <strong>
                  {users.find((u) => u.id === c.author_id)?.name ||
                    (user.id === c.author_id ? user.name : "Support team")}
                </strong>
                <span>
                  {c.internal ? "Internal note" : "Requester-visible reply"} ·{" "}
                  {date(c.created_at)}
                </span>
              </div>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
        {ticket.status !== "closed" && (
          <form
            className="reply-form"
            onSubmit={(e) => {
              e.preventDefault();
              void p
                .onReply(reply, internal)
                .then(() => setReply(""))
                .catch(() => {});
            }}
          >
            <label>
              {internal ? "Internal note" : "Reply"}
              <textarea
                aria-label="Message"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                minLength={1}
                maxLength={5000}
                rows={3}
                required
                placeholder={
                  internal
                    ? "Only staff with ticket access can read this."
                    : "Visible to the requester and staff with ticket access."
                }
              />
            </label>
            <div className="reply-actions">
              {staff && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />{" "}
                  Internal note
                </label>
              )}
              <button className="primary" disabled={busy || !reply.trim()}>
                Post message
              </button>
            </div>
          </form>
        )}
        {staff && (
          <>
            <div className="section-heading">
              <h3>Linked tickets & tasks</h3>
              {canWork && ticket.status !== "closed" && (
                <button onClick={p.onLink} disabled={busy}>
                  <Plus size={14} /> Create linked task
                </button>
              )}
            </div>
            <div className="related-list">
              {related.map((t) => (
                <button key={t.id} onClick={() => p.onOpen(t)}>
                  <span>
                    <small>
                      {ticketId(t.id)} · {teams[t.team]} · {label(t.status)}
                    </small>
                    {t.title}
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
            <small className="muted">
              Only linked records you can access appear here. Linked tasks have
              independent status.
            </small>
          </>
        )}
        <h3>Sample attachments</h3>
        <div className="attachment-actions">
          {attachments.map((a) => (
            <button key={a.id} onClick={() => p.onDownload(a)}>
              <ArrowDownToLine size={14} />
              {a.filename}
            </button>
          ))}
          {ticket.status !== "closed" && (
            <button disabled={busy} onClick={p.onAttach}>
              <Plus size={14} /> Attach sample file
            </button>
          )}
        </div>
        {staff && (
          <>
            <h3>Activity & status history</h3>
            <div className="timeline">
              {events.map((event) => (
                <div key={event.id}>
                  <span className="timeline-dot" />
                  <strong>{event.detail}</strong>
                  <small>
                    {date(event.created_at)} ·{" "}
                    {users.find((u) => u.id === event.actor_id)?.name ||
                      `User #${event.actor_id}`}
                  </small>
                </div>
              ))}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
