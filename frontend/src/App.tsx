import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  ClipboardList,
  Clock3,
  Code2,
  Headset,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Plus,
  Search,
  Server,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { api, download, json, setToken } from "./api";
import type {
  Attachment,
  Comment,
  Dashboard,
  Event,
  Notification,
  Order,
  User,
} from "./types";
import {
  date,
  kinds,
  label,
  priorities,
  roleLabel,
  statuses,
  teams,
  ticketId,
} from "./domain";
import TicketForm from "./TicketForm";
import TicketDetail from "./TicketDetail";
import { useDialog } from "./useDialog";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Dashboard | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [view, setView] = useState("cst");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Order | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [related, setRelated] = useState<Order[]>([]);
  const [creating, setCreating] = useState(false);
  const [linkSource, setLinkSource] = useState<Order | null>(null);
  const refreshVersion = useRef(0);
  const closeDialog = useCallback(() => {
    setCreating(false);
    setSelected(null);
    setLinkSource(null);
    setError("");
  }, []);
  useDialog(
    creating
      ? "create"
      : selected
        ? `ticket-${selected.id}-${selected.team}`
        : "",
    closeDialog,
  );
  const staff = user?.role !== "requester";
  const filters = new URLSearchParams({
    q,
    status,
    priority,
    kind,
    team: view in teams ? view : "",
    mine: String(view === "mine"),
  }).toString();
  const refresh = useCallback(async () => {
    if (!user) return;
    const version = ++refreshVersion.current;
    setLoading(true);
    try {
      const [items, dashboard, inbox, people] = await Promise.all([
        api<Order[]>(`/tickets?${filters}&offset=${page * 20}&limit=20`),
        api<Dashboard>("/dashboard"),
        api<Notification[]>("/notifications"),
        user.role === "requester" ? Promise.resolve([]) : api<User[]>("/users"),
      ]);
      if (version !== refreshVersion.current) return;
      setOrders(items);
      setStats(dashboard);
      setNotifications(inbox);
      setUsers(people);
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, [user, filters, page]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    return () => {
      refreshVersion.current++;
    };
  }, [refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openOrder(order: Order) {
    const path = `/tickets/${order.id}`;
    const [fresh, history, files, messages, links] = await Promise.all([
      api<Order>(path),
      api<Event[]>(path + "/history"),
      api<Attachment[]>(path + "/attachments"),
      api<Comment[]>(path + "/comments"),
      api<Order[]>(path + "/related"),
    ]);
    setSelected(fresh);
    setEvents(history);
    setAttachments(files);
    setComments(messages);
    setRelated(links);
  }
  const navigate = (next: string) => {
    setView(next);
    setPage(0);
    setQ("");
    setStatus("");
    setPriority("");
    setKind("");
    setNotice("");
  };
  const signOut = () => {
    refreshVersion.current++;
    setToken("");
    setUser(null);
    closeDialog();
    setStats(null);
    setOrders([]);
    setUsers([]);
    setNotifications([]);
    setNotice("");
  };
  const brand = (
    <div className="brand">
      <span className="brand-icon">
        <Headset size={22} />
      </span>
      ManageX<span>Hub</span>
    </div>
  );
  if (!user)
    return (
      <main className="login-layout">
        <section className="login-story">
          {brand}
          <div>
            <p className="eyebrow">IT SUPPORT, CONNECTED</p>
            <h1>
              From trouble ticket
              <br />
              to resolution.
            </h1>
            <p>
              One place for CST support, team handoffs, and the work behind
              every resolved issue.
            </p>
            <div className="story-feature">
              <ShieldCheck /> Clear ownership. A complete history.
            </div>
          </div>
          <small>INTERNAL IT WORKFLOW PROTOTYPE</small>
        </section>
        <section className="login-panel">
          <p className="eyebrow">YOUR SERVICE DESK</p>
          <h2>Sign in to ManageX</h2>
          <p className="muted">Start with CST. Keep every team in the loop.</p>
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
                const me = await api<User>("/auth/me");
                setUser(me);
                navigate(me.role === "requester" ? "all" : me.team);
              });
            }}
          >
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                placeholder="supervisor@example.com"
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
            <button disabled={busy} className="primary full">
              Sign in <ArrowRight size={16} />
            </button>
          </form>
          <div className="demo-note">
            <strong>Evaluate the CST workflow</strong>
            <p>
              Sign in as supervisor, technician, or requester @example.com with
              your configured demo password.
            </p>
            <p>
              Other demo accounts: cyber, developer, operations, administrator
              @example.com.
            </p>
            <span>Local prototype · Fictional tickets · No billing</span>
          </div>
        </section>
      </main>
    );

  const unread = notifications.filter((n) => !n.read).length;
  const title =
    view in teams
      ? teams[view as keyof typeof teams]
      : {
          all: "All tickets",
          mine: "Assigned to me",
          overview: "Operations overview",
          notifications: "Notifications",
        }[view] || "Tickets";
  const navigation = [
    ["cst", "CST Service Desk", Headset],
    ["mine", "Assigned to me", UserRound],
    ["all", "All tickets", ClipboardList],
    ["overview", "Overview", LayoutDashboard],
    ["cybersecurity", "Cybersecurity", ShieldCheck],
    ["development", "Development", Code2],
    ["it_operations", "IT Operations", Server],
    ["notifications", "Notifications", Bell],
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        {brand}
        <p className="workspace-label">IT WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation
            .filter(
              ([key]) =>
                user.role !== "requester" ||
                ["all", "notifications"].includes(key),
            )
            .map(([key, text, Icon]) => (
              <button
                key={key}
                className={view === key ? "nav-item active" : "nav-item"}
                onClick={() => navigate(key)}
              >
                <Icon size={17} />
                {text}
                {key === "notifications" && unread > 0 && (
                  <span className="count">{unread}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sample-dot" /> Internal prototype
          <p>
            CST trouble tickets.
            <br />
            Connected team workflows.
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
            <small>{roleLabel(user.role)}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            IT workspace <span className="slash">/</span>
            <strong>{title}</strong>
          </span>
          <span className="environment">LOCAL PROTOTYPE</span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SUPPORT THAT MOVES WORK FORWARD</p>
              <h1>{title}</h1>
              <p className="muted">
                {view === "cst"
                  ? "Triage the issue. Assign an owner. Close the loop."
                  : "Every request, owner, and next step in view."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setError("");
                setCreating(true);
              }}
            >
              <Plus size={18} /> New ticket
            </button>
          </div>
          {error && !selected && !creating && (
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
          {notice && (
            <div role="status" className="success-note">
              {notice}
            </div>
          )}
          {view === "notifications" ? (
            <section className="panel">
              <div className="panel-title">
                <h2>Your notifications</h2>
                <span>In-app updates</span>
              </div>
              {!notifications.length && (
                <p className="empty">
                  No new activity. Updates to visible tickets appear here.
                </p>
              )}
              {notifications.map((n) => (
                <div className="notification" key={n.id}>
                  <Bell size={18} />
                  <div>
                    <button
                      className="order-link"
                      onClick={() =>
                        void run(async () =>
                          openOrder(
                            await api<Order>(`/tickets/${n.work_order_id}`),
                          ),
                        )
                      }
                    >
                      {n.message}
                    </button>
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
              {stats && (
                <>
                  <section className="metrics" aria-label="Ticket summary">
                    {(
                      [
                        [
                          "Open tickets",
                          stats.open,
                          "Across your visible queues",
                          ClipboardList,
                          "green",
                        ],
                        [
                          "Unassigned",
                          stats.unassigned,
                          "Ready for triage",
                          UserRound,
                          "blue",
                        ],
                        [
                          "Overdue",
                          stats.overdue,
                          "Past the target date",
                          Clock3,
                          "orange",
                        ],
                        [
                          "Blocked",
                          stats.blocked,
                          "Waiting for the next step",
                          Activity,
                          "blue",
                        ],
                      ] as const
                    ).map(([name, value, caption, Icon, color]) => (
                      <article key={name} className="metric">
                        <div>
                          <span>{name}</span>
                          <span className={`metric-icon ${color}`}>
                            <Icon size={19} />
                          </span>
                        </div>
                        <strong>{value}</strong>
                        <small>{caption}</small>
                      </article>
                    ))}
                  </section>
                  {view === "overview" ? (
                    <div className="team-summary">
                      {Object.entries(teams).map(([key, name]) => (
                        <button key={key} onClick={() => navigate(key)}>
                          <span>{name}</span>
                          <strong>
                            {stats.teams[key as keyof typeof teams]}
                          </strong>
                          <small>visible open tickets</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <section className="insight">
                      <span className="insight-icon">
                        <Headset size={20} />
                      </span>
                      <div>
                        <strong>Start with a clear handoff</strong>
                        <p>
                          Keep the requester updated, capture internal notes,
                          and link tasks for another team.
                        </p>
                      </div>
                      <span className="tag">CST FIRST</span>
                    </section>
                  )}
                </>
              )}
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>{title} queue</h2>
                    <p>Tickets and tasks you have permission to access.</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        download(
                          `/reports/tickets.csv?${filters}`,
                          "managex-tickets.csv",
                        ),
                      )
                    }
                  >
                    <ArrowDownToLine size={16} /> Export CSV
                  </button>
                </div>
                <div className="filters">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search tickets"
                      placeholder="Search tickets, devices, services..."
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
                  <select
                    aria-label="Filter ticket type"
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">All IT types</option>
                    {Object.entries(kinds).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                    <option value="legacy">Legacy maintenance records</option>
                  </select>
                </div>
                <div className="table-wrap" aria-busy={loading}>
                  <table>
                    <thead>
                      <tr>
                        <th>TICKET / SERVICE</th>
                        <th>STATUS</th>
                        <th>PRIORITY</th>
                        <th>OWNER / TEAM</th>
                        <th>TARGET DATE</th>
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
                                {ticketId(o.id)} /{" "}
                                {kinds[o.kind as keyof typeof kinds] ||
                                  label(o.kind)}{" "}
                                {o.restricted && <LockKeyhole size={10} />}
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
                            <span>
                              {users.find((u) => u.id === o.assignee_id)
                                ?.name ||
                                (o.assignee_id
                                  ? `Agent #${o.assignee_id}`
                                  : "Unassigned")}
                            </span>
                            <small className="muted">{teams[o.team]}</small>
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
                              aria-label={`Open ticket ${o.id}`}
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
                      <h3>
                        {loading
                          ? "Loading tickets…"
                          : "No visible tickets in this queue"}
                      </h3>
                      <p>
                        Try another filter or create a ticket. Restricted work
                        is only shown to authorized teams.
                      </p>
                    </div>
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    {loading
                      ? "Refreshing…"
                      : `Showing ${orders.length} tickets · Page ${page + 1}`}
                  </span>
                  <div>
                    <button
                      disabled={!page || loading}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <button
                      disabled={orders.length < 20 || loading}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => void run(refresh)}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>ManageX Hub · IT workflow prototype</span>Fictional evaluation
            data
          </footer>
        </main>
      </div>
      {creating && (
        <TicketForm
          user={user}
          linked={!!linkSource}
          busy={busy}
          error={error}
          onClose={closeDialog}
          onSubmit={(data) =>
            void run(async () => {
              if (linkSource) {
                const result = await api<{ id: number; visible: boolean }>(
                  `/tickets/${linkSource.id}/tasks`,
                  json("POST", data),
                );
                setNotice(
                  result.visible
                    ? "Linked task created. The receiving team can work it independently."
                    : "Restricted task delivered to Cybersecurity. Its details are visible only to cybersecurity staff and administrators.",
                );
              } else {
                const result = await api<Order>("/tickets", json("POST", data));
                setNotice(
                  result.restricted &&
                    user.team !== "cybersecurity" &&
                    user.role !== "administrator"
                    ? "Restricted task delivered to Cybersecurity."
                    : `${ticketId(result.id)} created. Find it in the destination team's queue.`,
                );
              }
              setCreating(false);
              setLinkSource(null);
              setPage(0);
              await refresh();
            })
          }
        />
      )}
      {selected && !creating && (
        <TicketDetail
          key={`${selected.id}-${selected.team}`}
          ticket={selected}
          user={user}
          users={users}
          events={events}
          comments={comments}
          attachments={attachments}
          related={related}
          busy={busy}
          error={error}
          onClose={closeDialog}
          onPatch={(body) =>
            void run(async () => {
              const ticket = await api<Order>(
                `/tickets/${selected.id}`,
                json("PATCH", body),
              );
              await openOrder(ticket);
              await refresh();
            })
          }
          onReply={async (body, internal) => {
            setBusy(true);
            setError("");
            try {
              await api(
                `/tickets/${selected.id}/comments`,
                json("POST", { body, internal }),
              );
              await openOrder(selected);
              await refresh();
            } catch (e) {
              setError((e as Error).message);
              throw e;
            } finally {
              setBusy(false);
            }
          }}
          onLink={() => {
            setLinkSource(selected);
            setSelected(null);
            setCreating(true);
            setError("");
          }}
          onOpen={(ticket) => void run(() => openOrder(ticket))}
          onDownload={(file) =>
            void run(() =>
              download(
                `/tickets/${selected.id}/attachments/${file.id}`,
                file.filename,
              ),
            )
          }
          onAttach={() =>
            void run(async () => {
              await api(
                `/tickets/${selected.id}/attachments`,
                json("POST", {
                  sample_key:
                    selected.kind === "change"
                      ? "change-checklist"
                      : "troubleshooting-note",
                }),
              );
              await openOrder(selected);
            })
          }
        />
      )}
    </div>
  );
}
