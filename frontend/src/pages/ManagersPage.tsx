import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Branch, Company, Department, Employee, Role } from '../api/types';
import { displayError } from '../components/format';
import { OrgHierarchySelect } from '../components/OrgHierarchySelect';
import { useAuth } from '../context/auth';
import {
  deriveHierarchyForEmployee,
  getEmployeeRoleName,
  isEmployeeManager,
  isRoleManager,
  type HierarchySelection,
} from '../utils/managers';
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Icon,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  SelectField,
  StatusBadge,
  SuccessMessage,
} from '../components/ui';

const PAGE_SIZE = 8;

export default function ManagersPage() {
  const { hasRole, user: currentUser } = useAuth();
  const canCreateDepartment =
    hasRole(['System Admin', 'HR Manager']) || Boolean(currentUser?.is_superuser);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editManager, setEditManager] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Add Manager Form State
  const [addHierarchy, setAddHierarchy] = useState<HierarchySelection>({
    companyId: '',
    branchId: '',
    departmentId: '',
  });
  const [addReportsTo, setAddReportsTo] = useState('');
  const [addMakeBranchManager, setAddMakeBranchManager] = useState(false);
  const [addMakeDepartmentHead, setAddMakeDepartmentHead] = useState(false);

  // Edit Manager Form State
  const [editHierarchy, setEditHierarchy] = useState<HierarchySelection>({
    companyId: '',
    branchId: '',
    departmentId: '',
  });
  const [editReportsTo, setEditReportsTo] = useState('');
  const [editMakeBranchManager, setEditMakeBranchManager] = useState(false);
  const [editMakeDepartmentHead, setEditMakeDepartmentHead] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      const [empRes, compRes, deptRes, roleRes, branchRes] = await Promise.all([
        client.employees(),
        client.companies(),
        client.departments(),
        client.roles(),
        client.branches(),
      ]);
      setEmployees(unwrapList(empRes.data));
      setCompanies(unwrapList(compRes.data));
      setDepartments(unwrapList(deptRes.data));
      setRoles(unwrapList(roleRes.data));
      setBranches(unwrapList(branchRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const departmentMap = useMemo(() => {
    return new Map(departments.map((d) => [d.public_id, d]));
  }, [departments]);

  const branchMap = useMemo(() => {
    return new Map(branches.map((b) => [b.public_id, b]));
  }, [branches]);

  const getEmployeeBranchId = useCallback(
    (emp: Employee) => {
      if (emp.branch) return emp.branch;
      const dept = emp.department ? departmentMap.get(emp.department) : undefined;
      return dept?.branch || null;
    },
    [departmentMap],
  );

  const getEmployeeCompanyId = useCallback(
    (emp: Employee) => {
      if (emp.company) return emp.company;
      const brId = getEmployeeBranchId(emp);
      const br = brId ? branchMap.get(brId) : undefined;
      return br?.company || null;
    },
    [branchMap, getEmployeeBranchId],
  );

  // Filter dropdown cascading options
  const filterBranches = useMemo(() => {
    if (!companyFilter || companyFilter === '__unassigned__') return branches;
    return branches.filter((b) => b.company === companyFilter);
  }, [branches, companyFilter]);

  const filterDepartments = useMemo(() => {
    if (!branchFilter || branchFilter === '__unassigned__') {
      if (!companyFilter || companyFilter === '__unassigned__') return departments;
      const companyBranchIds = new Set(filterBranches.map((b) => b.public_id));
      return departments.filter((d) => d.branch && companyBranchIds.has(d.branch));
    }
    return departments.filter((d) => d.branch === branchFilter);
  }, [departments, branchFilter, companyFilter, filterBranches]);

  // Is an employee a manager using real data:
  // Role says so, or manages a branch, or leads a department, or has subordinates reporting to them
  const managersList = useMemo(() => {
    return employees.filter((emp) =>
      isEmployeeManager(emp, branches, departments, employees, roles),
    );
  }, [employees, branches, departments, roles]);

  // Filtered list
  const filteredManagers = useMemo(() => {
    return managersList.filter((m) => {
      const name = `${m.first_name} ${m.last_name}`.toLowerCase();
      const username = (m.user_details?.username || '').toLowerCase();
      const title = (m.job_title || '').toLowerCase();
      const matchesSearch =
        !search ||
        name.includes(search.toLowerCase()) ||
        username.includes(search.toLowerCase()) ||
        title.includes(search.toLowerCase());

      const empCompanyId = getEmployeeCompanyId(m);
      const matchesCompany =
        !companyFilter ||
        (companyFilter === '__unassigned__' ? !empCompanyId : empCompanyId === companyFilter);

      const empBranchId = getEmployeeBranchId(m);
      const matchesBranch =
        !branchFilter ||
        (branchFilter === '__unassigned__' ? !empBranchId : empBranchId === branchFilter);

      const matchesDept =
        !deptFilter ||
        (deptFilter === '__unassigned__' ? !m.department : m.department === deptFilter);

      const roleName = getEmployeeRoleName(m, roles);
      const matchesRole = !roleFilter || roleName === roleFilter;

      return matchesSearch && matchesCompany && matchesBranch && matchesDept && matchesRole;
    });
  }, [
    managersList,
    search,
    companyFilter,
    branchFilter,
    deptFilter,
    roleFilter,
    roles,
    getEmployeeCompanyId,
    getEmployeeBranchId,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredManagers.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredManagers.slice(start, start + PAGE_SIZE);
  }, [filteredManagers, page]);

  const openAddModal = () => {
    setFormError('');
    const firstCompanyId = companies[0]?.public_id ?? '';
    const firstBranches = branches.filter((b) => b.company === firstCompanyId);
    const firstBranchId = firstBranches[0]?.public_id ?? '';
    const firstDepts = departments.filter((d) => d.branch === firstBranchId);
    const firstDeptId = firstDepts[0]?.public_id ?? '';
    setAddHierarchy({
      companyId: firstCompanyId,
      branchId: firstBranchId,
      departmentId: firstDeptId,
    });
    setAddReportsTo('');
    setAddMakeBranchManager(false);
    setAddMakeDepartmentHead(false);
    setAddModalOpen(true);
  };

  const openEditModal = (manager: Employee) => {
    setFormError('');
    const hierarchy = deriveHierarchyForEmployee(
      manager.department,
      departments,
      branches,
      manager.branch,
      manager.company,
    );
    setEditHierarchy(hierarchy);
    setEditReportsTo(manager.manager || '');
    const currentBranch = hierarchy.branchId ? branchMap.get(hierarchy.branchId) : undefined;
    const currentDept = hierarchy.departmentId ? departmentMap.get(hierarchy.departmentId) : undefined;
    setEditMakeBranchManager(
      Boolean(currentBranch?.manager === manager.public_id || manager.is_branch_manager),
    );
    setEditMakeDepartmentHead(
      Boolean(currentDept?.head === manager.public_id || manager.is_department_head),
    );
    setEditManager(manager);
  };

  // Add Manager Workflow: Atomic single-transaction creation of User + Employee + optional leadership
  const handleAddManager = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);

    const username = String(form.get('username')).trim();
    const password = String(form.get('password'));
    const email = String(form.get('email')).trim();
    const roleUuid = String(form.get('role'));
    const firstName = String(form.get('first_name')).trim();
    const lastName = String(form.get('last_name')).trim();
    const phone = String(form.get('phone') ?? '').trim();
    const jobTitle = String(form.get('job_title')).trim();
    const hireDate = String(form.get('hire_date'));

    if (!addHierarchy.companyId || !addHierarchy.branchId || !addHierarchy.departmentId) {
      setFormError('Organization, Branch, and Department are all required.');
      setSaving(false);
      return;
    }

    if (addReportsTo) {
      const mgrEmp = employees.find((e) => e.public_id === addReportsTo);
      if (mgrEmp && getEmployeeCompanyId(mgrEmp) !== addHierarchy.companyId) {
        setFormError('Reports to manager must belong to the same organization.');
        setSaving(false);
        return;
      }
    }

    try {
      await client.createEmployee({
        username,
        password,
        role: roleUuid,
        is_active: true,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        job_title: jobTitle,
        department: addHierarchy.departmentId,
        hire_date: hireDate,
        employment_status: 'Active',
        manager: addReportsTo || null,
        make_branch_manager: addMakeBranchManager,
        make_department_head: addMakeDepartmentHead,
      });

      setSuccess(`Manager account successfully created for ${firstName} ${lastName}.`);
      setAddModalOpen(false);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Edit Manager Workflow
  const handleEditManager = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editManager) return;
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    const employmentStatus = String(form.get('employment_status'));

    if (!editHierarchy.companyId || !editHierarchy.branchId || !editHierarchy.departmentId) {
      setFormError('Organization, Branch, and Department are all required.');
      setSaving(false);
      return;
    }

    if (editReportsTo === editManager.public_id) {
      setFormError('A manager cannot report to themselves.');
      setSaving(false);
      return;
    }

    if (editReportsTo) {
      const mgrEmp = employees.find((e) => e.public_id === editReportsTo);
      if (mgrEmp && getEmployeeCompanyId(mgrEmp) !== editHierarchy.companyId) {
        setFormError('Reports to manager must belong to the same organization.');
        setSaving(false);
        return;
      }
    }

    try {
      await client.updateEmployee(editManager.public_id, {
        first_name: String(form.get('first_name')).trim(),
        last_name: String(form.get('last_name')).trim(),
        job_title: String(form.get('job_title')).trim() || null,
        phone: String(form.get('phone') ?? '').trim() || null,
        department: editHierarchy.departmentId,
        manager: editReportsTo || null,
        employment_status: employmentStatus,
        make_branch_manager: editMakeBranchManager,
        make_department_head: editMakeDepartmentHead,
      });

      setSuccess(`Manager information updated for ${editManager.first_name} ${editManager.last_name}.`);
      setEditManager(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Roles applicable for managers
  const managerRoles = useMemo(() => {
    return roles.filter(
      (r) =>
        r.role_name === 'Department / Project Manager' ||
        r.role_name === 'HR Manager',
    );
  }, [roles]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administrative Control"
        title="Manager Management"
        description="Oversee appointed department leads and HR managers. Provision new leadership accounts and manage operational assignments."
        action={
          <Button variant="primary" size="sm" onClick={openAddModal}>
            <Icon name="plus" size={14} /> Add Manager
          </Button>
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* KPI Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon name="users" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{managersList.length}</p>
              <p className="text-xs text-slate-500 font-medium">Total Managers</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
              <Icon name="briefcase" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {
                  managersList.filter(
                    (m) => m.is_branch_manager || branches.some((b) => b.manager === m.public_id),
                  ).length
                }
              </p>
              <p className="text-xs text-slate-500 font-medium">Branch Managers</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Icon name="shield" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {
                  managersList.filter(
                    (m) => m.is_department_head || departments.some((d) => d.head === m.public_id),
                  ).length
                }
              </p>
              <p className="text-xs text-slate-500 font-medium">Department Heads</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
              <Icon name="check-circle" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {managersList.filter((m) => (m.employment_status || '').toLowerCase() === 'active').length}
              </p>
              <p className="text-xs text-slate-500 font-medium">Active In Position</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden">
        {/* Search & Filter Toolbar */}
        <div className="space-y-3 border-b border-slate-100 p-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search by manager name, username, title…"
              className="w-full lg:w-72"
            />

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={companyFilter}
                onChange={(e) => {
                  setCompanyFilter(e.target.value);
                  setBranchFilter('');
                  setDeptFilter('');
                  setPage(1);
                }}
                aria-label="Filter by organization"
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
              >
                <option value="">All Organizations</option>
                <option value="__unassigned__">Unassigned Organization</option>
                {companies.map((c) => (
                  <option key={c.public_id} value={c.public_id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setDeptFilter('');
                  setPage(1);
                }}
                aria-label="Filter by branch"
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
              >
                <option value="">All Branches</option>
                <option value="__unassigned__">Unassigned Branch</option>
                {filterBranches.map((b) => (
                  <option key={b.public_id} value={b.public_id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by department"
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
              >
                <option value="">All Departments</option>
                <option value="__unassigned__">Unassigned</option>
                {filterDepartments.map((d) => (
                  <option key={d.public_id} value={d.public_id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by manager role"
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
              >
                <option value="">All Manager Roles</option>
                <option value="Department / Project Manager">Project Manager</option>
                <option value="HR Manager">HR Manager</option>
                <option value="System Admin">System Admin</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing <strong>{filteredManagers.length}</strong> managers
            </span>
            {(search || companyFilter || branchFilter || deptFilter || roleFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCompanyFilter('');
                  setBranchFilter('');
                  setDeptFilter('');
                  setRoleFilter('');
                  setPage(1);
                }}
                className="font-semibold text-blue-600 hover:text-blue-800"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading manager roster…" />
        ) : filteredManagers.length === 0 ? (
          <EmptyState
            icon="users"
            title="No managers found"
            description={
              search || companyFilter || branchFilter || deptFilter || roleFilter
                ? 'No managers match your active search filters.'
                : 'No managers are currently registered. Appoint a new manager to lead teams and initiatives.'
            }
            action={
              !search && !companyFilter && !branchFilter && !deptFilter && !roleFilter ? (
                <Button size="sm" onClick={openAddModal}>
                  <Icon name="plus" size={14} /> Add First Manager
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Manager Name</th>
                    <th className="px-5 py-3">Department, Branch & Org</th>
                    <th className="px-5 py-3">Role & Title</th>
                    <th className="px-5 py-3">Leadership Status</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageRows.map((manager) => {
                    const roleName = getEmployeeRoleName(manager, roles);
                    const deptObj = manager.department ? departmentMap.get(manager.department) : null;
                    const branchObj = deptObj?.branch ? branchMap.get(deptObj.branch) : null;
                    const branchLabel = manager.branch_name || branchObj?.name || deptObj?.branch_name;
                    const companyLabel = manager.company_name || branchObj?.company_name || deptObj?.company_name;

                    // Leadership qualifications (real data)
                    const managedBranch = branches.find((b) => b.manager === manager.public_id);
                    const isBranchMgr = Boolean(managedBranch || manager.is_branch_manager);
                    const headedDept = departments.find((d) => d.head === manager.public_id);
                    const isDeptHead = Boolean(headedDept || manager.is_department_head);
                    const subCount =
                      manager.subordinates_count ??
                      employees.filter((e) => e.manager === manager.public_id).length;
                    const roleIsMgr = isRoleManager(roleName);

                    return (
                      <tr key={manager.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900">
                            {manager.first_name} {manager.last_name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {manager.email || 'No email recorded'} · {manager.phone || 'No phone'}
                          </p>
                          <span className="font-mono text-[10px] text-slate-400">
                            @{manager.user_details?.username || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {manager.department_name || deptObj?.name ? (
                            <>
                              <p className="font-medium text-slate-900">
                                {manager.department_name || deptObj?.name}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {branchLabel ? `${branchLabel}${companyLabel ? ` · ${companyLabel}` : ''}` : 'No branch / org'}
                              </p>
                            </>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-slate-800 block">
                            {manager.job_title || 'Manager'}
                          </span>
                          <span className="text-[10px] text-blue-600 font-medium">
                            {roleName || 'Staff'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {isBranchMgr && (
                              <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                Branch Mgr{managedBranch ? `: ${managedBranch.name}` : ''}
                              </span>
                            )}
                            {isDeptHead && (
                              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                                Dept Head{headedDept ? `: ${headedDept.name}` : ''}
                              </span>
                            )}
                            {subCount > 0 && (
                              <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                                {subCount} Direct Report{subCount === 1 ? '' : 's'}
                              </span>
                            )}
                            {roleIsMgr && !isBranchMgr && !isDeptHead && subCount === 0 && (
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                Role: {roleName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={manager.employment_status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditModal(manager)}
                          >
                            <Icon name="edit" size={13} /> Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filteredManagers.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Add Manager */}
      {addModalOpen && (
        <Modal
          title="Add New Organization Manager"
          description="Provision a manager account and employee profile with authorized operational permissions."
          onClose={() => setAddModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={handleAddManager}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="First Name"
                name="first_name"
                required
                placeholder="e.g. Vikram"
              />
              <Field
                label="Last Name"
                name="last_name"
                required
                placeholder="e.g. Deshmukh"
              />
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Corporate Email"
                name="email"
                type="email"
                required
                placeholder="v.deshmukh@enterprise.com"
              />
              <Field
                label="Contact Phone"
                name="phone"
                placeholder="+91 98765 43210"
              />
            </div>

            <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200/80 space-y-3">
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Account Credentials
              </p>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field
                  label="Login Username"
                  name="username"
                  required
                  placeholder="v.deshmukh"
                />
                <Field
                  label="Initial Password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <OrgHierarchySelect
              companies={companies}
              branches={branches}
              departments={departments}
              value={addHierarchy}
              onChange={(next) => {
                setAddHierarchy(next);
                if (addReportsTo) {
                  const mgrEmp = employees.find((e) => e.public_id === addReportsTo);
                  if (mgrEmp && next.companyId && getEmployeeCompanyId(mgrEmp) !== next.companyId) {
                    setAddReportsTo('');
                  }
                }
              }}
              canCreateDepartment={canCreateDepartment}
              onDepartmentCreated={(newDept) =>
                setDepartments((prev) => [...prev, newDept])
              }
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <SelectField
                label="Manager Authorization Role"
                name="role"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select role…
                </option>
                {managerRoles.map((r) => (
                  <option key={r.public_id} value={r.public_id}>
                    {r.role_name}
                  </option>
                ))}
              </SelectField>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reports to (Same Organization)
                </label>
                <select
                  value={addReportsTo}
                  onChange={(e) => setAddReportsTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">No Reporting Manager</option>
                  {employees
                    .filter((emp) => {
                      if (!addHierarchy.companyId) return false;
                      return getEmployeeCompanyId(emp) === addHierarchy.companyId;
                    })
                    .map((emp) => (
                      <option key={emp.public_id} value={emp.public_id}>
                        {emp.first_name} {emp.last_name} ({emp.job_title || 'Staff'})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Job Title / Position"
                name="job_title"
                required
                placeholder="e.g. Engineering Delivery Manager"
              />
              <Field
                label="Hire / Appointment Date"
                name="hire_date"
                type="date"
                required
                defaultValue={today}
              />
            </div>

            {/* Optional Leadership Designations */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Optional Leadership Assignments
              </p>
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={addMakeBranchManager}
                    onChange={(e) => setAddMakeBranchManager(e.target.checked)}
                    disabled={!addHierarchy.branchId}
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Make Branch Manager
                    {addHierarchy.branchId && branchMap.get(addHierarchy.branchId)
                      ? ` (${branchMap.get(addHierarchy.branchId)!.name})`
                      : ''}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={addMakeDepartmentHead}
                    onChange={(e) => setAddMakeDepartmentHead(e.target.checked)}
                    disabled={!addHierarchy.departmentId}
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Make Department Head
                    {addHierarchy.departmentId && departmentMap.get(addHierarchy.departmentId)
                      ? ` (${departmentMap.get(addHierarchy.departmentId)!.name})`
                      : ''}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Creating Manager…' : 'Save Manager'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Manager */}
      {editManager && (
        <Modal
          title={`Edit Manager: ${editManager.first_name} ${editManager.last_name}`}
          description="Update organization, branch, department assignment, job title, leadership designations, or status."
          onClose={() => setEditManager(null)}
        >
          <form className="space-y-4" onSubmit={handleEditManager}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="First Name"
                name="first_name"
                required
                defaultValue={editManager.first_name}
              />
              <Field
                label="Last Name"
                name="last_name"
                required
                defaultValue={editManager.last_name}
              />
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Job Title / Position"
                name="job_title"
                required
                defaultValue={editManager.job_title || ''}
              />
              <Field
                label="Contact Phone"
                name="phone"
                defaultValue={editManager.phone || ''}
              />
            </div>

            <OrgHierarchySelect
              companies={companies}
              branches={branches}
              departments={departments}
              value={editHierarchy}
              onChange={(next) => {
                setEditHierarchy(next);
                if (editReportsTo) {
                  const mgrEmp = employees.find((e) => e.public_id === editReportsTo);
                  if (mgrEmp && next.companyId && getEmployeeCompanyId(mgrEmp) !== next.companyId) {
                    setEditReportsTo('');
                  }
                }
              }}
              canCreateDepartment={canCreateDepartment}
              onDepartmentCreated={(newDept) =>
                setDepartments((prev) => [...prev, newDept])
              }
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reports to (Same Organization)
                </label>
                <select
                  value={editReportsTo}
                  onChange={(e) => setEditReportsTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">No Reporting Manager</option>
                  {employees
                    .filter((emp) => {
                      if (emp.public_id === editManager.public_id) return false;
                      const targetCompany = editHierarchy.companyId || getEmployeeCompanyId(editManager);
                      if (!targetCompany) return false;
                      return getEmployeeCompanyId(emp) === targetCompany;
                    })
                    .map((emp) => (
                      <option key={emp.public_id} value={emp.public_id}>
                        {emp.first_name} {emp.last_name} ({emp.job_title || 'Staff'})
                      </option>
                    ))}
                </select>
              </div>

              <SelectField
                label="Employment Status"
                name="employment_status"
                defaultValue={editManager.employment_status}
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
                <option value="Terminated">Terminated</option>
              </SelectField>
            </div>

            {/* Optional Leadership Designations */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Optional Leadership Assignments
              </p>
              <div className="grid gap-2 sm:grid-cols-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={editMakeBranchManager}
                    onChange={(e) => setEditMakeBranchManager(e.target.checked)}
                    disabled={!editHierarchy.branchId}
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Make Branch Manager
                    {editHierarchy.branchId && branchMap.get(editHierarchy.branchId)
                      ? ` (${branchMap.get(editHierarchy.branchId)!.name})`
                      : ''}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={editMakeDepartmentHead}
                    onChange={(e) => setEditMakeDepartmentHead(e.target.checked)}
                    disabled={!editHierarchy.departmentId}
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Make Department Head
                    {editHierarchy.departmentId && departmentMap.get(editHierarchy.departmentId)
                      ? ` (${departmentMap.get(editHierarchy.departmentId)!.name})`
                      : ''}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditManager(null)}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
