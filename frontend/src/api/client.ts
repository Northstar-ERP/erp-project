import api from './axios';
import type {
  ApiListResponse,
  AttendanceRecord,
  Asset,
  AssetAllocation,
  AssetHistory,
  Branch,
  Company,
  Department,
  Employee,
  Expense,
  ExpenseCategory,
  LeaveRequest,
  LeaveType,
  Project,
  ReviewCycle,
  Role,
  Scorecard,
  Task,
  Team,
  UserAccount,
} from './types';

export function unwrapList<T>(response: ApiListResponse<T> | undefined): T[] {
  if (Array.isArray(response)) return response;
  return response?.results ?? response?.data ?? [];
}

export const endpoints = {
  analytics: 'analytics/summary/',
  login: 'users/auth/token/',
  refresh: 'users/auth/token/refresh/',
  profile: 'users/employees/me/',
  users: 'users/users/',
  roles: 'users/roles/',
  employees: 'users/employees/',
  projects: 'projects/',
  tasks: 'projects/tasks/',
  assets: 'assets/assets/',
  allocations: 'assets/allocations/',
  assetHistory: 'assets/history/',
  leaveTypes: 'leave/types/',
  leaveRequests: 'leave/requests/',
  leaveBalances: 'leave/balances/',
  expenseCategories: 'expense/categories/',
  expenses: 'expense/',
  companies: 'organization/companies/',
  branches: 'organization/branches/',
  departments: 'organization/departments/',
  teams: 'organization/teams/',
  attendance: 'attendance/',
  invite: 'users/invite/',
  activate: 'users/activate/',
  reviewCycles: 'performance/cycles/',
  scorecards: 'performance/scorecards/',
};

export const client = {
  // Analytics
  analytics: () => api.get(endpoints.analytics),

  // Users & Roles
  users: () => api.get<ApiListResponse<UserAccount>>(endpoints.users),
  createUser: (data: Record<string, unknown>) =>
    api.post<UserAccount>(endpoints.users, data),
  roles: () => api.get<ApiListResponse<Role>>(endpoints.roles),

  // Account Invitation & Activation
  inviteEmployee: (email: string, role = 'Employee') =>
    api.post<{ message?: string; detail?: string; activation_url?: string }>(endpoints.invite, { email, role }),
  verifyActivationToken: (token: string) =>
    api.get<{ valid: boolean; employee_name?: string; email?: string }>(
      `${endpoints.activate}?token=${encodeURIComponent(token)}`,
    ),
  activateAccount: (data: {
    token: string;
    password: string;
    password_confirm?: string;
    turnstile_token?: string;
  }) => api.post<{ message?: string; detail?: string }>(endpoints.activate, data),

  // Employees
  employees: () => api.get<ApiListResponse<Employee>>(endpoints.employees),
  createEmployee: (data: Record<string, unknown>) =>
    api.post<Employee>(endpoints.employees, data),
  updateEmployee: (
    publicId: string,
    data: {
      employment_status?: string;
      resignation_date?: string | null;
      department?: string | null;
      job_title?: string | null;
      phone?: string | null;
      manager?: string | null;
      first_name?: string;
      last_name?: string;
      make_branch_manager?: boolean;
      make_department_head?: boolean;
    },
  ) =>
    api.patch<Employee>(`${endpoints.employees}${publicId}/`, data),
  deleteEmployee: (publicId: string) =>
    api.delete(`${endpoints.employees}${publicId}/`),

  // Projects & Tasks
  projects: () => api.get<ApiListResponse<Project>>(endpoints.projects),
  createProject: (data: Record<string, unknown>) =>
    api.post<Project>(endpoints.projects, data),
  updateProject: (publicId: string, data: Record<string, unknown>) =>
    api.patch<Project>(`${endpoints.projects}${publicId}/`, data),
  deleteProject: (publicId: string) =>
    api.delete(`${endpoints.projects}${publicId}/`),
  tasks: () => api.get<ApiListResponse<Task>>(endpoints.tasks),
  createTask: (data: Record<string, unknown>) =>
    api.post<Task>(endpoints.tasks, data),
  updateTask: (publicId: string, data: Record<string, unknown>) =>
    api.patch<Task>(`${endpoints.tasks}${publicId}/`, data),
  deleteTask: (publicId: string) =>
    api.delete(`${endpoints.tasks}${publicId}/`),

  // Assets
  assets: () => api.get<ApiListResponse<Asset>>(endpoints.assets),
  createAsset: (data: Record<string, unknown>) =>
    api.post<Asset>(endpoints.assets, data),
  updateAsset: (publicId: string, data: Record<string, unknown>) =>
    api.patch<Asset>(`${endpoints.assets}${publicId}/`, data),
  deleteAsset: (publicId: string) =>
    api.delete(`${endpoints.assets}${publicId}/`),
  changeAssetStatus: (publicId: string, status: string) =>
    api.patch<Asset>(`${endpoints.assets}${publicId}/status/`, { status }),
  allocations: () =>
    api.get<ApiListResponse<AssetAllocation>>(endpoints.allocations),
  createAllocation: (data: Record<string, unknown>) =>
    api.post<AssetAllocation>(endpoints.allocations, data),
  updateAllocation: (publicId: string, data: Record<string, unknown>) =>
    api.patch<AssetAllocation>(`${endpoints.allocations}${publicId}/`, data),
  assetHistory: () =>
    api.get<ApiListResponse<AssetHistory>>(endpoints.assetHistory),

  // Leave Management
  leaveTypes: () => api.get<ApiListResponse<LeaveType>>(endpoints.leaveTypes),
  leaveRequests: () =>
    api.get<ApiListResponse<LeaveRequest>>(endpoints.leaveRequests),
  createLeaveRequest: (data: Record<string, unknown>) =>
    api.post<LeaveRequest>(endpoints.leaveRequests, data),
  approveLeave: (publicId: string, comment: string) =>
    api.post<LeaveRequest>(`${endpoints.leaveRequests}${publicId}/approve/`, { comment }),
  rejectLeave: (publicId: string, comment: string) =>
    api.post<LeaveRequest>(`${endpoints.leaveRequests}${publicId}/reject/`, { comment }),

  // Expenses
  expenseCategories: () =>
    api.get<ApiListResponse<ExpenseCategory>>(endpoints.expenseCategories),
  createExpenseCategory: (data: Record<string, unknown>) =>
    api.post<ExpenseCategory>(endpoints.expenseCategories, data),
  updateExpenseCategory: (publicId: string, data: Record<string, unknown>) =>
    api.patch<ExpenseCategory>(`${endpoints.expenseCategories}${publicId}/`, data),
  deleteExpenseCategory: (publicId: string) =>
    api.delete(`${endpoints.expenseCategories}${publicId}/`),
  expenses: () => api.get<ApiListResponse<Expense>>(endpoints.expenses),
  createExpense: (data: FormData) =>
    api.post<Expense>(endpoints.expenses, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateExpense: (publicId: string, data: FormData | Record<string, unknown>) =>
    api.patch<Expense>(`${endpoints.expenses}${publicId}/`, data),
  deleteExpense: (publicId: string) =>
    api.delete(`${endpoints.expenses}${publicId}/`),
  approveExpense: (publicId: string, comment = '') =>
    api.post<Expense>(`${endpoints.expenses}${publicId}/approve/`, { comment }),
  rejectExpense: (publicId: string, comment: string) =>
    api.post<Expense>(`${endpoints.expenses}${publicId}/reject/`, { comment }),

  // Organization & Hierarchy
  companies: () => api.get<ApiListResponse<Company>>(endpoints.companies),
  createCompany: (data: Record<string, unknown>) =>
    api.post<Company>(endpoints.companies, data),
  updateCompany: (publicId: string, data: Record<string, unknown>) =>
    api.patch<Company>(`${endpoints.companies}${publicId}/`, data),
  deleteCompany: (publicId: string) =>
    api.delete(`${endpoints.companies}${publicId}/`),

  branches: () => api.get<ApiListResponse<Branch>>(endpoints.branches),
  createBranch: (data: Record<string, unknown>) =>
    api.post<Branch>(endpoints.branches, data),
  updateBranch: (publicId: string, data: Record<string, unknown>) =>
    api.patch<Branch>(`${endpoints.branches}${publicId}/`, data),

  departments: () =>
    api.get<ApiListResponse<Department>>(endpoints.departments),
  createDepartment: (data: Record<string, unknown>) =>
    api.post<Department>(endpoints.departments, data),
  updateDepartment: (publicId: string, data: Record<string, unknown>) =>
    api.patch<Department>(`${endpoints.departments}${publicId}/`, data),

  teams: () => api.get<ApiListResponse<Team>>(endpoints.teams),

  // Attendance
  attendance: (params?: { start_date?: string; end_date?: string }) =>
    api.get<ApiListResponse<AttendanceRecord>>(endpoints.attendance, { params }),
  attendanceSummary: (params?: { start_date?: string; end_date?: string }) =>
    api.get<Record<string, number>>(`${endpoints.attendance}summary/`, { params }),
  checkIn: () => api.post<AttendanceRecord>(`${endpoints.attendance}check-in/`),
  checkOut: () => api.post<AttendanceRecord>(`${endpoints.attendance}check-out/`),

  // Performance Management
  reviewCycles: () =>
    api.get<ApiListResponse<ReviewCycle>>(endpoints.reviewCycles),
  createReviewCycle: (data: Record<string, unknown>) =>
    api.post<ReviewCycle>(endpoints.reviewCycles, data),
  updateReviewCycle: (publicId: string, data: Record<string, unknown>) =>
    api.patch<ReviewCycle>(`${endpoints.reviewCycles}${publicId}/`, data),
  scorecards: () =>
    api.get<ApiListResponse<Scorecard>>(endpoints.scorecards),
  createScorecard: (data: Record<string, unknown>) =>
    api.post<Scorecard>(endpoints.scorecards, data),
  updateScorecard: (publicId: string, data: Record<string, unknown>) =>
    api.patch<Scorecard>(`${endpoints.scorecards}${publicId}/`, data),
  deleteScorecard: (publicId: string) =>
    api.delete(`${endpoints.scorecards}${publicId}/`),
  submitScorecard: (publicId: string) =>
    api.post<Scorecard>(`${endpoints.scorecards}${publicId}/submit/`, {}),
};
