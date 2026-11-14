import type { Branch, Department, Employee, Role } from '../api/types';

export interface HierarchySelection {
  companyId: string;
  branchId: string;
  departmentId: string;
}

export function deriveHierarchyForEmployee(
  departmentId: string | null | undefined,
  departments: Department[],
  branches: Branch[],
  fallbackBranchId?: string | null,
  fallbackCompanyId?: string | null,
): HierarchySelection {
  const dept = departmentId ? departments.find((d) => d.public_id === departmentId) : undefined;
  const branchId = dept?.branch || fallbackBranchId || '';
  const branch = branchId ? branches.find((b) => b.public_id === branchId) : undefined;
  const companyId = branch?.company || dept?.company || fallbackCompanyId || '';
  return {
    companyId,
    branchId,
    departmentId: departmentId || '',
  };
}

export function getEmployeeRoleName(emp: Employee, roles?: Role[]): string {
  if (emp.role_name) {
    return emp.role_name;
  }
  if (emp.user_details?.role_name) {
    return emp.user_details.role_name;
  }
  const role = emp.user_details?.role;
  if (typeof role === 'object' && role !== null && role.role_name) {
    return role.role_name;
  }
  if (typeof role === 'string' && role) {
    const matched = roles?.find((r) => r.public_id === role);
    if (matched) return matched.role_name;
    // Only return string if it doesn't look like a raw UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(role)) {
      return role;
    }
  }
  return '';
}

export function isRoleManager(roleName: string): boolean {
  const normalized = roleName.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === 'department / project manager' ||
    normalized === 'hr manager' ||
    normalized === 'system admin' ||
    normalized.includes('manager')
  );
}

export function isEmployeeManager(
  emp: Employee,
  branches: Branch[],
  departments: Department[],
  employees: Employee[],
  roles?: Role[],
): boolean {
  const roleName = getEmployeeRoleName(emp, roles);
  if (isRoleManager(roleName)) return true;

  if (emp.is_branch_manager || branches.some((b) => b.manager === emp.public_id)) {
    return true;
  }

  if (emp.is_department_head || departments.some((d) => d.head === emp.public_id)) {
    return true;
  }

  if ((emp.subordinates_count ?? 0) > 0 || employees.some((e) => e.manager === emp.public_id)) {
    return true;
  }

  return Boolean(emp.is_manager);
}
