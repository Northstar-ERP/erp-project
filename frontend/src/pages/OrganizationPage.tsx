import { useCallback, useEffect, useState } from 'react';
import { client, unwrapList } from '../api/client';
import type { Branch, Company, Department, Employee } from '../api/types';
import { displayError } from '../components/format';
import { useAuth } from '../context/auth';
import {
  Card,
  EmptyState,
  ErrorMessage,
  Icon,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '../components/ui';

type OrgData = {
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
};

export default function OrganizationPage() {
  const { hasRole } = useAuth();
  const canManageEmployees = hasRole(['System Admin', 'HR Manager']);
  const [data, setData] = useState<OrgData>({
    companies: [],
    branches: [],
    departments: [],
    employees: [],
  });
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, string>>({});
  const [savingEmployee, setSavingEmployee] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [companies, branches, departments, employees] = await Promise.all([
        client.companies(),
        client.branches(),
        client.departments(),
        client.employees(),
      ]);
      const employeeList = unwrapList(employees.data);
      setData({
        companies: unwrapList(companies.data),
        branches: unwrapList(branches.data),
        departments: unwrapList(departments.data),
        employees: employeeList,
      });
      setStatusDrafts(Object.fromEntries(
        employeeList.map((employee) => [employee.public_id, employee.employment_status]),
      ));
      setDepartmentDrafts(Object.fromEntries(
        employeeList.map((employee) => [employee.public_id, employee.department ?? '']),
      ));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const saveEmployeeStatus = async (employee: Employee) => {
    const employment_status = statusDrafts[employee.public_id] ?? employee.employment_status;
    const department = departmentDrafts[employee.public_id] ?? employee.department ?? '';
    if (
      employment_status === employee.employment_status &&
      department === (employee.department ?? '')
    ) return;

    setSavingEmployee(employee.public_id);
    setError('');
    try {
      const { data: updatedEmployee } = await client.updateEmployee(
        employee.public_id,
        {
          employment_status,
          department: department || null,
        },
      );
      setData((current) => ({
        ...current,
        employees: current.employees.map((item) =>
          item.public_id === updatedEmployee.public_id ? updatedEmployee : item,
        ),
      }));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setSavingEmployee(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="People & structure" title="Organization" description="Explore the companies, branches, and departments that make up your organization." />
      {error && <div className="mb-5"><ErrorMessage>{error}</ErrorMessage></div>}
      {loading ? <LoadingState label="Loading organization directory" /> : <>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[{ name: 'Companies', value: data.companies.length, icon: 'building' as const }, { name: 'Branches', value: data.branches.length, icon: 'briefcase' as const }, { name: 'Departments', value: data.departments.length, icon: 'users' as const }].map((item) => <Card key={item.name} className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name={item.icon} /></span><div><p className="text-2xl font-bold text-slate-900">{item.value}</p><p className="text-xs font-medium text-slate-500">{item.name}</p></div></Card>)}
        </div>
        <Card className="mb-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div><h2 className="text-sm font-bold text-slate-900">Employees</h2><p className="mt-1 text-xs text-slate-500">Employee directory and work status</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{data.employees.length}</span>
          </div>
          {data.employees.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-5 py-3 font-semibold">Employee</th><th className="px-5 py-3 font-semibold">Username</th><th className="px-5 py-3 font-semibold">Department</th><th className="px-5 py-3 font-semibold">Work status</th>{canManageEmployees && <th className="px-5 py-3 font-semibold">Action</th>}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.employees.map((employee) => (
                    <tr key={employee.public_id}>
                      <td className="px-5 py-4"><p className="font-semibold text-slate-800">{employee.first_name} {employee.last_name}</p><p className="mt-1 text-xs text-slate-500">{employee.job_title || employee.email || 'Employee'}</p></td>
                      <td className="px-5 py-4 text-slate-600">{employee.user_details?.username || '—'}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {canManageEmployees ? (
                          <select
                            aria-label={`Department for ${employee.first_name} ${employee.last_name}`}
                            className="max-w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            value={departmentDrafts[employee.public_id] ?? employee.department ?? ''}
                            onChange={(event) => setDepartmentDrafts((current) => ({
                              ...current,
                              [employee.public_id]: event.target.value,
                            }))}
                          >
                            <option value="">No department</option>
                            {data.departments.map((department) => <option key={department.public_id} value={department.public_id}>{department.name}</option>)}
                          </select>
                        ) : employee.department_name || '—'}
                      </td>
                      <td className="px-5 py-4">
                        {canManageEmployees ? (
                          <select
                            aria-label={`Work status for ${employee.first_name} ${employee.last_name}`}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            value={statusDrafts[employee.public_id] ?? employee.employment_status}
                            onChange={(event) => setStatusDrafts((current) => ({
                              ...current,
                              [employee.public_id]: event.target.value,
                            }))}
                          >
                            {[...new Set(['Active', 'On Leave', 'Inactive', 'Terminated', employee.employment_status])].map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        ) : <StatusBadge status={employee.employment_status} />}
                      </td>
                      {canManageEmployees && <td className="px-5 py-4"><button type="button" disabled={savingEmployee === employee.public_id || ((statusDrafts[employee.public_id] ?? employee.employment_status) === employee.employment_status && (departmentDrafts[employee.public_id] ?? employee.department ?? '') === (employee.department ?? ''))} onClick={() => void saveEmployeeStatus(employee)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{savingEmployee === employee.public_id ? 'Saving…' : 'Save changes'}</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No employees found" description="Employee records will appear here when available." />}
        </Card>
        {!data.companies.length && !data.branches.length && !data.departments.length ? <Card><EmptyState title="Organization directory is empty" description="Your organization structure will appear here when it is available." /></Card> : <div className="grid gap-5 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="text-sm font-bold text-slate-900">Companies</h2><p className="mt-1 text-xs text-slate-500">Registered organizations</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{data.companies.length}</span></div>
            {data.companies.length ? <div className="divide-y divide-slate-100">{data.companies.map((company) => <div key={company.public_id} className="flex items-center gap-3 p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon name="building" size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{company.name}</p><p className="mt-1 truncate text-xs text-slate-500">{company.registration_number || company.contact_email || 'Company record'}</p></div></div>)}</div> : <EmptyState title="No companies" description="No company records are visible." />}
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="text-sm font-bold text-slate-900">Branches</h2><p className="mt-1 text-xs text-slate-500">Office locations by company</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{data.branches.length}</span></div>
            {data.branches.length ? <div className="divide-y divide-slate-100">{data.branches.map((branch) => <div key={branch.public_id} className="flex items-center gap-3 p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700"><Icon name="briefcase" size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{branch.name}</p><p className="mt-1 truncate text-xs text-slate-500">{branch.company_name || 'Company not specified'}{branch.location ? ` · ${branch.location}` : ''}</p></div></div>)}</div> : <EmptyState title="No branches" description="Branch records will appear here." />}
          </Card>
          <Card className="overflow-hidden xl:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="text-sm font-bold text-slate-900">Departments</h2><p className="mt-1 text-xs text-slate-500">Teams and reporting structure</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{data.departments.length}</span></div>
            {data.departments.length ? <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">{data.departments.map((department) => <div key={department.public_id} className="bg-white p-5"><p className="text-sm font-semibold text-slate-800">{department.name}</p><p className="mt-1 text-xs text-slate-500">{department.branch_name || 'Branch not specified'}{department.company_name ? ` · ${department.company_name}` : ''}</p></div>)}</div> : <EmptyState title="No departments" description="Department records will appear here." />}
          </Card>
        </div>}
      </>}
    </>
  );
}
