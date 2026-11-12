import api from './axios';
import type {
  ApiListResponse,
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
  Task,
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
};

export const client = {
  analytics: () => api.get(endpoints.analytics),
  employees: () => api.get<ApiListResponse<Employee>>(endpoints.employees),
  updateEmployee: (
    publicId: string,
    data: { employment_status?: string; department?: string | null },
  ) =>
    api.patch<Employee>(`${endpoints.employees}${publicId}/`, data),
  projects: () => api.get<ApiListResponse<Project>>(endpoints.projects),
  createProject: (data: Record<string, unknown>) =>
    api.post<Project>(endpoints.projects, data),
  tasks: () => api.get<ApiListResponse<Task>>(endpoints.tasks),
  createTask: (data: Record<string, unknown>) =>
    api.post<Task>(endpoints.tasks, data),
  assets: () => api.get<ApiListResponse<Asset>>(endpoints.assets),
  createAsset: (data: Record<string, unknown>) =>
    api.post<Asset>(endpoints.assets, data),
  allocations: () =>
    api.get<ApiListResponse<AssetAllocation>>(endpoints.allocations),
  createAllocation: (data: Record<string, unknown>) =>
    api.post<AssetAllocation>(endpoints.allocations, data),
  updateAllocation: (publicId: string, data: Record<string, unknown>) =>
    api.patch<AssetAllocation>(`${endpoints.allocations}${publicId}/`, data),
  assetHistory: () =>
    api.get<ApiListResponse<AssetHistory>>(endpoints.assetHistory),
  leaveTypes: () => api.get<ApiListResponse<LeaveType>>(endpoints.leaveTypes),
  leaveRequests: () =>
    api.get<ApiListResponse<LeaveRequest>>(endpoints.leaveRequests),
  createLeaveRequest: (data: Record<string, unknown>) =>
    api.post<LeaveRequest>(endpoints.leaveRequests, data),
  approveLeave: (publicId: string, comment: string) =>
    api.post(`${endpoints.leaveRequests}${publicId}/approve/`, { comment }),
  rejectLeave: (publicId: string, comment: string) =>
    api.post(`${endpoints.leaveRequests}${publicId}/reject/`, { comment }),
  expenseCategories: () =>
    api.get<ApiListResponse<ExpenseCategory>>(endpoints.expenseCategories),
  expenses: () => api.get<ApiListResponse<Expense>>(endpoints.expenses),
  createExpense: (data: FormData) =>
    api.post<Expense>(endpoints.expenses, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  companies: () => api.get<ApiListResponse<Company>>(endpoints.companies),
  branches: () => api.get<ApiListResponse<Branch>>(endpoints.branches),
  departments: () =>
    api.get<ApiListResponse<Department>>(endpoints.departments),
};
