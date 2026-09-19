export type Team = "cst" | "cybersecurity" | "development" | "it_operations";
export type User = {
  id: number;
  name: string;
  email: string;
  role: "requester" | "technician" | "supervisor" | "administrator";
  team: Team;
};
export type Order = {
  id: number;
  title: string;
  description: string;
  location: string;
  category: string;
  kind: string;
  team: Team;
  restricted: boolean;
  priority: string;
  status: string;
  requester_id: number;
  assignee_id: number | null;
  due_at: string | null;
  created_at: string;
  closed_at: string | null;
};
export type Dashboard = {
  open: number;
  overdue: number;
  unassigned: number;
  blocked: number;
  my_open: number;
  average_completion_days: number | null;
  completed: number;
  teams: Record<Team, number>;
  categories: Record<string, number>;
  recurring_issues: { category: string; count: number }[];
};
export type Event = {
  id: number;
  action: string;
  detail: string;
  actor_id: number;
  created_at: string;
};
export type Comment = {
  id: number;
  author_id: number;
  body: string;
  internal: boolean;
  created_at: string;
};
export type Attachment = { id: number; filename: string };
export type Notification = {
  id: number;
  work_order_id: number;
  message: string;
  read: boolean;
  created_at: string;
};
