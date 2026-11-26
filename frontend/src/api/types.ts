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
}

export interface Employee {
  public_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  job_title?: string | null;
  employment_status: string;
  department?: string | null;
  department_name?: string | null;
  role_name?: string | null;
  user_details?: {
    username?: string;
    email?: string;
    role?: Role | string | null;
  };
}

export interface Project {
  public_id: string;
  name: string;
  description?: string | null;
  status: string;
  start_date: string;
  end_date?: string | null;
  manager_details?: Employee | null;
}

export interface Task {
  public_id: string;
  project: string;
  assigned_to_details?: Employee | null;
  title: string;
  description?: string | null;
  deadline?: string | null;
  status: string;
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
  employee_name: string;
  leave_type: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  duration?: number;
  reason: string;
  status: string;
  reviewer_comment?: string;
}

export interface ExpenseCategory {
  public_id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface Expense {
  public_id: string;
  employee_name?: string;
  category: string;
  category_name?: string;
  amount: string | number;
  expense_date: string;
  description: string;
  status: string;
  submitted_at?: string;
  remarks?: string | null;
}

export interface Company {
  public_id: string;
  name: string;
  registration_number?: string;
  contact_email?: string;
}

export interface Branch {
  public_id: string;
  name: string;
  company_name?: string;
  location?: string;
}

export interface Department {
  public_id: string;
  name: string;
  branch_name?: string;
  company_name?: string;
}
