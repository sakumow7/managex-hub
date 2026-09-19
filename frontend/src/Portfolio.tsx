import {
  ArrowRight,
  Check,
  Code2,
  Headset,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, json, waitForApi } from "./api";
import {
  personas,
  saveDemo,
  savedDemo,
  sourceUrl,
  type DemoResult,
  type Persona,
} from "./demo";

export default function Portfolio({
  onEnter,
}: {
  onEnter: (result: DemoResult) => Promise<void>;
}) {
  const [persona, setPersona] = useState<Persona>("supervisor");
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [resume, setResume] = useState(() => !!savedDemo());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function enter() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setError("");
    setPhase(
      "Waking the demo server… Free hosting can take about a minute on the first visit.",
    );
    try {
      await waitForApi(request.signal);
      setPhase("Preparing your workspace…");
      const previous = savedDemo();
      let result: DemoResult;
      if (previous) {
        try {
          result = await api<DemoResult>("/demo/switch", {
            ...json("POST", { session_token: previous.session_token, persona }),
            signal: request.signal,
          });
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
          saveDemo(null);
          setResume(false);
          result = await api<DemoResult>("/demo/sessions", {
            ...json("POST", { persona }),
            signal: request.signal,
          });
        }
      } else {
        result = await api<DemoResult>("/demo/sessions", {
          ...json("POST", { persona }),
          signal: request.signal,
        });
      }
      saveDemo(result);
      await onEnter(result);
    } catch (e) {
      if (!request.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not open the demo. Please try again.",
        );
    } finally {
      controller.current = null;
      setPhase("");
    }
  }

  return (
    <main className="portfolio">
      <header className="portfolio-nav">
        <a className="brand" href="#">
          <span className="brand-icon">
            <Headset size={22} />
          </span>
          ManageX<span>Hub</span>
        </a>
        <a
          className="source-link"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Code2 size={16} /> View source <ArrowRight size={14} />
        </a>
      </header>
      <section className="portfolio-hero">
        <div className="portfolio-intro">
          <p className="eyebrow">FULL-STACK PORTFOLIO PROJECT</p>
          <h1>
            Every ticket.
            <br />A clear next step.
          </h1>
          <p className="portfolio-lead">
            An IT service desk built around the work: report an issue, give it
            an owner, and bring the right team into the conversation.
          </p>
          <div className="stack-tags">
            <span>React + TypeScript</span>
            <span>FastAPI + Python</span>
            <span>PostgreSQL</span>
          </div>
          <a className="tour-link" href="#project-details">
            See how it works <ArrowRight size={16} />
          </a>
          <div className="workflow-preview" aria-label="Ticket lifecycle">
            <div>
              <span className="preview-dot" />
              <strong>VPN connection issue</strong>
              <small>Fictional support ticket</small>
            </div>
            <ol>
              <li>
                <Check size={13} /> Submitted
              </li>
              <li>
                <Check size={13} /> Assigned
              </li>
              <li className="current">In progress</li>
              <li>Resolved</li>
            </ol>
            <p>
              <ShieldCheck size={15} /> Public replies. Private notes. Clear
              ownership.
            </p>
          </div>
        </div>
        <section className="demo-launch" aria-labelledby="demo-title">
          <span className="demo-label">
            <span className="sample-dot" /> LIVE, INTERACTIVE DEMO
          </span>
          <h2 id="demo-title">Take a seat at the service desk.</h2>
          <p>
            Choose a perspective. You can switch roles inside your own temporary
            workspace.
          </p>
          <fieldset disabled={!!phase}>
            <legend>Explore as</legend>
            <div className="persona-options">
              {Object.entries(personas).map(([key, item]) => (
                <label
                  className={
                    persona === key
                      ? "persona-option selected"
                      : "persona-option"
                  }
                  key={key}
                >
                  <input
                    type="radio"
                    name="persona"
                    value={key}
                    checked={persona === key}
                    onChange={() => setPersona(key as Persona)}
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="primary full"
            disabled={!!phase}
            onClick={() => void enter()}
          >
            {phase
              ? "Opening demo…"
              : resume
                ? "Continue my demo"
                : "Launch the demo"}
            <ArrowRight size={17} />
          </button>
          {phase && (
            <p role="status" className="launch-status">
              {phase}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="demo-footnote">
            No signup. Fictional data only. Your workspace lasts one hour and is
            separate from other visitors.
          </p>
        </section>
      </section>
      <section className="project-details" id="project-details">
        <div className="project-heading">
          <p className="eyebrow">BEHIND THE INTERFACE</p>
          <h2>
            A workflow you can follow.
            <br />
            Engineering you can inspect.
          </h2>
        </div>
        <div className="project-cards">
          <article>
            <Layers3 />
            <h3>One issue, several teams</h3>
            <p>
              Follow a request from intake to closeout. Create linked
              Development or Operations tasks with their own owners and
              progress.
            </p>
          </article>
          <article>
            <ShieldCheck />
            <h3>Permissions at every layer</h3>
            <p>
              Switch perspectives to see public replies, staff-only notes, and
              restricted Cybersecurity work. The API enforces access on every
              read and update.
            </p>
          </article>
          <article>
            <Code2 />
            <h3>Built to explain</h3>
            <p>
              Typed React components, a Python service layer, versioned database
              migrations, API regression tests, and browser workflow tests.
            </p>
            <a
              href={`${sourceUrl}/blob/main/docs/portfolio.md`}
              target="_blank"
              rel="noreferrer"
            >
              Read the project walkthrough →
            </a>
          </article>
        </div>
        <div className="demo-tour">
          <h3>A three-minute walkthrough</h3>
          <ol>
            <li>Start as Supervisor and assign the printer ticket.</li>
            <li>Switch to CST agent, add a note, and move it into progress.</li>
            <li>Switch to Requester to see their view of the same ticket.</li>
          </ol>
        </div>
      </section>
      <footer className="portfolio-footer">
        <span>ManageX Hub · Portfolio demo</span>
        <span>
          Built for learning and exploration. Use fictional information only.
        </span>
      </footer>
    </main>
  );
}
