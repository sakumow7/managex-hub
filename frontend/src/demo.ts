export const demoEnabled = import.meta.env.VITE_DEMO_MODE === "true";
export const sourceUrl = "https://github.com/sakumow7/managex-hub";
export const personas = {
  supervisor: {
    title: "Supervisor",
    description: "Triage the queue, assign owners, and close the loop.",
  },
  requester: {
    title: "Requester",
    description: "Report an issue and follow the conversation.",
  },
  technician: {
    title: "CST agent",
    description: "Troubleshoot, leave notes, and coordinate a handoff.",
  },
  cyber: {
    title: "Cybersecurity",
    description: "Explore a restricted team queue.",
  },
  developer: {
    title: "Developer",
    description: "Work on bugs linked to service desk tickets.",
  },
  operations: {
    title: "IT Operations",
    description: "Manage operational tasks and changes.",
  },
};
export type Persona = keyof typeof personas;
export type DemoSession = {
  session_token: string;
  expires_at: string;
  persona: Persona;
};
export type DemoResult = DemoSession & { access_token: string };
const key = "managex-portfolio-session";

export function savedDemo(): DemoSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (
      value &&
      typeof value.session_token === "string" &&
      value.persona in personas &&
      new Date(value.expires_at).getTime() > Date.now()
    )
      return value;
    sessionStorage.removeItem(key);
  } catch {
    /* Storage is optional; an in-memory visit still works. */
  }
  return null;
}

export function saveDemo(value: DemoSession | null) {
  try {
    if (value)
      sessionStorage.setItem(
        key,
        JSON.stringify({
          session_token: value.session_token,
          expires_at: value.expires_at,
          persona: value.persona,
        }),
      );
    else sessionStorage.removeItem(key);
  } catch {
    /* A private browser may block storage. */
  }
}
