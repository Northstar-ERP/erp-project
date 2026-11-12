import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Branch, Company, Department, Employee } from '../api/types';
import { displayError } from '../components/format';
import { isEmployeeManager } from '../utils/managers';
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
  StatusBadge,
  SuccessMessage,
  TextareaField,
} from '../components/ui';

const PAGE_SIZE = 8;

export default function OrganizationsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [viewDetails, setViewDetails] = useState<Company | null>(null);
  const [viewPeopleCompany, setViewPeopleCompany] = useState<Company | null>(null);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');

  // Search & Pagination
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [compRes, branchRes, deptRes, empRes] = await Promise.all([
        client.companies(),
        client.branches(),
        client.departments(),
        client.employees(),
      ]);
      setCompanies(unwrapList(compRes.data));
      setBranches(unwrapList(branchRes.data));
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

  // Branch count per company
  const branchCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of branches) {
      if (b.company) {
        map.set(b.company, (map.get(b.company) || 0) + 1);
      }
    }
    return map;
  }, [branches]);

  // Filtered companies
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const name = c.name.toLowerCase();
      const reg = (c.registration_number || '').toLowerCase();
      const email = (c.contact_email || '').toLowerCase();
      const addr = (c.address || '').toLowerCase();
      return (
        !search ||
        name.includes(search.toLowerCase()) ||
        reg.includes(search.toLowerCase()) ||
        email.includes(search.toLowerCase()) ||
        addr.includes(search.toLowerCase())
      );
    });
  }, [companies, search]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredCompanies.slice(start, start + PAGE_SIZE);
  }, [filteredCompanies, page]);

  // Edit Organization
  const handleEditCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editCompany) return;
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);

    try {
      await client.updateCompany(editCompany.public_id, {
        name: String(form.get('name')).trim(),
        address: String(form.get('address')).trim(),
        contact_email: String(form.get('contact_email')).trim(),
        creation_reason: String(form.get('creation_reason') ?? '').trim() || null,
      });

      setSuccess(`Organization "${editCompany.name}" updated successfully.`);
      setEditCompany(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Delete Organization
  const executeDeleteCompany = async (company: Company) => {
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await client.deleteCompany(company.public_id);
      setSuccess(`Organization "${company.name}" has been deleted.`);
      setCompanyToDelete(null);
      await load();
    } catch (cause) {
      setError(displayError(cause) || 'Failed to delete organization.');
      setCompanyToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administrative Control"
        title="Organization Management"
        description="Manage legal corporate entities, tax identifiers, headquarter addresses, and corporate governance records."
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* KPI Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon name="building" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{companies.length}</p>
              <p className="text-xs text-slate-500 font-medium">Registered Organizations</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
              <Icon name="briefcase" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{branches.length}</p>
              <p className="text-xs text-slate-500 font-medium">Operational Branches</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Icon name="check-circle" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">Active</p>
              <p className="text-xs text-slate-500 font-medium">Enterprise Federation Status</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden">
        {/* Search Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Search organizations by name, registration #, email…"
            className="w-full sm:w-80"
          />

          <div className="text-xs text-slate-500">
            Showing <strong>{filteredCompanies.length}</strong> registered entities
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading corporate organizations…" />
        ) : filteredCompanies.length === 0 ? (
          <EmptyState
            icon="building"
            title="No organizations found"
            description={
              search
                ? 'No organization records match your search query.'
                : 'No corporate organizations exist.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Organization Name</th>
                    <th className="px-5 py-3">Registration Number</th>
                    <th className="px-5 py-3">Contact Email</th>
                    <th className="px-5 py-3">Headquarters Address</th>
                    <th className="px-5 py-3">Branches</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageRows.map((company) => {
                    const branchCount = branchCountMap.get(company.public_id) || 0;

                    return (
                      <tr key={company.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900">{company.name}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                            UUID: {company.public_id}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 font-mono font-medium text-slate-800">
                          {company.registration_number || 'N/A'}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {company.contact_email || '—'}
                        </td>
                        <td className="px-5 py-3.5 max-w-xs truncate text-slate-600">
                          {company.address || '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            <Icon name="briefcase" size={12} />
                            {branchCount} {branchCount === 1 ? 'branch' : 'branches'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewPeopleCompany(company)}
                            >
                              <Icon name="users" size={13} /> View people
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewDetails(company)}
                            >
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setFormError('');
                                setEditCompany(company);
                              }}
                            >
                              <Icon name="edit" size={13} /> Edit
                            </Button>
                            <button
                              type="button"
                              onClick={() => setCompanyToDelete(company)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete Organization"
                              aria-label={`Delete ${company.name}`}
                            >
                              <Icon name="trash" size={14} />
                            </button>
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
              totalItems={filteredCompanies.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Edit Organization */}
      {editCompany && (
        <Modal
          title={`Edit Organization: ${editCompany.name}`}
          description="Update contact email, registered headquarters address, or operational records."
          onClose={() => setEditCompany(null)}
        >
          <form className="space-y-4" onSubmit={handleEditCompany}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Organization Name"
              name="name"
              required
              defaultValue={editCompany.name}
            />

            <Field
              label="Contact Email"
              name="contact_email"
              type="email"
              required
              defaultValue={editCompany.contact_email || ''}
            />

            <TextareaField
              label="Registered Office Address"
              name="address"
              required
              defaultValue={editCompany.address || ''}
            />

            <TextareaField
              label="Operational Purpose / Reason"
              name="creation_reason"
              defaultValue={editCompany.creation_reason || ''}
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditCompany(null)}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Updating…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: View Details */}
      {viewDetails && (
        <Modal
          title={`Entity Profile: ${viewDetails.name}`}
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
                <span className="text-slate-500 font-medium">Registration #:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {viewDetails.registration_number || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Contact Email:</span>
                <span className="text-slate-800 font-medium">{viewDetails.contact_email || '—'}</span>
              </div>
            </div>

            <div>
              <span className="font-semibold text-slate-800 block">Registered Address:</span>
              <p className="mt-1 text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                {viewDetails.address || 'No address specified.'}
              </p>
            </div>

            {viewDetails.creation_reason && (
              <div>
                <span className="font-semibold text-slate-800 block">Reason for Establishment:</span>
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
      {viewPeopleCompany && (() => {
        const compBranches = branches.filter((b) => b.company === viewPeopleCompany.public_id);
        const branchById = new Map(compBranches.map((b) => [b.public_id, b]));
        const compDepts = departments.filter((d) => d.branch && branchById.has(d.branch));
        const compDeptIds = new Set(compDepts.map((d) => d.public_id));
        const compEmployees = employees.filter(
          (e) => e.department && compDeptIds.has(e.department),
        );
        const compManagersCount = compEmployees.filter((e) =>
          isEmployeeManager(e, branches, departments, employees),
        ).length;

        return (
          <Modal
            title={`People in ${viewPeopleCompany.name}`}
            description={`Workforce roster grouped by department across ${compBranches.length} branch${compBranches.length === 1 ? '' : 'es'}.`}
            onClose={() => setViewPeopleCompany(null)}
            maxWidth="max-w-3xl"
          >
            <div className="space-y-4 text-xs">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Total Personnel</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{compEmployees.length}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-[10px] uppercase font-bold text-blue-700">Managers & Leads</p>
                  <p className="text-xl font-bold text-blue-900 mt-1">{compManagersCount}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Departments</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{compDepts.length}</p>
                </div>
              </div>

              {/* Grouped by Department */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {compDepts.length === 0 ? (
                  <EmptyState
                    icon="building"
                    title="No departments in this organization"
                    description="No departments have been established under branches of this organization yet."
                  />
                ) : (
                  compDepts.map((dept) => {
                    const deptEmployees = compEmployees.filter((e) => e.department === dept.public_id);
                    const branch = dept.branch ? branchById.get(dept.branch) : undefined;
                    return (
                      <div
                        key={dept.public_id}
                        className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{dept.name}</span>
                            {branch && (
                              <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                                {branch.name}
                              </span>
                            )}
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
                              const isBranchMgr = branch?.manager === emp.public_id || emp.is_branch_manager;
                              const isDeptHead = dept.head === emp.public_id;

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
                <Button variant="secondary" size="sm" onClick={() => setViewPeopleCompany(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Confirmation Dialog for Deleting Organization */}
      {companyToDelete && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Organization"
          description={`Are you sure you want to delete organization "${companyToDelete.name}"? Organizations that still have assigned employees cannot be deleted until employees are reassigned. Empty branches and departments under this organization will also be removed.`}
          confirmLabel="Delete Organization"
          isDestructive={true}
          isLoading={deleting}
          onConfirm={() => executeDeleteCompany(companyToDelete)}
          onCancel={() => setCompanyToDelete(null)}
        />
      )}
    </div>
  );
}
