export interface ApiList<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
  data?: T[];
}

export type ApiListResponse<T> = T[] | ApiList<T>;

export interface Role {
  public_id?: string;
  role_name: string;
}

export interface UserProfile {
  public_id: string;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role_name: string;
  role?: Role | string | null;
  is_superuser?: boolean;
  employee_public_id?: string | null;
  department_name?: string | null;
  job_title?: string | null;
  employment_status?: string | null;
  hire_date?: string | null;
  phone?: string | null;
  manager?: string | null;
}

export interface UserAccount {
  public_id: string;
  username: string;
  email?: string;
  role?: string | null;
  role_name?: string | null;
  is_active?: boolean;
}

export interface Employee {
  public_id: string;
  employee_code?: string | null;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string | null;
  hire_date?: string | null;
  job_title?: string | null;
  employment_status: string;
  resignation_date?: string | null;
  department?: string | null;
  department_name?: string | null;
  branch?: string | null;
  branch_name?: string | null;
  company?: string | null;
  company_name?: string | null;
  manager?: string | null;
  manager_name?: string | null;
  is_manager?: boolean;
  is_branch_manager?: boolean;
  is_department_head?: boolean;
  subordinates_count?: number;
  role_name?: string | null;
  user_details?: {
    public_id?: string;
    username?: string;
    email?: string;
    is_active?: boolean;
    role?: Role | string | null;
    role_name?: string | null;
  };
}

export interface Project {
  public_id: string;
  name: string;
  description?: string | null;
  status: string;
  start_date: string;
  end_date?: string | null;
  manager?: string | null;
  manager_details?: Employee | null;
  created_at?: string;
  updated_at?: string;
}

export interface Task {
  public_id: string;
  project: string;
  assigned_to?: string | null;
  assigned_to_details?: Employee | null;
  title: string;
  description?: string | null;
  deadline?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface Asset {
  public_id: string;
  asset_name: string;
  category: string;
  serial_number?: string | null;
  purchase_date?: string | null;
  status: string;
}

export interface AssetAllocation {
  public_id: string;
  asset: string;
  employee: string;
  allocation_date: string;
  return_date?: string | null;
  status: string;
}

export interface AssetHistory {
  public_id: string;
  asset: string;
  employee?: string | null;
  event_type: string;
  event_date: string;
  remarks?: string | null;
}

export interface LeaveType {
  public_id: string;
  name: string;
  is_active: boolean;
  is_paid?: boolean;
}

export interface LeaveRequest {
  public_id: string;
  employee?: string | number | null;
  employee_name: string;
  leave_type: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  duration?: number;
  reason: string;
  status: string;
  reviewed_by?: string | number | null;
  reviewer_comment?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
}

export interface AttendanceRecord {
  id: number;
  employee: string | number;
  employee_name: string;
  work_date: string;
  check_in?: string | null;
  check_out?: string | null;
  status: string;
  notes?: string;
  worked_minutes?: number | null;
  created_by?: string | number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseCategory {
  public_id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface Expense {
  public_id: string;
  employee?: string;
  employee_name?: string;
  category: string;
  category_name?: string;
  amount: string | number;
  expense_date: string;
  description: string;
  receipt?: string | null;
  status: string;
  submitted_at?: string;
  approved_at?: string | null;
  approved_by_name?: string | null;
  remarks?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Company {
  public_id: string;
  name: string;
  registration_number?: string;
  contact_email?: string;
  address?: string;
  creation_reason?: string;
}

export interface Branch {
  public_id: string;
  company?: string;
  name: string;
  company_name?: string;
  location?: string;
  contact_phone?: string;
  creation_reason?: string;
  manager?: string | null;
  manager_name?: string | null;
  manager_email?: string | null;
}

export interface Department {
  public_id: string;
  name: string;
  branch?: string;
  branch_name?: string;
  company?: string;
  company_name?: string;
  description?: string;
  head?: string | null;
  head_name?: string | null;
  head_email?: string | null;
}

export interface ReviewCycle {
  public_id: string;
  period_type: 'QUARTERLY' | 'ANNUAL' | string;
  period_label: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
}

export interface PerformanceMetric {
  public_id?: string;
  metric_name: string;
  target: string | number;
  actual: string | number;
  weight: number;
}

export interface Scorecard {
  public_id: string;
  employee: string;
  employee_name: string;
  cycle: string;
  cycle_label: string;
  reviewer?: string | null;
  reviewer_name?: string | null;
  goals: string;
  rating?: number | null;
  rating_label?: string | null;
  status: string;
  submitted_at?: string | null;
  metrics?: PerformanceMetric[];
}

export interface Team {
  public_id: string;
  name: string;
  department?: string;
  department_name?: string;
  branch_name?: string;
  company_name?: string;
}
