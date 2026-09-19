import { useState } from "react";
import { X } from "lucide-react";
import type { User } from "./types";
import { categories, kinds, label, priorities, teams } from "./domain";
type Props = {
  user: User;
  linked: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
};
export default function TicketForm({
  user,
  linked,
  busy,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [kind, setKind] = useState(linked ? "task" : "support");
  const [team, setTeam] = useState("cst");
  const requester = user.role === "requester";
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <div className="panel-title">
          <h2 id="create-title">
            {linked ? "Create linked task" : "New CST ticket"}
          </h2>
          <button
            aria-label="Close new ticket"
            className="icon-button"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {linked && (
          <p className="muted">
            Give the receiving team its own task. Only information entered below
            is included.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            onSubmit({
              ...data,
              team: kind === "security" ? "cybersecurity" : team,
              kind,
              due_at: data.due_at
                ? new Date(String(data.due_at)).toISOString()
                : null,
            });
          }}
        >
          <label>
            Ticket title
            <input
              autoFocus
              name="title"
              minLength={3}
              maxLength={160}
              required
              placeholder="What is not working?"
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              minLength={5}
              maxLength={10000}
              required
              rows={4}
              placeholder="Describe the problem, who is affected, and steps already tried."
            />
          </label>
          <label>
            Affected device or service
            <input
              name="location"
              minLength={2}
              maxLength={120}
              required
              placeholder="Example: DEMO-LAPTOP or test application"
            />
          </label>
          <div className="form-grid">
            <label>
              Ticket type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(kinds)
                  .filter(
                    ([key]) =>
                      !requester ||
                      ["support", "service_request", "access_request"].includes(
                        key,
                      ),
                  )
                  .map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
              </select>
            </label>
            {!requester && (
              <label>
                Destination team
                <select
                  value={kind === "security" ? "cybersecurity" : team}
                  disabled={kind === "security"}
                  onChange={(e) => setTeam(e.target.value)}
                >
                  {Object.entries(teams).map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
              Target date
              <input name="due_at" type="datetime-local" />
            </label>
          </div>
          {(kind === "security" || team === "cybersecurity") && (
            <p className="restricted-note">
              Restricted to cybersecurity staff and administrators. CST will not
              see the task details after handoff.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {linked ? "Create linked task" : "Create ticket"}
          </button>
        </form>
      </section>
    </div>
  );
}
