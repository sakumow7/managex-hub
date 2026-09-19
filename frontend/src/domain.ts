export const teams = {
  cst: "CST Service Desk",
  cybersecurity: "Cybersecurity",
  development: "Software Development",
  it_operations: "IT Operations",
};
export const kinds = {
  support: "Trouble ticket",
  service_request: "Service request",
  access_request: "Access request",
  security: "Security task",
  bug: "Software bug",
  task: "Department task",
  change: "Change request",
};
export const statuses = [
  "submitted",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "closed",
];
export const priorities = ["low", "medium", "high", "urgent"];
export const categories = [
  "General",
  "Hardware",
  "Software",
  "Network",
  "Access",
  "Email",
  "Security",
  "Systems",
];
export const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const ticketId = (id: number) => `IT-${String(id).padStart(4, "0")}`;
export const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "No due date";
export const roleLabel = (role: string) =>
  role === "technician" ? "Agent" : label(role);
