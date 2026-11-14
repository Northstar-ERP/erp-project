import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Branch, Company, Department, Employee } from '../api/types';
import { displayError } from '../components/format';
import { isEmployeeManager } from '../utils/managers';
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
  TextareaField,
} from '../components/ui';

const PAGE_SIZE = 8;

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [viewDetails, setViewDetails] = useState<Branch | null>(null);
  const [viewPeopleBranch, setViewPeopleBranch] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Search & Filter
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [branchRes, compRes, deptRes, empRes] = await Promise.all([
        client.branches(),
        client.companies(),
        client.departments(),
        client.employees(),
      ]);
      setBranches(unwrapList(branchRes.data));
      setCompanies(unwrapList(compRes.data));
      setDepartments(unwrapList(deptRes.data));
      setEmployees(unwrapList(empRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Company map for quick lookup
  const companyMap = useMemo(() => {
    return new Map(companies.map((c) => [c.public_id, c.name]));
  }, [companies]);

  // Filtered branches
  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const name = b.name.toLowerCase();
      const loc = (b.location || '').toLowerCase();
      const compName = (b.company_name || companyMap.get(b.company || '') || '').toLowerCase();
      const phone = (b.contact_phone || '').toLowerCase();
      const mgrName = (b.manager_name || '').toLowerCase();

      const matchesSearch =
        !search ||
        name.includes(search.toLowerCase()) ||
        loc.includes(search.toLowerCase()) ||
        compName.includes(search.toLowerCase()) ||
        phone.includes(search.toLowerCase()) ||
        mgrName.includes(search.toLowerCase());

      const matchesCompany = !companyFilter || b.company === companyFilter;

      return matchesSearch && matchesCompany;
    });
  }, [branches, search, companyFilter, companyMap]);

  const totalPages = Math.max(1, Math.ceil(filteredBranches.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredBranches.slice(start, start + PAGE_SIZE);
  }, [filteredBranches, page]);

  // Eligible branch managers for an edited branch (must belong to a department in this branch)
  const getEligibleBranchManagers = useCallback(
    (branchId: string) => {
      const branchDeptIds = new Set(
        departments.filter((d) => d.branch === branchId).map((d) => d.public_id),
      );
      return employees.filter((e) => e.department && branchDeptIds.has(e.department));
    },
    [departments, employees],
  );

  // Add Branch
  const handleAddBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);

    try {
      await client.createBranch({
        company: String(form.get('company')),
        name: String(form.get('name')).trim(),
        location: String(form.get('location')).trim(),
        contact_phone: String(form.get('contact_phone') ?? '').trim() || null,
        creation_reason: String(form.get('creation_reason') ?? '').trim() || null,
      });

      setSuccess(`Branch office "${form.get('name')}" registered successfully.`);
      setAddModalOpen(false);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Edit Branch
  const handleEditBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editBranch) return;
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    const managerValue = String(form.get('manager') ?? '').trim() || null;

    try {
      await client.updateBranch(editBranch.public_id, {
        company: String(form.get('company')),
        name: String(form.get('name')).trim(),
        location: String(form.get('location')).trim(),
        contact_phone: String(form.get('contact_phone') ?? '').trim() || null,
        creation_reason: String(form.get('creation_reason') ?? '').trim() || null,
        manager: managerValue,
      });

      setSuccess(`Branch "${editBranch.name}" updated successfully.`);
      setEditBranch(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administrative Control"
        title="Branch Office Management"
        description="Establish operational facilities, regional hubs, and field offices under parent organizations."
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setFormError('');
              setAddModalOpen(true);
            }}
          >
            <Icon name="plus" size={14} /> Add Branch
          </Button>
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* KPI Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon name="briefcase" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{branches.length}</p>
              <p className="text-xs text-slate-500 font-medium">Total Branch Offices</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
              <Icon name="building" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{companies.length}</p>
              <p className="text-xs text-slate-500 font-medium">Parent Organizations</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Icon name="check-circle" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">Online</p>
              <p className="text-xs text-slate-500 font-medium">Multi-Region Branch Grid</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search branches by name, location, phone…"
              className="w-full sm:w-64"
            />

            {companies.length > 0 && (
              <select
                value={companyFilter}
                onChange={(e) => {
                  setCompanyFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by parent organization"
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
              >
                <option value="">All Parent Organizations</option>
                {companies.map((c) => (
                  <option key={c.public_id} value={c.public_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="text-xs text-slate-500">
            Showing <strong>{filteredBranches.length}</strong> branch offices
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading branch offices…" />
        ) : filteredBranches.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title="No branch offices found"
            description={
              search || companyFilter
                ? 'No branch records match your search filter.'
                : 'No branch offices have been registered. Add your initial regional branch.'
            }
            action={
              !search && !companyFilter ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setFormError('');
                    setAddModalOpen(true);
                  }}
                >
                  <Icon name="plus" size={14} /> Add Branch
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Branch Name</th>
                    <th className="px-5 py-3">Parent Organization</th>
                    <th className="px-5 py-3">Branch Manager</th>
                    <th className="px-5 py-3">Physical Location</th>
                    <th className="px-5 py-3">Contact Phone</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageRows.map((branch) => {
                    const parentName =
                      branch.company_name ||
                      companyMap.get(branch.company || '') ||
                      'Enterprise Entity';

                    return (
                      <tr key={branch.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900">{branch.name}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                            UUID: {branch.public_id}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md text-[11px]">
                            {parentName}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={branch.manager_name ? 'font-medium text-slate-800' : 'text-slate-400'}>
                            {branch.manager_name || 'Unassigned'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {branch.location || '—'}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-600">
                          {branch.contact_phone || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewPeopleBranch(branch)}
                            >
                              <Icon name="users" size={13} /> View people
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewDetails(branch)}
                            >
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setFormError('');
                                setEditBranch(branch);
                              }}
                            >
                              <Icon name="edit" size={13} /> Edit
                            </Button>
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
              totalItems={filteredBranches.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Add Branch */}
      {addModalOpen && (
        <Modal
          title="Add New Branch Office"
          description="Establish an operational branch office linked to a parent organization entity."
          onClose={() => setAddModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={handleAddBranch}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Parent Organization"
              name="company"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select parent company…
              </option>
              {companies.map((c) => (
                <option key={c.public_id} value={c.public_id}>
                  {c.name}
                </option>
              ))}
            </SelectField>

            <Field
              label="Branch Name"
              name="name"
              required
              placeholder="e.g. Pune Technology Campus"
            />

            <Field
              label="Physical Location / City"
              name="location"
              required
              placeholder="e.g. Cyber City Tower 3, Magarpatta, Pune"
            />

            <Field
              label="Contact Phone (Optional)"
              name="contact_phone"
              placeholder="+91 20 6789 0000"
            />

            <TextareaField
              label="Branch Purpose / Operational Notes (Optional)"
              name="creation_reason"
              placeholder="R&D Center, Regional Client Service Center, Logistics Hub…"
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={saving || companies.length === 0}>
                {saving ? 'Creating…' : 'Save Branch'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Branch */}
      {editBranch && (
        <Modal
          title={`Edit Branch: ${editBranch.name}`}
          description="Update branch name, physical location, contact phone, or parent entity."
          onClose={() => setEditBranch(null)}
        >
          <form className="space-y-4" onSubmit={handleEditBranch}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Parent Organization"
              name="company"
              required
              defaultValue={editBranch.company || ''}
            >
              <option value="" disabled>
                Select parent company…
              </option>
              {companies.map((c) => (
                <option key={c.public_id} value={c.public_id}>
                  {c.name}
                </option>
              ))}
            </SelectField>

            <Field
              label="Branch Name"
              name="name"
              required
              defaultValue={editBranch.name}
            />

            <Field
              label="Physical Location"
              name="location"
              required
              defaultValue={editBranch.location || ''}
            />

            <Field
              label="Contact Phone"
              name="contact_phone"
              defaultValue={editBranch.contact_phone || ''}
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Branch Manager
              </label>
              <select
                name="manager"
                defaultValue={editBranch.manager || ''}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Unassigned (No Branch Manager)</option>
                {getEligibleBranchManagers(editBranch.public_id).map((emp) => (
                  <option key={emp.public_id} value={emp.public_id}>
                    {emp.first_name} {emp.last_name} ({emp.job_title || 'Staff'})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Rule check: A branch manager must work in a department belonging to this branch.
                {getEligibleBranchManagers(editBranch.public_id).length === 0 && (
                  <span className="block text-amber-600 font-medium mt-0.5">
                    No employees currently belong to departments in this branch.
                  </span>
                )}
              </p>
            </div>

            <TextareaField
              label="Operational Purpose / Reason"
              name="creation_reason"
              defaultValue={editBranch.creation_reason || ''}
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditBranch(null)}
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

      {/* Modal: View Details */}
      {viewDetails && (
        <Modal
          title={`Branch Profile: ${viewDetails.name}`}
          onClose={() => setViewDetails(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Public ID:</span>
                <span className="font-mono text-slate-800">{viewDetails.public_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Parent Company:</span>
                <span className="font-semibold text-blue-700">
                  {viewDetails.company_name || companyMap.get(viewDetails.company || '') || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Branch Manager:</span>
                <span className="font-semibold text-slate-800">
                  {viewDetails.manager_name || 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Contact Phone:</span>
                <span className="text-slate-800 font-mono">{viewDetails.contact_phone || '—'}</span>
              </div>
            </div>

            <div>
              <span className="font-semibold text-slate-800 block">Location:</span>
              <p className="mt-1 text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                {viewDetails.location || 'No location address recorded.'}
              </p>
            </div>

            {viewDetails.creation_reason && (
              <div>
                <span className="font-semibold text-slate-800 block">Establishment Context:</span>
                <p className="mt-1 text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {viewDetails.creation_reason}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setViewDetails(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: View People */}
      {viewPeopleBranch && (() => {
        const branchDepts = departments.filter((d) => d.branch === viewPeopleBranch.public_id);
        const branchDeptIds = new Set(branchDepts.map((d) => d.public_id));
        const branchEmployees = employees.filter(
          (e) => e.department && branchDeptIds.has(e.department),
        );
        const branchManagersCount = branchEmployees.filter((e) =>
          isEmployeeManager(e, branches, departments, employees),
        ).length;

        return (
          <Modal
            title={`People in ${viewPeopleBranch.name}`}
            description={`Workforce roster grouped by department for ${viewPeopleBranch.name} (${viewPeopleBranch.company_name || companyMap.get(viewPeopleBranch.company || '') || 'Organization'}).`}
            onClose={() => setViewPeopleBranch(null)}
            maxWidth="max-w-3xl"
          >
            <div className="space-y-4 text-xs">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Total Personnel</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{branchEmployees.length}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-[10px] uppercase font-bold text-blue-700">Managers & Leads</p>
                  <p className="text-xl font-bold text-blue-900 mt-1">{branchManagersCount}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Branch Manager</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1 truncate">
                    {viewPeopleBranch.manager_name || 'Unassigned'}
                  </p>
                </div>
              </div>

              {/* Grouped by Department */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {branchDepts.length === 0 ? (
                  <EmptyState
                    icon="building"
                    title="No departments in this branch"
                    description="No departments have been established under this branch yet."
                  />
                ) : (
                  branchDepts.map((dept) => {
                    const deptEmployees = branchEmployees.filter((e) => e.department === dept.public_id);
                    return (
                      <div
                        key={dept.public_id}
                        className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{dept.name}</span>
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {deptEmployees.length} {deptEmployees.length === 1 ? 'person' : 'people'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Department Head:{' '}
                            <span className="font-semibold text-slate-800">
                              {dept.head_name || 'Unassigned'}
                            </span>
                          </div>
                        </div>

                        {deptEmployees.length === 0 ? (
                          <div className="p-3 text-center text-slate-400 italic">
                            No employees assigned to this department yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {deptEmployees.map((emp) => {
                              const isMgr = isEmployeeManager(emp, branches, departments, employees);
                              const isBranchMgr = emp.public_id === viewPeopleBranch.manager;
                              const isDeptHead = emp.public_id === dept.head;

                              return (
                                <div
                                  key={emp.public_id}
                                  className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50/70 transition"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold text-xs ring-1 ring-blue-100">
                                      {emp.first_name[0]}{emp.last_name[0]}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-semibold text-slate-900 truncate">
                                          {emp.first_name} {emp.last_name}
                                        </p>
                                        {isBranchMgr && (
                                          <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 border border-purple-200">
                                            Branch Manager
                                          </span>
                                        )}
                                        {isDeptHead && (
                                          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                                            Dept Head
                                          </span>
                                        )}
                                        {isMgr && !isBranchMgr && !isDeptHead && (
                                          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                                            Manager
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-500 truncate">
                                        {emp.job_title || 'Staff Member'} · {emp.email}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-2">
                                    <StatusBadge status={emp.employment_status} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <Button variant="secondary" size="sm" onClick={() => setViewPeopleBranch(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
