import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { api, download, json, setToken } from "./api";
import type {
  Attachment,
  Dashboard,
  Event,
  Notification,
  Order,
  User,
} from "./types";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "No due date";
const statuses = [
  "submitted",
  "assigned",
  "in_progress",
  "completed",
  "closed",
];
const priorities = ["low", "medium", "high", "urgent"];
const categories = ["General", "Electrical", "Plumbing", "HVAC", "Safety"];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Dashboard | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [view, setView] = useState("overview");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Order | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [creating, setCreating] = useState(false);
  const refreshVersion = useRef(0);
  const manager = user?.role === "supervisor" || user?.role === "administrator";
  const filters = new URLSearchParams({
    q,
    status,
    priority,
    kind: view === "inspections" ? "inspection" : "",
  }).toString();

  const refresh = useCallback(async () => {
    if (!user) return;
    const version = ++refreshVersion.current;
    const [items, dashboard, inbox] = await Promise.all([
      api<Order[]>(`/work-orders?${filters}&offset=${page * 20}&limit=20`),
      api<Dashboard>("/dashboard"),
      api<Notification[]>("/notifications"),
    ]);
    if (version !== refreshVersion.current) return;
    setOrders(items);
    setStats(dashboard);
    setNotifications(inbox);
    if (manager) {
      const accounts = await api<User[]>("/users");
      if (version === refreshVersion.current) setUsers(accounts);
    }
  }, [user, manager, filters, page]);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    return () => {
      refreshVersion.current++;
    };
  }, [refresh]);

  useEffect(() => {
    if (!creating && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog
      ?.querySelector<HTMLElement>("input, button, select, textarea")
      ?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreating(false);
        setSelected(null);
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, a[href]",
        ),
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [creating, selected?.id]);

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openOrder(order: Order) {
    const [history, files] = await Promise.all([
      api<Event[]>(`/work-orders/${order.id}/history`),
      api<Attachment[]>(`/work-orders/${order.id}/attachments`),
    ]);
    setEvents(history);
    setAttachments(files);
    setSelected(order);
  }

  async function patch(body: unknown) {
    if (!selected) return;
    const updated = await api<Order>(
      `/work-orders/${selected.id}`,
      json("PATCH", body),
    );
    await openOrder(updated);
    await refresh();
  }

  if (!user)
    return (
      <main className="login-layout">
        <section className="login-story">
          <div className="brand">
            <span className="brand-icon">
              <Wrench size={22} />
            </span>
            ManageX<span>Hub</span>
          </div>
          <div>
            <p className="eyebrow">KEEP GOOD WORK MOVING</p>
            <h1>
              Every request.
              <br />A clear next step.
            </h1>
            <p>
              Bring maintenance requests, inspections, and your team’s next
              actions into one place.
            </p>
            <div className="story-feature">
              <ShieldCheck /> Clear ownership. Visible progress.
            </div>
          </div>
          <small>WORK ORDER & INSPECTION MANAGEMENT</small>
        </section>
        <section className="login-panel">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your workspace</h2>
          <p className="muted">A little clarity goes a long way.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void run(async () => {
                const result = await api<{ access_token: string }>(
                  "/auth/login",
                  json("POST", {
                    email: data.get("email"),
                    password: data.get("password"),
                  }),
                );
                setToken(result.access_token);
                setUser(await api<User>("/auth/me"));
              });
            }}
          >
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                placeholder="supervisor@example.com"
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              Sign in <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-note">
            <strong>Sample workspace</strong>
            <p>
              Use a seeded account: requester, technician, supervisor, or
              administrator @example.com. The password is the DEMO_PASSWORD you
              configured.
            </p>
            <span>Fictional facilities · Sample files only</span>
          </div>
        </section>
      </main>
    );

  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Wrench size={21} />
          </span>
          ManageX<span>Hub</span>
        </div>
        <p className="workspace-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              ["overview", "Overview", LayoutDashboard],
              ["work", "Work orders", ClipboardList],
              ["inspections", "Inspections", ShieldCheck],
              ["notifications", "Notifications", Bell],
            ] as const
          ).map(([key, title, Icon]) => (
            <button
              key={String(key)}
              className={view === key ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(String(key));
                setPage(0);
              }}
            >
              <Icon size={18} />
              {String(title)}
              {key === "notifications" && unread > 0 && (
                <span className="count">{unread}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sample-dot" /> Sample workspace
          <p>
            Built for clarity.
            <br />
            Ready for your next request.
          </p>
        </div>
        <div className="profile">
          <span className="avatar">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </span>
          <div>
            <strong>{user.name}</strong>
            <small>{label(user.role)}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => {
              setToken("");
              setUser(null);
              setSelected(null);
              setStats(null);
              setOrders([]);
              setUsers([]);
              setNotifications([]);
              setCreating(false);
              setError("");
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            <strong>{view === "work" ? "Work orders" : label(view)}</strong>
          </span>
          <span className="environment">DEMO ENVIRONMENT</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">OPERATIONS, IN FOCUS</p>
              <h1>
                {view === "overview"
                  ? "A clear view of the work."
                  : view === "work"
                    ? "Work orders"
                    : label(view)}
              </h1>
              <p className="muted">
                {view === "overview"
                  ? "Know what needs attention. Keep your team moving."
                  : "From the first request to the final check."}
              </p>
            </div>
            {user.role !== "technician" && (
              <button className="primary" onClick={() => setCreating(true)}>
                <Plus size={18} /> New request
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "notifications" ? (
            <section className="panel">
              <div className="panel-title">
                <h2>Your notifications</h2>
                <span>In-app simulation</span>
              </div>
              {notifications.length === 0 && (
                <p className="empty">
                  You’re all caught up. Updates to your work will appear here.
                </p>
              )}
              {notifications.map((n) => (
                <div className="notification" key={n.id}>
                  <Bell size={18} />
                  <div>
                    <strong>{n.message}</strong>
                    <small>{date(n.created_at)}</small>
                  </div>
                  <button
                    disabled={n.read || busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/notifications/${n.id}/read`, {
                          method: "PATCH",
                        });
                        await refresh();
                      })
                    }
                  >
                    {n.read ? "Read" : "Mark as read"}
                  </button>
                </div>
              ))}
            </section>
          ) : (
            <>
              {view === "overview" && stats && (
                <>
                  <section className="metrics" aria-label="Work summary">
                    {(
                      [
                        [
                          "Open work orders",
                          stats.open,
                          "Awaiting final closeout",
                          ClipboardList,
                          "green",
                        ],
                        [
                          "Overdue items",
                          stats.overdue,
                          "Need a closer look",
                          Clock3,
                          "orange",
                        ],
                        [
                          "Avg. completion",
                          stats.average_completion_days === null
                            ? "—"
                            : `${stats.average_completion_days}d`,
                          "Submission to closeout",
                          Activity,
                          "blue",
                        ],
                        [
                          "Completed work",
                          stats.completed,
                          "Completed + closed",
                          CheckCircle2,
                          "green",
                        ],
                      ] as const
                    ).map(([title, value, sub, Icon, color]) => (
                      <article className="metric" key={String(title)}>
                        <div>
                          <span>{String(title)}</span>
                          <span className={`metric-icon ${color}`}>
                            <Icon size={19} />
                          </span>
                        </div>
                        <strong>{value as string | number}</strong>
                        <small>{String(sub)}</small>
                      </article>
                    ))}
                  </section>
                  <section className="insight">
                    <span className="insight-icon">
                      <Activity size={20} />
                    </span>
                    <div>
                      <strong>See the patterns behind the requests</strong>
                      <p>
                        {stats.recurring_issues.length
                          ? stats.recurring_issues
                              .map((i) => `${i.category}: ${i.count} requests`)
                              .join(" · ")
                          : "Recurring categories will appear as more requests arrive."}
                      </p>
                    </div>
                    <span className="tag">ALL-TIME TRENDS</span>
                  </section>
                </>
              )}
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>
                      {view === "inspections"
                        ? "Inspection queue"
                        : "Work order queue"}
                    </h2>
                    <p>Priorities, people, and progress in one place.</p>
                  </div>
                  <button
                    onClick={() =>
                      void run(() =>
                        download(
                          `/reports/work-orders.csv?${filters}`,
                          "managex-work-orders.csv",
                        ),
                      )
                    }
                    disabled={busy}
                  >
                    <ArrowDownToLine size={16} /> Export CSV
                  </button>
                </div>
                <div className="filters">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search work orders"
                      placeholder="Search requests, locations..."
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPage(0);
                      }}
                    />
                  </label>
                  <select
                    aria-label="Filter status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">All statuses</option>
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter priority"
                    value={priority}
                    onChange={(e) => {
                      setPriority(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">All priorities</option>
                    {priorities.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>WORK ORDER</th>
                        <th>STATUS</th>
                        <th>PRIORITY</th>
                        <th>ASSIGNED TO</th>
                        <th>DUE DATE</th>
                        <th aria-label="Open" />
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <button
                              className="order-link"
                              onClick={() => void run(() => openOrder(o))}
                            >
                              <small>
                                WO-{String(o.id).padStart(4, "0")}{" "}
                                <span> / {o.kind}</span>
                              </small>
                              <strong>{o.title}</strong>
                              <span>
                                {o.location} · {o.category}
                              </span>
                            </button>
                          </td>
                          <td>
                            <span className={`badge status-${o.status}`}>
                              <i />
                              {label(o.status)}
                            </span>
                          </td>
                          <td>
                            <span className={`priority priority-${o.priority}`}>
                              <i />
                              {label(o.priority)}
                            </span>
                          </td>
                          <td>
                            {o.assignee_id ? (
                              users.find((u) => u.id === o.assignee_id)?.name ||
                              (user.id === o.assignee_id
                                ? user.name
                                : `Technician #${o.assignee_id}`)
                            ) : (
                              <span className="muted">Unassigned</span>
                            )}
                          </td>
                          <td
                            className={
                              o.status !== "closed" &&
                              o.due_at &&
                              new Date(o.due_at) < new Date()
                                ? "overdue"
                                : ""
                            }
                          >
                            {date(o.due_at)}
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`Open work order ${o.id}`}
                              onClick={() => void run(() => openOrder(o))}
                            >
                              <ArrowRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {orders.length === 0 && (
                    <div className="empty">
                      <ClipboardList size={26} />
                      <h3>No work orders here yet</h3>
                      <p>Create a request or adjust your filters.</p>
                    </div>
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    Showing {orders.length} requests · Page {page + 1}
                  </span>
                  <div>
                    <button
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <button
                      disabled={orders.length < 20}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>ManageX Hub</span> Good work starts with a clear plan.
          </footer>
        </main>
      </div>
      {creating && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <div className="panel-title">
              <h2 id="create-title">New request</h2>
              <button
                aria-label="Close new request"
                className="icon-button"
                onClick={() => setCreating(false)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.currentTarget));
                void run(async () => {
                  await api(
                    "/work-orders",
                    json("POST", {
                      ...data,
                      due_at: data.due_at
                        ? new Date(String(data.due_at)).toISOString()
                        : null,
                    }),
                  );
                  setCreating(false);
                  setPage(0);
                  await refresh();
                });
              }}
            >
              <label>
                Request title
                <input
                  autoFocus
                  name="title"
                  minLength={3}
                  maxLength={160}
                  required
                  placeholder="What needs attention?"
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  minLength={5}
                  maxLength={10000}
                  required
                  rows={3}
                  placeholder="Describe the issue using fictional information only."
                />
              </label>
              <label>
                Location
                <input
                  name="location"
                  minLength={2}
                  maxLength={120}
                  required
                  placeholder="Example facility"
                />
              </label>
              <div className="form-grid">
                <label>
                  Type
                  <select name="kind">
                    <option value="maintenance">Maintenance</option>
                    <option value="inspection">Inspection</option>
                  </select>
                </label>
                <label>
                  Category
                  <select name="category">
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue="medium">
                    {priorities.map((p) => (
                      <option key={p} value={p}>
                        {label(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due date
                  <input name="due_at" type="datetime-local" />
                </label>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary full" disabled={busy}>
                Create request
              </button>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
          >
            <div className="panel-title">
              <span className="eyebrow">
                WO-{String(selected.id).padStart(4, "0")}
              </span>
              <button
                aria-label="Close work order"
                className="icon-button"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <h2 id="detail-title">{selected.title}</h2>
            <p className="muted">
              {selected.location} · {selected.category} · {label(selected.kind)}
            </p>
            <span className={`badge status-${selected.status}`}>
              <i />
              {label(selected.status)}
            </span>
            <p className="description">{selected.description}</p>
            {selected.status !== "closed" && user.role !== "requester" && (
              <form
                key={`${selected.id}-${selected.status}-${selected.assignee_id}-${selected.priority}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const body: Record<string, unknown> = {
                    note: data.get("note"),
                  };
                  if (data.get("status") !== selected.status)
                    body.status = data.get("status");
                  if (manager) {
                    if (data.get("priority") !== selected.priority)
                      body.priority = data.get("priority");
                    if (
                      data.get("assignee_id") &&
                      Number(data.get("assignee_id")) !== selected.assignee_id
                    )
                      body.assignee_id = Number(data.get("assignee_id"));
                  }
                  void run(() => patch(body));
                }}
              >
                <div className="form-grid">
                  {manager && (
                    <>
                      <label>
                        Assign technician
                        <select
                          name="assignee_id"
                          defaultValue={selected.assignee_id || ""}
                        >
                          <option value="">Choose a technician</option>
                          {users
                            .filter((u) => u.role === "technician")
                            .map((u) => (
                              <option value={u.id} key={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Priority
                        <select
                          name="priority"
                          defaultValue={selected.priority}
                        >
                          {priorities.map((p) => (
                            <option key={p} value={p}>
                              {label(p)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    Status
                    <select name="status" defaultValue={selected.status}>
                      {[
                        selected.status,
                        ...({
                          submitted: [],
                          assigned: ["in_progress"],
                          in_progress: ["completed"],
                          completed: manager
                            ? ["closed", "in_progress"]
                            : ["in_progress"],
                        }[selected.status] || []),
                      ].map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Update note
                    <input
                      name="note"
                      maxLength={2000}
                      placeholder="Add a brief progress note"
                    />
                  </label>
                </div>
                <button className="primary" disabled={busy}>
                  Save update
                </button>
              </form>
            )}
            <h3>Sample attachments</h3>
            <div className="attachment-actions">
              {attachments.map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    void run(() =>
                      download(
                        `/work-orders/${selected.id}/attachments/${a.id}`,
                        a.filename,
                      ),
                    )
                  }
                >
                  <ArrowDownToLine size={14} />
                  {a.filename}
                </button>
              ))}
              {selected.status !== "closed" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        `/work-orders/${selected.id}/attachments`,
                        json("POST", {
                          sample_key:
                            selected.kind === "inspection"
                              ? "inspection-checklist"
                              : "maintenance-note",
                        }),
                      );
                      await openOrder(selected);
                    })
                  }
                >
                  <Plus size={14} /> Attach sample file
                </button>
              )}
            </div>
            <small className="muted">
              Only built-in fictional sample files are available.
            </small>
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
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
