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

export interface OrgChartNode {
  employee: Employee;
  children: OrgChartNode[];
}

/**
 * Builds the full reporting chain for an employee: every manager above them
 * (closest first) and the full subordinate tree below them. Walks the
 * manager/subordinate links defensively so a data cycle can't infinite-loop
 * the UI (the backend rejects cycles on write, but this stays safe either way).
 */
export function buildOrgChain(employee: Employee, employees: Employee[]) {
  const byId = new Map(employees.map((e) => [e.public_id, e]));

  const ancestors: Employee[] = [];
  const seenAncestors = new Set<string>([employee.public_id]);
  let current = employee.manager ? byId.get(employee.manager) : undefined;
  while (current && !seenAncestors.has(current.public_id)) {
    ancestors.push(current);
    seenAncestors.add(current.public_id);
    current = current.manager ? byId.get(current.manager) : undefined;
  }

  const buildDescendants = (managerId: string, seen: Set<string>): OrgChartNode[] => {
    return employees
      .filter((e) => e.manager === managerId && !seen.has(e.public_id))
      .map((child) => {
        const nextSeen = new Set(seen);
        nextSeen.add(child.public_id);
        return { employee: child, children: buildDescendants(child.public_id, nextSeen) };
      });
  };

  const descendants = buildDescendants(employee.public_id, new Set([employee.public_id]));

  return { ancestors, descendants };
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
