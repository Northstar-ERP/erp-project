import { useCallback, useEffect, useMemo, useState } from 'react';
import { client, unwrapList } from '../api/client';
import type { Branch, Company, Department, Employee } from '../api/types';
import { displayError, formatDate } from '../components/format';
import { getEmployeeRoleName } from '../utils/managers';
import {
  Card,
  EmptyState,
  ErrorMessage,
  Icon,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
} from '../components/ui';

type OrgDirectoryData = {
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
};

const PAGE_SIZE = 10;

export default function AdminEmployeeDirectoryPage() {
  const [activeTab, setActiveTab] = useState<'employees' | 'structure'>('employees');
  const [data, setData] = useState<OrgDirectoryData>({
    companies: [],
    branches: [],
    departments: [],
    employees: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activationFilter, setActivationFilter] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [companiesRes, branchesRes, departmentsRes, employeesRes] = await Promise.allSettled([
        client.companies(),
        client.branches(),
        client.departments(),
        client.employees(),
      ]);

      if (employeesRes.status === 'rejected') {
        setError(displayError(employeesRes.reason));
      }

      setData({
        companies: companiesRes.status === 'fulfilled' ? unwrapList(companiesRes.value.data) : [],
        branches: branchesRes.status === 'fulfilled' ? unwrapList(branchesRes.value.data) : [],
        departments: departmentsRes.status === 'fulfilled' ? unwrapList(departmentsRes.value.data) : [],
        employees: employeesRes.status === 'fulfilled' ? unwrapList(employeesRes.value.data) : [],
      });
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Lookup Maps
  const companyMap = useMemo(() => {
    return new Map(data.companies.map((c) => [c.public_id, c.name]));
  }, [data.companies]);

  const branchMap = useMemo(() => {
    return new Map(data.branches.map((b) => [b.public_id, b]));
  }, [data.branches]);

  const departmentMap = useMemo(() => {
    return new Map(data.departments.map((d) => [d.public_id, d]));
  }, [data.departments]);

  const employeeMap = useMemo(() => {
    return new Map(data.employees.map((e) => [e.public_id, `${e.first_name} ${e.last_name}`]));
  }, [data.employees]);

  // Derived filter options
  const filteredBranches = useMemo(() => {
    if (!companyFilter || companyFilter === '__unassigned__') return data.branches;
    return data.branches.filter((b) => b.company === companyFilter);
  }, [data.branches, companyFilter]);

  const filteredDepartments = useMemo(() => {
    if (!branchFilter || branchFilter === '__unassigned__') {
      if (!companyFilter || companyFilter === '__unassigned__') return data.departments;
      const companyBranchIds = new Set(filteredBranches.map((b) => b.public_id));
      return data.departments.filter((d) => d.branch && companyBranchIds.has(d.branch));
    }
    return data.departments.filter((d) => d.branch === branchFilter);
  }, [data.departments, branchFilter, companyFilter, filteredBranches]);

  const getEmployeeBranchId = useCallback(
    (emp: Employee) => {
      if (emp.branch) return emp.branch;
      const dept = emp.department ? departmentMap.get(emp.department) : null;
      return dept?.branch || null;
    },
    [departmentMap],
  );

  const getEmployeeCompanyId = useCallback(
    (emp: Employee) => {
      if (emp.company) return emp.company;
      const brId = getEmployeeBranchId(emp);
      const br = brId ? branchMap.get(brId) : null;
      return br?.company || null;
    },
    [branchMap, getEmployeeBranchId],
  );

  // Unique designations
  const uniqueDesignations = useMemo(() => {
    const set = new Set<string>();
    for (const emp of data.employees) {
      if (emp.job_title?.trim()) set.add(emp.job_title.trim());
    }
    return Array.from(set).sort();
  }, [data.employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return data.employees.filter((emp) => {
      const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
      const username = (emp.user_details?.username || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const jobTitle = (emp.job_title || '').toLowerCase();
      const empId = emp.public_id.toLowerCase();

      const matchesSearch =
        !search ||
        fullName.includes(search.toLowerCase()) ||
        username.includes(search.toLowerCase()) ||
        email.includes(search.toLowerCase()) ||
        jobTitle.includes(search.toLowerCase()) ||
        empId.includes(search.toLowerCase());

      // Department matching
      const matchesDept =
        !departmentFilter ||
        (departmentFilter === '__unassigned__'
          ? !emp.department
          : emp.department === departmentFilter || emp.department_name === departmentFilter);

      // Branch matching
      const branchId = getEmployeeBranchId(emp);
      const matchesBranch =
        !branchFilter ||
        (branchFilter === '__unassigned__' ? !branchId : branchId === branchFilter);

      // Company matching
      const companyId = getEmployeeCompanyId(emp);
      const matchesCompany =
        !companyFilter ||
        (companyFilter === '__unassigned__' ? !companyId : companyId === companyFilter);

      // Status matching
      const matchesStatus =
        !statusFilter || emp.employment_status.toLowerCase() === statusFilter.toLowerCase();

      // Designation matching
      const matchesDesignation =
        !designationFilter || (emp.job_title || '').trim() === designationFilter;

      // Activation Status matching
      let matchesActivation = true;
      const isAccountActive = emp.user_details?.is_active ?? true;
      if (activationFilter === 'active') {
        matchesActivation = isAccountActive && emp.employment_status.toLowerCase() === 'active';
      } else if (activationFilter === 'pending') {
        matchesActivation = emp.employment_status.toLowerCase() === 'pending' || !isAccountActive;
      } else if (activationFilter === 'inactive') {
        matchesActivation = !isAccountActive || ['inactive', 'terminated'].includes(emp.employment_status.toLowerCase());
      }

      return matchesSearch && matchesDept && matchesBranch && matchesCompany && matchesDesignation && matchesStatus && matchesActivation;
    });
  }, [
    data.employees,
    search,
    departmentFilter,
    branchFilter,
    companyFilter,
    designationFilter,
    statusFilter,
    activationFilter,
    getEmployeeBranchId,
    getEmployeeCompanyId,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEmployees.slice(start, start + PAGE_SIZE);
  }, [filteredEmployees, page]);

  // Statistics
  const totalEmployeesCount = data.employees.length;
  const activeEmployeesCount = data.employees.filter(
    (e) => (e.employment_status || '').toLowerCase() === 'active',
  ).length;
  const pendingActivationCount = data.employees.filter(
    (e) =>
      (e.employment_status || '').toLowerCase() === 'pending' ||
      e.user_details?.is_active === false,
  ).length;
  const inactiveEmployeesCount = data.employees.filter(
    (e) => ['inactive', 'terminated'].includes((e.employment_status || '').toLowerCase()),
  ).length;

  if (loading) {
    return <LoadingState label="Loading workforce employee directory…" />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        eyebrow="Workforce Oversight"
        title="Employee Directory"
        description="Comprehensive read-only roster of all organization personnel, job classifications, departmental structures, and reporting hierarchies."
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {/* KPI Oversight Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon name="users" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalEmployeesCount}</p>
              <p className="text-xs font-semibold text-slate-500">Total Enrolled Personnel</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Icon name="check-circle" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-emerald-700">{activeEmployeesCount}</p>
              <p className="text-xs font-semibold text-slate-500">Active Duty Staff</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <Icon name="clock" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-amber-700">{pendingActivationCount}</p>
              <p className="text-xs font-semibold text-slate-500">
                Pending ({inactiveEmployeesCount} Inactive)
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              <Icon name="building" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-700">{data.departments.length}</p>
              <p className="text-xs font-semibold text-slate-500">Departments Across {data.branches.length} Branches</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Read-Only Notice Banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-md bg-blue-600 text-white shrink-0">
            <Icon name="info" size={13} />
          </span>
          <p className="text-[11px] text-blue-800">
            <strong className="font-semibold text-blue-950">Administrative Read-Only View:</strong> All employee onboarding, records editing, credential provisioning, and employee deletion actions are exclusively managed by the HR Manager.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'employees'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Icon name="users" size={14} />
          <span>Employees ({data.employees.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('structure')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'structure'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Icon name="building" size={14} />
          <span>Organizational Units</span>
        </button>
      </div>

      {activeTab === 'employees' ? (
        <Card className="overflow-hidden">
          {/* Filters Bar */}
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SearchInput
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                placeholder="Search by name, ID, email, title…"
                className="w-full lg:w-80"
              />

              <div className="flex flex-wrap items-center gap-2">
                {/* Organization Filter */}
                <select
                  value={companyFilter}
                  onChange={(e) => {
                    setCompanyFilter(e.target.value);
                    setBranchFilter('');
                    setDepartmentFilter('');
                    setPage(1);
                  }}
                  aria-label="Filter by organization"
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All Organizations</option>
                  <option value="__unassigned__">Unassigned Organization</option>
                  {data.companies.map((c) => (
                    <option key={c.public_id} value={c.public_id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {/* Branch Filter */}
                <select
                  value={branchFilter}
                  onChange={(e) => {
                    setBranchFilter(e.target.value);
                    setDepartmentFilter('');
                    setPage(1);
                  }}
                  aria-label="Filter by branch"
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All Branches</option>
                  <option value="__unassigned__">Unassigned Branch</option>
                  {filteredBranches.map((b) => (
                    <option key={b.public_id} value={b.public_id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                {/* Department Filter */}
                <select
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by department"
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All Departments</option>
                  <option value="__unassigned__">Unassigned</option>
                  {filteredDepartments.map((dept) => (
                    <option key={dept.public_id} value={dept.public_id}>
                      {dept.name}
                    </option>
                  ))}
                </select>

                {/* Designation Filter */}
                {uniqueDesignations.length > 0 && (
                  <select
                    value={designationFilter}
                    onChange={(e) => {
                      setDesignationFilter(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Filter by designation"
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All Designations</option>
                    {uniqueDesignations.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                  </select>
                )}

                {/* Employment Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by employment status"
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Terminated">Terminated</option>
                </select>

                {/* Account Activation Filter */}
                <select
                  value={activationFilter}
                  onChange={(e) => {
                    setActivationFilter(e.target.value as typeof activationFilter);
                    setPage(1);
                  }}
                  aria-label="Filter by account activation"
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All Accounts</option>
                  <option value="active">Active Accounts</option>
                  <option value="pending">Pending Activation</option>
                  <option value="inactive">Inactive / Suspended</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>
                Showing <strong>{filteredEmployees.length}</strong> of {data.employees.length} employees
              </span>
              {(search || companyFilter || branchFilter || departmentFilter || designationFilter || statusFilter || activationFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCompanyFilter('');
                    setBranchFilter('');
                    setDepartmentFilter('');
                    setDesignationFilter('');
                    setStatusFilter('');
                    setActivationFilter('all');
                  }}
                  className="text-blue-600 hover:text-blue-800 font-semibold"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>

          {filteredEmployees.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Employee Name & ID</th>
                      <th className="px-5 py-3.5">Department, Branch & Org</th>
                      <th className="px-5 py-3.5">Designation</th>
                      <th className="px-5 py-3.5">Official Email</th>
                      <th className="px-5 py-3.5">Reporting Manager</th>
                      <th className="px-5 py-3.5">Joining Date</th>
                      <th className="px-5 py-3.5">Employment Status</th>
                      <th className="px-5 py-3.5">Account Status</th>
                      <th className="px-5 py-3.5 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedEmployees.map((emp) => {
                      const deptObj = emp.department ? departmentMap.get(emp.department) : null;
                      const branchObj = deptObj?.branch ? branchMap.get(deptObj.branch) : null;
                      const branchName = emp.branch_name || branchObj?.name || deptObj?.branch_name;
                      const companyName =
                        emp.company_name ||
                        (branchObj?.company ? companyMap.get(branchObj.company) : null) ||
                        deptObj?.company_name;

                      const isAccountActive = emp.user_details?.is_active ?? true;
                      const isPendingActivation =
                        emp.employment_status.toLowerCase() === 'pending' || !isAccountActive;

                      const managerName = emp.manager_name || (emp.manager ? employeeMap.get(emp.manager) : null) || '—';

                      return (
                        <tr key={emp.public_id} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold text-xs ring-1 ring-blue-100">
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">
                                  {emp.first_name} {emp.last_name}
                                </p>
                                <span className="font-mono text-[10px] text-slate-400">
                                  ID: {emp.public_id.slice(0, 8)}…
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            {emp.department_name || deptObj?.name ? (
                              <>
                                <p className="font-medium text-slate-900">
                                  {emp.department_name || deptObj?.name}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {branchName ? `${branchName}${companyName ? ` · ${companyName}` : ''}` : 'No branch / organization'}
                                </p>
                              </>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                                Unassigned
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-3.5">
                            <p className="font-medium text-slate-800">
                              {emp.job_title || 'Staff Member'}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              Role: {getEmployeeRoleName(emp) || 'Employee'}
                            </p>
                          </td>

                          <td className="px-5 py-3.5 text-slate-600">
                            <p className="font-medium text-slate-800 break-all">{emp.email || '—'}</p>
                            {emp.phone && <p className="text-[10px] text-slate-400">{emp.phone}</p>}
                          </td>

                          <td className="px-5 py-3.5 text-slate-600">
                            <p className="font-medium text-slate-800">{managerName}</p>
                          </td>

                          <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                            {formatDate(emp.hire_date)}
                          </td>

                          <td className="px-5 py-3.5">
                            <StatusBadge status={emp.employment_status} />
                          </td>

                          <td className="px-5 py-3.5">
                            {isPendingActivation ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200 whitespace-nowrap">
                                <span className="size-1.5 rounded-full bg-amber-500" />
                                Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200 whitespace-nowrap">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => setViewEmployee(emp)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                              title="View Employee Profile"
                            >
                              <Icon name="user" size={14} />
                            </button>
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
                totalItems={filteredEmployees.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          ) : (
            <EmptyState
              icon="users"
              title="No employees match your search"
              description="Try adjusting your search criteria or clear active filters."
            />
          )}
        </Card>
      ) : (
        /* Structure Tab: Organization Units (Read Only) */
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Companies */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Organizations
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Corporate entities</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {data.companies.length}
              </span>
            </div>
            {data.companies.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs">
                {data.companies.map((company) => (
                  <div key={company.public_id} className="p-4 hover:bg-slate-50/70 transition">
                    <p className="font-semibold text-slate-900">{company.name}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Reg: {company.registration_number || 'N/A'} · Contact:{' '}
                      {company.contact_email || '—'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No registered organizations" description="Company records will appear here." />
            )}
          </Card>

          {/* Branches */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Branches
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Physical office locations</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {data.branches.length}
              </span>
            </div>
            {data.branches.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs">
                {data.branches.map((branch) => (
                  <div key={branch.public_id} className="p-4 hover:bg-slate-50/70 transition">
                    <p className="font-semibold text-slate-900">{branch.name}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Company: {branch.company_name || companyMap.get(branch.company || '') || 'Primary'} · Location: {branch.location || 'HQ'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      Branch Manager:{' '}
                      <span className="font-medium text-slate-800">
                        {branch.manager_name || 'Unassigned'}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No branches recorded" description="Branch records will appear here." />
            )}
          </Card>

          {/* Departments */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Departments
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Operating team units</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {data.departments.length}
              </span>
            </div>
            {data.departments.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs">
                {data.departments.map((dept) => (
                  <div key={dept.public_id} className="p-4 hover:bg-slate-50/70 transition">
                    <p className="font-semibold text-slate-900">{dept.name}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Branch: {dept.branch_name || 'Main Office'} · Entity:{' '}
                      {dept.company_name || 'Enterprise'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      Department Head:{' '}
                      <span className="font-medium text-slate-800">
                        {dept.head_name || 'Unassigned'}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No departments defined" description="Department records will appear here." />
            )}
          </Card>
        </div>
      )}

      {/* Modal: View Employee Details (Read-Only) */}
      {viewEmployee && (
        <Modal
          title="Employee Profile Details"
          description="Read-only workforce personnel dossier and organizational assignments."
          onClose={() => setViewEmployee(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-xs">
                {viewEmployee.first_name[0]}{viewEmployee.last_name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    {viewEmployee.first_name} {viewEmployee.last_name}
                  </h3>
                  <StatusBadge status={viewEmployee.employment_status} />
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {viewEmployee.job_title || 'Staff Member'} · {viewEmployee.department_name || 'Unassigned'}
                </p>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                  ID: {viewEmployee.public_id}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Official Email
                </p>
                <p className="mt-1 font-semibold text-slate-800 break-all">
                  {viewEmployee.email || viewEmployee.user_details?.email || '—'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Login Username
                </p>
                <p className="mt-1 font-mono font-semibold text-slate-800">
                  @{viewEmployee.user_details?.username || '—'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Contact Phone
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {viewEmployee.phone || 'Not provided'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Joining / Hire Date
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {formatDate(viewEmployee.hire_date)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Department
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {viewEmployee.department_name || 'Unassigned'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Branch Office
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {viewEmployee.branch_name ||
                    (getEmployeeBranchId(viewEmployee)
                      ? branchMap.get(getEmployeeBranchId(viewEmployee)!)?.name
                      : null) ||
                    'Unassigned'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Organization
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {viewEmployee.company_name ||
                    (getEmployeeCompanyId(viewEmployee)
                      ? companyMap.get(getEmployeeCompanyId(viewEmployee)!)
                      : null) ||
                    'Unassigned'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Reporting Manager
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {viewEmployee.manager_name || (viewEmployee.manager ? employeeMap.get(viewEmployee.manager) : null) || 'No Reporting Manager'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Assigned Access Role
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {getEmployeeRoleName(viewEmployee) || 'Employee'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Account Status
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {viewEmployee.user_details?.is_active ?? true ? (
                    <span className="text-emerald-700">Active Account</span>
                  ) : (
                    <span className="text-amber-700">Pending Activation</span>
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              <p className="font-semibold text-slate-700">Administrative Read-Only Notice</p>
              <p className="mt-0.5 text-slate-500">
                To modify personal details, reassign departments, or update credentials for this employee, contact the HR Department.
              </p>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setViewEmployee(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

