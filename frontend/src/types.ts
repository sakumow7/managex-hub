export type User = {
  id: number;
  name: string;
  email: string;
  role: "requester" | "technician" | "supervisor" | "administrator";
};
export type Order = {
  id: number;
  title: string;
  description: string;
  location: string;
  category: string;
  kind: string;
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
  average_completion_days: number | null;
  completed: number;
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
export type Attachment = { id: number; filename: string };
export type Notification = {
  id: number;
  message: string;
  read: boolean;
  created_at: string;
};
