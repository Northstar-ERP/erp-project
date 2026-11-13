import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Branch, Company, Department, Employee, Role } from '../api/types';
import { displayError, formatDate } from '../components/format';
import { OrgHierarchySelect } from '../components/OrgHierarchySelect';
import { useAuth } from '../context/auth';
import {
  deriveHierarchyForEmployee,
  getEmployeeRoleName,
  type HierarchySelection,
} from '../utils/managers';
import {
  Button,
  Card,
  ConfirmDialog,
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

type OrgData = {
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  roles: Role[];
};

const PAGE_SIZE = 10;

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

export default function OrganizationPage() {
  const { hasRole, user: currentUser } = useAuth();
  const isAdmin = hasRole(['System Admin']) || Boolean(currentUser?.is_superuser);
  const isHR = hasRole(['HR Manager']);
  const canManageEmployees = isHR || isAdmin;

  const [activeTab, setActiveTab] = useState<'employees' | 'structure'>('employees');
  const [data, setData] = useState<OrgData>({
    companies: [],
    branches: [],
    departments: [],
    employees: [],
    roles: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals & Drawers
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');

  // Auto-generated Temporary Password State
  const [tempPassword, setTempPassword] = useState('');
  const [copiedPass, setCopiedPass] = useState(false);

  // One-time Created Credentials Modal
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    username: string;
    tempPass: string;
  } | null>(null);
  const [credentialsCopied, setCredentialsCopied] = useState(false);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activationFilter, setActivationFilter] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [page, setPage] = useState(1);

  // Add Employee Form Cascading State
  const [addHierarchy, setAddHierarchy] = useState<HierarchySelection>({
    companyId: '',
    branchId: '',
    departmentId: '',
  });
  const [addManager, setAddManager] = useState('');

  // Edit Employee Form Cascading State
  const [editHierarchy, setEditHierarchy] = useState<HierarchySelection>({
    companyId: '',
    branchId: '',
    departmentId: '',
  });
  const [editManager, setEditManager] = useState('');
  const [editEmploymentStatus, setEditEmploymentStatus] = useState('');
  const [editResignationDate, setEditResignationDate] = useState('');

  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      const [companiesRes, branchesRes, departmentsRes, employeesRes, rolesRes] = await Promise.all([
        client.companies(),
        client.branches(),
        client.departments(),
        client.employees(),
        client.roles().catch(() => ({ data: [] })),
      ]);

      setData({
        companies: unwrapList(companiesRes.data),
        branches: unwrapList(branchesRes.data),
        departments: unwrapList(departmentsRes.data),
        employees: unwrapList(employeesRes.data),
        roles: unwrapList(rolesRes.data),
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

  // Lookup Maps for Branch & Company
  const branchMap = useMemo(() => new Map(data.branches.map((b) => [b.public_id, b])), [data.branches]);
  const departmentMap = useMemo(() => new Map(data.departments.map((d) => [d.public_id, d])), [data.departments]);

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

  // Filter options for list filters
  const filterBranches = useMemo(() => {
    if (!companyFilter || companyFilter === '__unassigned__') return data.branches;
    return data.branches.filter((b) => b.company === companyFilter);
  }, [data.branches, companyFilter]);

  const filterDepartments = useMemo(() => {
    if (!branchFilter || branchFilter === '__unassigned__') {
      if (!companyFilter || companyFilter === '__unassigned__') return data.departments;
      const companyBranchIds = new Set(filterBranches.map((b) => b.public_id));
      return data.departments.filter((d) => d.branch && companyBranchIds.has(d.branch));
    }
    return data.departments.filter((d) => d.branch === branchFilter);
  }, [data.departments, branchFilter, companyFilter, filterBranches]);

  // Unique designations for filter
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
      const empCode = (emp.employee_code || '').toLowerCase();

      const matchesSearch =
        !search ||
        fullName.includes(search.toLowerCase()) ||
        username.includes(search.toLowerCase()) ||
        email.includes(search.toLowerCase()) ||
        jobTitle.includes(search.toLowerCase()) ||
        empId.includes(search.toLowerCase()) ||
        empCode.includes(search.toLowerCase());

      // Company matching
      const empCompanyId = getEmployeeCompanyId(emp);
      const matchesCompany =
        !companyFilter ||
        (companyFilter === '__unassigned__' ? !empCompanyId : empCompanyId === companyFilter);

      // Branch matching
      const empBranchId = getEmployeeBranchId(emp);
      const matchesBranch =
        !branchFilter ||
        (branchFilter === '__unassigned__' ? !empBranchId : empBranchId === branchFilter);

      // Department matching
      const matchesDept =
        !departmentFilter ||
        (departmentFilter === '__unassigned__'
          ? !emp.department
          : emp.department === departmentFilter || emp.department_name === departmentFilter);

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
        matchesActivation = !isAccountActive || ['inactive', 'terminated', 'resigned'].includes(emp.employment_status.toLowerCase());
      }

      return matchesSearch && matchesCompany && matchesBranch && matchesDept && matchesStatus && matchesDesignation && matchesActivation;
    });
  }, [
    data.employees,
    search,
    companyFilter,
    branchFilter,
    departmentFilter,
    statusFilter,
    designationFilter,
    activationFilter,
    getEmployeeCompanyId,
    getEmployeeBranchId,
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

  // Open Add Employee Modal with auto-generated secure temporary password
  const openAddEmployeeModal = () => {
    setFormError('');
    setTempPassword(generateSecurePassword());
    setCopiedPass(false);
    const firstCompanyId = data.companies[0]?.public_id ?? '';
    const firstBranches = data.branches.filter((b) => b.company === firstCompanyId);
    const firstBranchId = firstBranches[0]?.public_id ?? '';
    const firstDepts = data.departments.filter((d) => d.branch === firstBranchId);
    const firstDeptId = firstDepts[0]?.public_id ?? '';
    setAddHierarchy({
      companyId: firstCompanyId,
      branchId: firstBranchId,
      departmentId: firstDeptId,
    });
    setAddManager('');
    setAddModalOpen(true);
  };

  // Handler: Add New Employee (atomic user + employee creation)
  const handleAddEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    setSuccess('');

    const form = new FormData(event.currentTarget);

    // Personal Info
    const firstName = String(form.get('first_name') ?? '').trim();
    const lastName = String(form.get('last_name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const phone = String(form.get('phone') ?? '').trim() || null;

    // Employment Info
    const department = addHierarchy.departmentId || null;
    const jobTitle = String(form.get('job_title') ?? '').trim();
    const hireDate = String(form.get('hire_date') ?? '');
    const employmentStatus = String(form.get('employment_status') ?? 'Active');
    const manager = addManager || null;

    // Account Info
    const username = String(form.get('username') ?? '').trim();
    const password = tempPassword.trim();

    // Validations
    if (!firstName || !lastName) {
      setFormError('Please enter both first and last name.');
      setSaving(false);
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Please provide a valid official corporate email address.');
      setSaving(false);
      return;
    }
    if (!username) {
      setFormError('Please provide a login username for the employee account.');
      setSaving(false);
      return;
    }
    if (!addHierarchy.companyId || !addHierarchy.branchId || !department) {
      setFormError('Organization, Branch, and Department are all required.');
      setSaving(false);
      return;
    }
    if (manager) {
      const selectedDept = departmentMap.get(department);
      const selectedBranch = selectedDept?.branch ? branchMap.get(selectedDept.branch) : undefined;
      const empCompanyId = selectedBranch?.company;
      const mgrEmp = data.employees.find((e) => e.public_id === manager);
      const mgrCompanyId = mgrEmp ? getEmployeeCompanyId(mgrEmp) : null;
      if (empCompanyId && mgrCompanyId && empCompanyId !== mgrCompanyId) {
        setFormError('An employee’s manager must belong to the same company.');
        setSaving(false);
        return;
      }
    }
    if (password.length < 8) {
      setFormError('Temporary password must be at least 8 characters in length.');
      setSaving(false);
      return;
    }

    // Check for duplicate email in roster
    const emailExists = data.employees.some(
      (e) => (e.email || '').toLowerCase() === email,
    );
    if (emailExists) {
      setFormError(`An employee record with official email "${email}" already exists.`);
      setSaving(false);
      return;
    }

    // Check for duplicate username
    const usernameExists = data.employees.some(
      (e) => (e.user_details?.username || '').toLowerCase() === username.toLowerCase(),
    );
    if (usernameExists) {
      setFormError(`A user account with username "${username}" is already assigned.`);
      setSaving(false);
      return;
    }

    try {
      const employeeRole = data.roles.find((r) => r.role_name === 'Employee');
      const roleUuid = employeeRole?.public_id || null;

      // Atomic User + Employee creation in a single backend transaction
      await client.createEmployee({
        username,
        password,
        role: roleUuid,
        is_active: true,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        job_title: jobTitle,
        department,
        hire_date: hireDate,
        employment_status: employmentStatus,
        manager,
      });

      // Close create form and show one-time credentials display modal
      setAddModalOpen(false);
      setCreatedCredentials({
        name: `${firstName} ${lastName}`,
        email,
        username,
        tempPass: password,
      });
      setCredentialsCopied(false);
      setSuccess(`Employee record and account successfully created for ${firstName} ${lastName}.`);

      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Handler: Edit Employee Profile
  const handleEditEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editEmployee) return;

    setSaving(true);
    setFormError('');
    setError('');
    setSuccess('');

    const form = new FormData(event.currentTarget);
    const firstName = String(form.get('first_name') ?? '').trim();
    const lastName = String(form.get('last_name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim() || null;
    const jobTitle = String(form.get('job_title') ?? '').trim() || null;
    const department = editHierarchy.departmentId || null;
    const manager = editManager || null;
    const employmentStatus = editEmploymentStatus || editEmployee.employment_status;
    const isSeparating = ['resigned', 'terminated'].includes(employmentStatus.toLowerCase());

    if (isSeparating && !editResignationDate) {
      setFormError('A resignation/termination date is required for this employment status.');
      setSaving(false);
      return;
    }

    if (manager === editEmployee.public_id) {
      setFormError('An employee cannot be designated as their own reporting manager.');
      setSaving(false);
      return;
    }

    if (!editHierarchy.companyId || !editHierarchy.branchId || !department) {
      setFormError('Organization, Branch, and Department are all required.');
      setSaving(false);
      return;
    }

    if (manager && department) {
      const selectedDept = departmentMap.get(department);
      const selectedBranch = selectedDept?.branch ? branchMap.get(selectedDept.branch) : undefined;
      const empCompanyId = selectedBranch?.company;
      const mgrEmp = data.employees.find((e) => e.public_id === manager);
      const mgrCompanyId = mgrEmp ? getEmployeeCompanyId(mgrEmp) : null;
      if (empCompanyId && mgrCompanyId && empCompanyId !== mgrCompanyId) {
        setFormError('An employee’s manager must belong to the same company.');
        setSaving(false);
        return;
      }
    }

    try {
      const { data: updated } = await client.updateEmployee(editEmployee.public_id, {
        first_name: firstName || editEmployee.first_name,
        last_name: lastName || editEmployee.last_name,
        phone,
        job_title: jobTitle,
        department,
        manager,
        employment_status: employmentStatus,
        ...(isSeparating
          ? { resignation_date: editResignationDate }
          : employmentStatus.toLowerCase() === 'active'
            ? { resignation_date: null }
            : {}),
      });

      setData((prev) => ({
        ...prev,
        employees: prev.employees.map((e) =>
          e.public_id === updated.public_id ? updated : e,
        ),
      }));
      setSuccess(`Updated details for ${updated.first_name} ${updated.last_name}.`);
      setEditEmployee(null);
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Handler: Delete Employee via Backend API (Soft-Delete)
  const executeDeleteEmployee = async (emp: Employee) => {
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await client.deleteEmployee(emp.public_id);
      setData((prev) => ({
        ...prev,
        employees: prev.employees.filter((e) => e.public_id !== emp.public_id),
      }));
      setSuccess(`Employee "${emp.first_name} ${emp.last_name}" (ID: ${emp.employee_code || emp.public_id.slice(0, 8)}) has been soft-deleted from active records.`);
      setEmployeeToDelete(null);
    } catch (cause) {
      setError(displayError(cause) || 'Failed to delete employee. The record may be restricted by existing assignments.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading workforce directory and organizational structure…" />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        eyebrow="HR Management"
        title="Employee Management"
        description="Comprehensive workforce administration: onboard employees, manage personnel profiles, provision login credentials, and maintain organizational hierarchy."
        action={
          canManageEmployees ? (
            <Button
              variant="primary"
              size="sm"
              onClick={openAddEmployeeModal}
            >
              <Icon name="plus" size={14} />
              <span>Add New Employee</span>
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* KPI Tiles */}
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
              <p className="text-xs font-semibold text-slate-500">Active Staff</p>
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
              <p className="text-xs font-semibold text-slate-500">Pending Setup / Leave</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
              <Icon name="building" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-indigo-700">{data.departments.length}</p>
              <p className="text-xs font-semibold text-slate-500">Departments Established</p>
            </div>
          </div>
        </Card>
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
                placeholder="Search by name, ID, username, email, title…"
                className="w-full lg:w-80"
              />

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Company Filter */}
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
                  {filterBranches.map((b) => (
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
                  {filterDepartments.map((dept) => (
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

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by employment status"
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">All Employment Statuses</option>
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Resigned">Resigned</option>
                  <option value="Terminated">Terminated</option>
                </select>

                {/* Activation Status Filter */}
                <select
                  value={activationFilter}
                  onChange={(e) => {
                    setActivationFilter(e.target.value as typeof activationFilter);
                    setPage(1);
                  }}
                  aria-label="Filter by account activation"
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All Account Statuses</option>
                  <option value="active">Active Accounts</option>
                  <option value="pending">Pending Activation</option>
                  <option value="inactive">Inactive / Suspended</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>
                Displaying <strong>{filteredEmployees.length}</strong> of {data.employees.length} employee records
              </span>
              {(search || companyFilter || branchFilter || departmentFilter || statusFilter || designationFilter || activationFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCompanyFilter('');
                    setBranchFilter('');
                    setDepartmentFilter('');
                    setStatusFilter('');
                    setDesignationFilter('');
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
                <table className="w-full min-w-[920px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5">Employee Name & ID</th>
                      <th className="px-5 py-3.5">Department, Branch & Org</th>
                      <th className="px-5 py-3.5">Designation</th>
                      <th className="px-5 py-3.5">Joining / Exit Date</th>
                      <th className="px-5 py-3.5">Employment Status</th>
                      <th className="px-5 py-3.5">Account Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedEmployees.map((emp) => {
                      const isAccountActive = emp.user_details?.is_active ?? true;
                      const isPendingActivation =
                        emp.employment_status.toLowerCase() === 'pending' || !isAccountActive;
                      const deptObj = emp.department ? departmentMap.get(emp.department) : undefined;
                      const branchObj = deptObj?.branch ? branchMap.get(deptObj.branch) : undefined;
                      const branchLabel = emp.branch_name || branchObj?.name || deptObj?.branch_name;
                      const companyLabel = emp.company_name || branchObj?.company_name || deptObj?.company_name;

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
                                <p className="text-[11px] text-slate-500 truncate">
                                  {emp.email || `@${emp.user_details?.username || 'user'}`}
                                </p>
                                <span className="font-mono text-[10px] text-slate-400">
                                  ID: {emp.employee_code || emp.public_id.slice(0, 8)}
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
                                  {branchLabel ? `${branchLabel}${companyLabel ? ` · ${companyLabel}` : ''}` : 'No branch / organization'}
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
                              Role: {getEmployeeRoleName(emp, data.roles) || 'Employee'}
                            </p>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            <p>{formatDate(emp.hire_date)}</p>
                            {emp.resignation_date && (
                              <p className="text-[10px] text-rose-500">
                                Exit: {formatDate(emp.resignation_date)}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={emp.employment_status} />
                          </td>
                          <td className="px-5 py-3.5">
                            {isPendingActivation ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                                <span className="size-1.5 rounded-full bg-amber-500" />
                                Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Details */}
                              <button
                                type="button"
                                onClick={() => setViewEmployee(emp)}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                                title="View Employee Details"
                              >
                                <Icon name="user" size={14} />
                              </button>

                              {/* Edit Employee */}
                              {canManageEmployees && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormError('');
                                    setEditHierarchy(
                                      deriveHierarchyForEmployee(
                                        emp.department,
                                        data.departments,
                                        data.branches,
                                        emp.branch,
                                        emp.company,
                                      ),
                                    );
                                    setEditManager(emp.manager || '');
                                    setEditEmploymentStatus(emp.employment_status);
                                    setEditResignationDate(emp.resignation_date || '');
                                    setEditEmployee(emp);
                                  }}
                                  className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 transition"
                                  title="Edit Employee Details"
                                >
                                  <Icon name="edit" size={14} />
                                </button>
                              )}

                              {/* Delete Employee */}
                              {canManageEmployees && (
                                <button
                                  type="button"
                                  onClick={() => setEmployeeToDelete(emp)}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                  title="Delete Employee"
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              )}
                            </div>
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
              description="Try adjusting your search terms or filter selections."
            />
          )}
        </Card>
      ) : (
        /* Structure Tab: Organization Units */
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Companies */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Companies
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Registered corporate entities</p>
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
              <EmptyState title="No registered companies" description="Company records will appear here." />
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
                      Company: {branch.company_name || 'Primary'} · Loc: {branch.location || 'HQ'}
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
                <p className="mt-0.5 text-[11px] text-slate-500">Operating teams</p>
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

      {/* Modal: Add New Employee */}
      {addModalOpen && (
        <Modal
          title="Add New Employee"
          description="Provision a new employee record, associate organizational units, and generate secure login credentials."
          onClose={() => setAddModalOpen(false)}
        >
          {formError && <ErrorMessage>{formError}</ErrorMessage>}

          <form onSubmit={handleAddEmployee} className="space-y-6">
            {/* Section 1: Personal Information */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Icon name="user" size={15} className="text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Personal Information
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="First Name"
                  name="first_name"
                  type="text"
                  required
                  placeholder="e.g. Alexander"
                />
                <Field
                  label="Last Name"
                  name="last_name"
                  type="text"
                  required
                  placeholder="e.g. Vance"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Official Email Address"
                  name="email"
                  type="email"
                  required
                  placeholder="e.g. a.vance@northstar.example"
                  hint="Official corporate email address"
                />
                <Field
                  label="Mobile / Contact Number"
                  name="phone"
                  type="tel"
                  placeholder="+1 (555) 019-2831"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Date of Birth"
                  name="dob"
                  type="date"
                  hint="Tracked for HR employee lifecycle records"
                />
                <SelectField
                  label="Gender"
                  name="gender"
                >
                  <option value="">Select gender (Optional)</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary">Non-Binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </SelectField>
              </div>

              <div>
                <Field
                  label="Residential / Street Address"
                  name="address"
                  type="text"
                  placeholder="e.g. 742 Evergreen Terrace, Suite 100"
                />
              </div>
            </div>

            {/* Section 2: Employment Information */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Icon name="briefcase" size={15} className="text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Employment & Hierarchy
                </h3>
              </div>

              <OrgHierarchySelect
                companies={data.companies}
                branches={data.branches}
                departments={data.departments}
                value={addHierarchy}
                onChange={(next) => {
                  setAddHierarchy(next);
                  if (addManager) {
                    const mgrEmp = data.employees.find((e) => e.public_id === addManager);
                    if (mgrEmp && next.companyId && getEmployeeCompanyId(mgrEmp) !== next.companyId) {
                      setAddManager('');
                    }
                  }
                }}
                canCreateDepartment={canManageEmployees}
                onDepartmentCreated={(newDept) =>
                  setData((prev) => ({
                    ...prev,
                    departments: [...prev.departments, newDept],
                  }))
                }
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Designation / Job Title"
                  name="job_title"
                  type="text"
                  required
                  placeholder="e.g. Senior Backend Engineer"
                />
                <Field
                  label="Joining / Hire Date"
                  name="hire_date"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  label="Employment Type"
                  name="employment_type"
                  defaultValue="Full-Time"
                >
                  <option value="Full-Time">Full-Time</option>
                  <option value="Part-Time">Part-Time</option>
                  <option value="Contract">Contract</option>
                  <option value="Intern">Intern</option>
                </SelectField>

                {/* Reporting Manager */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reports to (Manager)
                  </label>
                  <select
                    name="manager"
                    value={addManager}
                    onChange={(e) => setAddManager(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">No Reporting Manager</option>
                    {data.employees
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

                <SelectField
                  label="Employment Status"
                  name="employment_status"
                  defaultValue="Active"
                >
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Pending">Pending Activation</option>
                </SelectField>
              </div>
            </div>

            {/* Section 3: Account Information & Temporary Password */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Icon name="shield" size={15} className="text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Account Credentials Setup
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Login Username"
                  name="username"
                  type="text"
                  required
                  placeholder="e.g. alexander.vance"
                  hint="Used to authenticate at workspace login"
                />

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Temporary Password <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTempPassword(generateSecurePassword());
                        setCopiedPass(false);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Icon name="refresh" size={11} />
                      <span>Regenerate</span>
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={tempPassword}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 pr-20 font-mono text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(tempPassword);
                        setCopiedPass(true);
                        setTimeout(() => setCopiedPass(false), 2000);
                      }}
                      className="absolute right-1.5 rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      {copiedPass ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    A cryptographically unique temporary password will be provided once on creation.
                  </p>
                </div>
              </div>

              {/* Locked Access Role */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Assigned Access Role</p>
                  <p className="text-[11px] text-slate-500">
                    Standard employee self-service permissions enforced
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                  <Icon name="shield" size={12} />
                  Employee (Locked)
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setAddModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Provisioning Employee…</span>
                  </>
                ) : (
                  <>
                    <Icon name="check" size={14} />
                    <span>Create Employee</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: One-Time Credentials Display After Employee Creation */}
      {createdCredentials && (
        <Modal
          title="Employee Account Created"
          description="The employee record and login account have been successfully provisioned. Please securely communicate these initial credentials to the employee."
          onClose={() => setCreatedCredentials(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                <Icon name="check" size={20} />
              </span>
              <div>
                <h4 className="font-bold text-emerald-950 text-sm">{createdCredentials.name}</h4>
                <p className="text-xs text-emerald-800">Account status: Active · Role: Employee</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Login Credentials
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Official Email</span>
                  <p className="font-semibold text-slate-900 mt-0.5 break-all">{createdCredentials.email}</p>
                </div>

                <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Username</span>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">@{createdCredentials.username}</p>
                </div>
              </div>

              <div className="rounded-lg bg-white border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Temporary Password</span>
                  <span className="text-[10px] text-amber-600 font-medium">Shown Once</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm font-bold text-blue-700 bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200 select-all flex-1">
                    {createdCredentials.tempPass}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const text = `Northstar ERP Employee Credentials:\nUsername: ${createdCredentials.username}\nTemporary Password: ${createdCredentials.tempPass}\nOfficial Email: ${createdCredentials.email}`;
                      void navigator.clipboard.writeText(text);
                      setCredentialsCopied(true);
                      setTimeout(() => setCredentialsCopied(false), 2500);
                    }}
                  >
                    <Icon name="check" size={13} />
                    <span>{credentialsCopied ? 'Copied!' : 'Copy Credentials'}</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* HR Notice & Instructions */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <Icon name="info" size={14} />
                <span>HR Dispatch Instructions & System Notice</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-900">
                <li>
                  Securely communicate these credentials to the employee out-of-band (via encrypted messaging, enterprise Slack/Teams, or in person).
                </li>
                <li>
                  The employee can log in immediately with their username and temporary password.
                </li>
                <li>
                  <strong>Backend Notice:</strong> Forced password change on first login is currently not supported by the Django backend User model (no <code className="font-mono text-amber-950">must_change_password</code> flag). Please advise the employee to update their password from their profile after logging in.
                </li>
              </ul>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button
                variant="primary"
                onClick={() => setCreatedCredentials(null)}
              >
                I Have Saved The Credentials
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: View Employee Profile Details */}
      {viewEmployee && (
        <Modal
          title="Employee Profile Details"
          description="Detailed workforce record and organizational custody details."
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
                  ID: {viewEmployee.employee_code || viewEmployee.public_id}
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

              {viewEmployee.resignation_date && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Resignation / Termination Date
                  </p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {formatDate(viewEmployee.resignation_date)}
                  </p>
                </div>
              )}

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
                      ? data.companies.find((c) => c.public_id === getEmployeeCompanyId(viewEmployee))?.name
                      : null) ||
                    'Unassigned'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Reporting Manager
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {viewEmployee.manager_name || 'No Reporting Manager'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Assigned Access Role
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {getEmployeeRoleName(viewEmployee, data.roles) || 'Employee'}
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

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              {canManageEmployees && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const target = viewEmployee;
                    setViewEmployee(null);
                    setEditHierarchy(
                      deriveHierarchyForEmployee(
                        target.department,
                        data.departments,
                        data.branches,
                        target.branch,
                        target.company,
                      ),
                    );
                    setEditManager(target.manager || '');
                    setEditEmploymentStatus(target.employment_status);
                    setEditResignationDate(target.resignation_date || '');
                    setEditEmployee(target);
                  }}
                >
                  <Icon name="edit" size={14} />
                  <span>Edit Details</span>
                </Button>
              )}
              <Button variant="secondary" onClick={() => setViewEmployee(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Edit Employee Details */}
      {editEmployee && (
        <Modal
          title={`Edit Details: ${editEmployee.first_name} ${editEmployee.last_name}`}
          description="Update department assignment, job title, contact details, and employment status."
          onClose={() => setEditEmployee(null)}
        >
          {formError && <ErrorMessage>{formError}</ErrorMessage>}

          <form onSubmit={handleEditEmployee} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="First Name"
                name="first_name"
                defaultValue={editEmployee.first_name}
                required
              />
              <Field
                label="Last Name"
                name="last_name"
                defaultValue={editEmployee.last_name}
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Designation / Job Title"
                name="job_title"
                defaultValue={editEmployee.job_title || ''}
              />
              <Field
                label="Phone Number"
                name="phone"
                defaultValue={editEmployee.phone || ''}
              />
            </div>

            <OrgHierarchySelect
              companies={data.companies}
              branches={data.branches}
              departments={data.departments}
              value={editHierarchy}
              onChange={(next) => {
                setEditHierarchy(next);
                if (editManager) {
                  const mgrEmp = data.employees.find((e) => e.public_id === editManager);
                  if (mgrEmp && next.companyId && getEmployeeCompanyId(mgrEmp) !== next.companyId) {
                    setEditManager('');
                  }
                }
              }}
              canCreateDepartment={canManageEmployees}
              onDepartmentCreated={(newDept) =>
                setData((prev) => ({
                  ...prev,
                  departments: [...prev.departments, newDept],
                }))
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reports to (Manager)
                </label>
                <select
                  name="manager"
                  value={editManager}
                  onChange={(e) => setEditManager(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">No Reporting Manager</option>
                  {data.employees
                    .filter((e) => {
                      if (e.public_id === editEmployee.public_id) return false;
                      const targetCompany = editHierarchy.companyId || getEmployeeCompanyId(editEmployee);
                      if (!targetCompany) return false;
                      return getEmployeeCompanyId(e) === targetCompany;
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
                value={editEmploymentStatus}
                onChange={(e) => setEditEmploymentStatus(e.target.value)}
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
                <option value="Resigned">Resigned</option>
                <option value="Terminated">Terminated</option>
              </SelectField>

              {['resigned', 'terminated'].includes(editEmploymentStatus.toLowerCase()) && (
                <Field
                  label="Resignation / Termination Date"
                  name="resignation_date"
                  type="date"
                  required
                  value={editResignationDate}
                  onChange={(e) => setEditResignationDate(e.target.value)}
                  max={today}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditEmployee(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving Changes…' : 'Save Details'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog for Soft Deleting Employee */}
      {employeeToDelete && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Employee Record"
          description={`Are you sure you want to delete the employee record for "${employeeToDelete.first_name} ${employeeToDelete.last_name}" (ID: ${employeeToDelete.employee_code || employeeToDelete.public_id})? This will perform a backend soft-deletion, removing them from active workforce rosters while preserving historical audit logs, past leave, attendance, and expense records.`}
          confirmLabel="Delete Employee"
          isDestructive={true}
          isLoading={deleting}
          onConfirm={() => executeDeleteEmployee(employeeToDelete)}
          onCancel={() => setEmployeeToDelete(null)}
        />
      )}
    </div>
  );
}
