export type Todo = {
  id: string;
  title: string;
  notes: string | null;
  importance: number;
  estimate_minutes: number | null;
  due_at: string | null;
  is_done: boolean;
  created_at: string;
  parent_id: string | null;
};

export type DailyPlan = {
  day: string;
  recommended_todo_id: string | null;
  headline: string;
  rationale: string;
  context_summary: string;
  email_id: string | null;
  created_at: string;
};
