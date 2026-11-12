import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Department, Employee, Expense, ExpenseCategory } from '../api/types';
import { displayError, formatDate } from '../components/format';
import { useAuth } from '../context/auth';
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
  TextareaField,
} from '../components/ui';

type Tab = 'all' | 'pending' | 'approved' | 'rejected' | 'history' | 'categories';
const PAGE_SIZE = 8;

export default function ExpensesPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = Boolean(
    user?.is_superuser || user?.role_name === 'System Admin' || hasRole(['System Admin']),
  );
  const isHR = user?.role_name === 'HR Manager' || hasRole(['HR Manager']);
  const isPM =
    user?.role_name === 'Department / Project Manager' ||
    hasRole(['Department / Project Manager']);
  const canViewOrgExpenses = isAdmin || isHR || isPM;
  const canManageCategories = isAdmin || isHR;
  const canApproveExpenses = isAdmin || isHR || isPM;
  const canSubmitExpense = !isAdmin && Boolean(user?.employee_public_id || !isHR);

  const [tab, setTab] = useState<Tab>('all');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allCategories, setAllCategories] = useState<ExpenseCategory[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Expense Modals & Forms
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<{
    expense: Expense;
    action: 'approve' | 'reject';
  } | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Category Management Modals
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const activeCategories = useMemo(
    () => allCategories.filter((c) => c.is_active),
    [allCategories],
  );

  // Employee mapping
  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.public_id, emp);
      map.set(`${emp.first_name} ${emp.last_name}`.toLowerCase(), emp);
    }
    return map;
  }, [employees]);

  const load = useCallback(async () => {
    try {
      const [expRes, catRes, empRes, deptRes] = await Promise.allSettled([
        client.expenses(),
        client.expenseCategories(),
        client.employees(),
        client.departments(),
      ]);
      if (expRes.status === 'fulfilled') {
        setExpenses(unwrapList(expRes.value.data));
      } else {
        setError(displayError(expRes.reason));
      }
      if (catRes.status === 'fulfilled') {
        setAllCategories(unwrapList(catRes.value.data));
      }
      if (empRes.status === 'fulfilled') {
        setEmployees(unwrapList(empRes.value.data));
      }
      if (deptRes.status === 'fulfilled') {
        setDepartments(unwrapList(deptRes.value.data));
      }
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Tab filtering
  const tabFilteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const st = (item.status || '').toLowerCase();
      if (tab === 'pending') return st === 'pending';
      if (tab === 'approved') return st === 'approved';
      if (tab === 'rejected') return st === 'rejected';
      if (tab === 'history') return st === 'approved' || st === 'rejected';
      return true;
    });
  }, [expenses, tab]);

  // Multi-field filtering
  const filteredExpenses = useMemo(() => {
    return tabFilteredExpenses.filter((item) => {
      const emp =
        (item.employee ? employeeMap.get(item.employee) : undefined) ||
        employeeMap.get((item.employee_name || '').toLowerCase());
      const deptName = emp?.department_name || '';

      const matchesSearch =
        !search ||
        (item.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.category_name || item.category || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.remarks || '').toLowerCase().includes(search.toLowerCase()) ||
        deptName.toLowerCase().includes(search.toLowerCase());

      const matchesDept =
        !departmentFilter ||
        emp?.department === departmentFilter ||
        deptName.toLowerCase() === departmentFilter.toLowerCase();

      const matchesCat =
        !categoryFilter ||
        item.category === categoryFilter ||
        item.category_name === categoryFilter;

      const matchesStatus =
        !statusFilter || (item.status || '').toLowerCase() === statusFilter.toLowerCase();

      const matchesStartDate = !startDateFilter || item.expense_date >= startDateFilter;
      const matchesEndDate = !endDateFilter || item.expense_date <= endDateFilter;

      return (
        matchesSearch &&
        matchesDept &&
        matchesCat &&
        matchesStatus &&
        matchesStartDate &&
        matchesEndDate
      );
    });
  }, [
    tabFilteredExpenses,
    employeeMap,
    search,
    departmentFilter,
    categoryFilter,
    statusFilter,
    startDateFilter,
    endDateFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredExpenses.slice(start, start + PAGE_SIZE);
  }, [filteredExpenses, page]);

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createExpense(form);
      setModalOpen(false);
      setSuccess('Expense reimbursement claim submitted successfully.');
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingExpense) return;
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    const receiptFile = form.get('receipt');
    if (receiptFile instanceof File && receiptFile.size === 0) {
      form.delete('receipt');
    }
    try {
      await client.updateExpense(editingExpense.public_id, form);
      setEditingExpense(null);
      setSuccess('Pending expense updated successfully.');
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await client.deleteExpense(expense.public_id);
      setExpenseToDelete(null);
      setSuccess('Pending expense deleted.');
      await load();
    } catch (cause) {
      setError(displayError(cause));
      setExpenseToDelete(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDecisionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!decisionTarget) return;
    const trimmed = decisionComment.trim();
    if (decisionTarget.action === 'reject' && !trimmed) {
      setFormError('A comment is required when rejecting an expense.');
      return;
    }

    setSaving(true);
    setFormError('');
    setError('');
    setSuccess('');
    try {
      if (decisionTarget.action === 'approve') {
        await client.approveExpense(decisionTarget.expense.public_id, trimmed);
        setSuccess('Expense claim approved.');
      } else {
        await client.rejectExpense(decisionTarget.expense.public_id, trimmed);
        setSuccess('Expense claim rejected.');
      }
      setDecisionTarget(null);
      setDecisionComment('');
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(),
      is_active: form.get('is_active') === 'on',
    };
    try {
      if (editingCategory) {
        await client.updateExpenseCategory(editingCategory.public_id, payload);
        setSuccess(`Expense category "${payload.name}" updated.`);
        setEditingCategory(null);
      } else {
        await client.createExpenseCategory(payload);
        setSuccess(`Expense category "${payload.name}" created.`);
        setCatModalOpen(false);
      }
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (cat: ExpenseCategory) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await client.deleteExpenseCategory(cat.public_id);
      setCategoryToDelete(null);
      setSuccess(`Expense category "${cat.name}" deleted.`);
      await load();
    } catch (cause) {
      setError(displayError(cause));
      setCategoryToDelete(null);
    } finally {
      setSaving(false);
    }
  };

  const totalClaimAmount = useMemo(
    () => expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    [expenses],
  );

  const pendingClaimsCount = useMemo(
    () => expenses.filter((e) => (e.status || '').toLowerCase() === 'pending').length,
    [expenses],
  );

  const approvedClaimsCount = useMemo(
    () => expenses.filter((e) => (e.status || '').toLowerCase() === 'approved').length,
    [expenses],
  );

  const rejectedClaimsCount = useMemo(
    () => expenses.filter((e) => (e.status || '').toLowerCase() === 'rejected').length,
    [expenses],
  );

  const resetFilters = () => {
    setSearch('');
    setDepartmentFilter('');
    setCategoryFilter('');
    setStatusFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? 'Organization Monitoring' : 'Finance & Reimbursements'}
        title="Expense Management & Claims"
        description={
          canApproveExpenses
            ? 'Review submitted expense claims, approve or reject pending reimbursements with audit comments, and manage expense categories.'
            : 'Submit business expense claims, upload receipts, and track reimbursement approval status.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            {canManageCategories && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFormError('');
                  setEditingCategory(null);
                  setCatModalOpen(true);
                }}
              >
                <Icon name="plus" size={14} /> Add Category
              </Button>
            )}
            {canSubmitExpense && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormError('');
                  setModalOpen(true);
                }}
              >
                <Icon name="plus" size={14} /> Submit Expense
              </Button>
            )}
          </div>
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* KPI Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon name="receipt" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                ${totalClaimAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500 font-medium">Total Claim Volume</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Icon name="clock" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{pendingClaimsCount}</p>
              <p className="text-xs text-slate-500 font-medium">Pending Claims</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="check-circle" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{approvedClaimsCount}</p>
              <p className="text-xs text-slate-500 font-medium">Approved / Settled</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
              <Icon name="logout" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{rejectedClaimsCount}</p>
              <p className="text-xs text-slate-500 font-medium">Rejected Claims</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card with Tabs and Advanced Filters */}
      <Card className="overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-200/60 p-1">
            <button
              type="button"
              onClick={() => {
                setTab('all');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Claims ({expenses.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('pending');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'pending'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pending Audit</span>
              {pendingClaimsCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] text-white">
                  {pendingClaimsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('approved');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'approved'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approved ({approvedClaimsCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('rejected');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'rejected'
                  ? 'bg-white text-rose-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rejected ({rejectedClaimsCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('history');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit History ({approvedClaimsCount + rejectedClaimsCount})
            </button>
            {canManageCategories && (
              <button
                type="button"
                onClick={() => {
                  setTab('categories');
                  setPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  tab === 'categories'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Categories ({allCategories.length})
              </button>
            )}
          </div>

          {tab !== 'categories' && (
            <div className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  setPage(1);
                }}
                placeholder="Search description, employee, category..."
              />
            </div>
          )}
        </div>

        {tab === 'categories' && canManageCategories ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Expense Categories</h3>
                <p className="text-xs text-slate-500">
                  Manage active reimbursement categories available to employees.
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setFormError('');
                  setEditingCategory(null);
                  setCatModalOpen(true);
                }}
              >
                <Icon name="plus" size={14} /> Add Category
              </Button>
            </div>

            {allCategories.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="No expense categories"
                description="Create an expense category so employees can submit reimbursement claims."
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/75 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Category Name</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {allCategories.map((cat) => (
                      <tr key={cat.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-4 py-3 font-semibold text-slate-900">{cat.name}</td>
                        <td className="px-4 py-3 text-slate-600">{cat.description || '—'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={cat.is_active ? 'Active' : 'Inactive'} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setFormError('');
                                setEditingCategory(cat);
                              }}
                            >
                              <Icon name="edit" size={13} /> Edit
                            </Button>
                            <button
                              type="button"
                              onClick={() => setCategoryToDelete(cat)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete Category"
                              aria-label={`Delete ${cat.name}`}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Filter Bar */}
            <div className="grid gap-3 border-b border-slate-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 text-xs">
              <SelectField
                label="Filter Status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </SelectField>

              <SelectField
                label="Filter Department"
                value={departmentFilter}
                onChange={(e) => {
                  setDepartmentFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.public_id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Filter Category"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Categories</option>
                {allCategories.map((c) => (
                  <option key={c.public_id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </SelectField>

              <Field
                label="Expense Date From"
                type="date"
                value={startDateFilter}
                onChange={(e) => {
                  setStartDateFilter(e.target.value);
                  setPage(1);
                }}
              />

              <Field
                label="Expense Date To"
                type="date"
                value={endDateFilter}
                onChange={(e) => {
                  setEndDateFilter(e.target.value);
                  setPage(1);
                }}
              />

              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center text-xs"
                  onClick={resetFilters}
                >
                  Reset Filters
                </Button>
              </div>
            </div>

            {/* Table Content */}
            {loading ? (
              <div className="p-12">
                <LoadingState label="Loading verified expense claims and attachments..." />
              </div>
            ) : filteredExpenses.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="No expense claims match your filter"
                description="Adjust your search filters or submit an expense claim."
                action={
                  canSubmitExpense ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setFormError('');
                        setModalOpen(true);
                      }}
                    >
                      <Icon name="plus" size={14} /> Submit Claim
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        {canViewOrgExpenses && <th className="px-5 py-3">Employee & Dept</th>}
                        <th className="px-5 py-3">Description & Remarks</th>
                        <th className="px-5 py-3">Category</th>
                        <th className="px-5 py-3">Expense Date</th>
                        <th className="px-5 py-3">Amount</th>
                        <th className="px-5 py-3">Receipt</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {pageRows.map((expense) => {
                        const emp =
                          (expense.employee ? employeeMap.get(expense.employee) : undefined) ||
                          employeeMap.get((expense.employee_name || '').toLowerCase());
                        const deptName = emp?.department_name || 'Staff';
                        const isPending = (expense.status || '').toUpperCase() === 'PENDING';
                        const isOwner =
                          Boolean(user?.employee_public_id) &&
                          expense.employee === user?.employee_public_id;
                        const showDecisionActions = canApproveExpenses && isPending && !isOwner;

                        return (
                          <tr key={expense.public_id} className="hover:bg-slate-50/70 transition">
                            {canViewOrgExpenses && (
                              <td className="px-5 py-3.5">
                                <p className="font-semibold text-slate-900">
                                  {expense.employee_name || 'Staff Member'}
                                </p>
                                <p className="text-[11px] text-slate-500">{deptName}</p>
                              </td>
                            )}

                            <td className="px-5 py-3.5 max-w-xs">
                              <p className="font-semibold text-slate-800 truncate" title={expense.description}>
                                {expense.description}
                              </p>
                              {expense.remarks && (
                                <p className="mt-0.5 text-[11px] text-slate-500 italic truncate" title={expense.remarks}>
                                  Audit remark: {expense.remarks}
                                </p>
                              )}
                            </td>

                            <td className="px-5 py-3.5">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                                {expense.category_name || expense.category}
                              </span>
                            </td>

                            <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                              {formatDate(expense.expense_date)}
                            </td>

                            <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-900">
                              ${Number(expense.amount).toFixed(2)}
                            </td>

                            <td className="px-5 py-3.5">
                              {expense.receipt ? (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                  <Icon name="check-circle" size={11} /> Attached
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">None</span>
                              )}
                            </td>

                            <td className="px-5 py-3.5">
                              <StatusBadge status={expense.status} />
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {showDecisionActions && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      className="px-2 py-1 text-[11px]"
                                      onClick={() => {
                                        setFormError('');
                                        setDecisionComment('');
                                        setDecisionTarget({ expense, action: 'approve' });
                                      }}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="danger"
                                      className="px-2 py-1 text-[11px]"
                                      onClick={() => {
                                        setFormError('');
                                        setDecisionComment('');
                                        setDecisionTarget({ expense, action: 'reject' });
                                      }}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {isOwner && isPending && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="px-2 py-1 text-[11px]"
                                      onClick={() => {
                                        setFormError('');
                                        setEditingExpense(expense);
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <button
                                      type="button"
                                      onClick={() => setExpenseToDelete(expense)}
                                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                      title="Delete Expense"
                                      aria-label="Delete Expense"
                                    >
                                      <Icon name="trash" size={14} />
                                    </button>
                                  </>
                                )}
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="px-2 py-1 text-[11px]"
                                  onClick={() => setSelectedExpense(expense)}
                                >
                                  Details
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
                  totalItems={filteredExpenses.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </>
            )}
          </>
        )}
      </Card>

      {/* Modal: Approve / Reject Expense with Comment */}
      {decisionTarget && (
        <Modal
          title={
            decisionTarget.action === 'approve'
              ? 'Approve Expense Claim'
              : 'Reject Expense Claim'
          }
          description={`${decisionTarget.expense.employee_name || 'Employee'} · $${Number(decisionTarget.expense.amount).toFixed(2)} (${decisionTarget.expense.category_name || ''})`}
          onClose={() => setDecisionTarget(null)}
        >
          <form className="space-y-4" onSubmit={handleDecisionSubmit}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Description</p>
              <p className="mt-1 text-slate-800">{decisionTarget.expense.description}</p>
            </div>

            <TextareaField
              label={
                decisionTarget.action === 'reject'
                  ? 'Rejection Reason / Comment (Required)'
                  : 'Approval Comment (Optional)'
              }
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              required={decisionTarget.action === 'reject'}
              placeholder={
                decisionTarget.action === 'reject'
                  ? 'Provide the reason for rejecting this expense claim...'
                  : 'Optional audit notes...'
              }
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDecisionTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant={decisionTarget.action === 'approve' ? 'primary' : 'danger'}
                disabled={saving}
              >
                {saving
                  ? 'Processing...'
                  : decisionTarget.action === 'approve'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: View Expense Details */}
      {selectedExpense && (
        <Modal
          title="Expense Claim Audit Details"
          description={`Claim Reference: ${selectedExpense.public_id}`}
          onClose={() => setSelectedExpense(null)}
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4 border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {selectedExpense.employee_name || 'Staff Member'}
                </p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {selectedExpense.category_name || selectedExpense.category}
                </p>
              </div>
              <StatusBadge status={selectedExpense.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Total Claim Amount</p>
                <p className="mt-1 font-mono text-base font-bold text-slate-900">
                  ${Number(selectedExpense.amount).toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Incurred Date</p>
                <p className="mt-1 font-mono text-[11px] font-semibold text-slate-800">
                  {formatDate(selectedExpense.expense_date)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 bg-white">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Business Justification</p>
              <p className="mt-1 leading-relaxed text-slate-800">{selectedExpense.description}</p>
            </div>

            {selectedExpense.receipt && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <p className="text-[10px] font-semibold uppercase text-blue-800">Attached Receipt Document</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-blue-900 truncate max-w-xs">
                    {selectedExpense.receipt}
                  </span>
                  <a
                    href={selectedExpense.receipt}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    View Document <Icon name="arrow" size={12} />
                  </a>
                </div>
              </div>
            )}

            {(selectedExpense.remarks || selectedExpense.approved_by_name) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Review / Audit Remarks</p>
                {selectedExpense.approved_by_name && (
                  <p className="text-[11px] text-slate-600">
                    Processed by <strong>{selectedExpense.approved_by_name}</strong>
                    {selectedExpense.approved_at ? ` on ${formatDate(selectedExpense.approved_at)}` : ''}
                  </p>
                )}
                {selectedExpense.remarks && (
                  <p className="text-slate-800 italic">{selectedExpense.remarks}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setSelectedExpense(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Submit Expense */}
      {modalOpen && canSubmitExpense && (
        <Modal
          title="Submit Business Expense Claim"
          description="Provide receipt details, category classification, and incurred date for reimbursement."
          onClose={() => setModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={submitExpense}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Expense Category"
              name="category"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select category...
              </option>
              {activeCategories.map((c) => (
                <option key={c.public_id} value={c.public_id}>
                  {c.name}
                </option>
              ))}
            </SelectField>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Amount (USD)"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
              />
              <Field
                label="Date Incurred"
                name="expense_date"
                type="date"
                required
                defaultValue={today}
              />
            </div>

            <TextareaField
              label="Business Justification & Description"
              name="description"
              required
              placeholder="State the business purpose for this expenditure..."
            />

            <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
              Receipt Document / Invoice (Optional)
              <input
                type="file"
                name="receipt"
                accept="image/*,.pdf"
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-xs text-slate-500 file:mr-3 file:rounded-l-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
              />
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving || activeCategories.length === 0}>
                {saving ? 'Submitting...' : 'Submit Claim'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Pending Expense */}
      {editingExpense && (
        <Modal
          title="Edit Pending Expense Claim"
          description="Update details for your pending reimbursement claim."
          onClose={() => setEditingExpense(null)}
        >
          <form className="space-y-4" onSubmit={handleUpdateExpense}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Expense Category"
              name="category"
              required
              defaultValue={editingExpense.category}
            >
              {activeCategories.map((c) => (
                <option key={c.public_id} value={c.public_id}>
                  {c.name}
                </option>
              ))}
            </SelectField>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="Amount (USD)"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={String(editingExpense.amount)}
              />
              <Field
                label="Date Incurred"
                name="expense_date"
                type="date"
                required
                defaultValue={editingExpense.expense_date}
              />
            </div>

            <TextareaField
              label="Business Justification & Description"
              name="description"
              required
              defaultValue={editingExpense.description}
            />

            <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
              Replace Receipt Document (Optional)
              <input
                type="file"
                name="receipt"
                accept="image/*,.pdf"
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-xs text-slate-500 file:mr-3 file:rounded-l-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
              />
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setEditingExpense(null)}>
                Cancel
              </Button>
              <Button disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add / Edit Expense Category */}
      {(catModalOpen || editingCategory) && canManageCategories && (
        <Modal
          title={editingCategory ? `Edit Category: ${editingCategory.name}` : 'Add Expense Category'}
          description="Configure expense categories for employee reimbursement claims."
          onClose={() => {
            setCatModalOpen(false);
            setEditingCategory(null);
          }}
        >
          <form className="space-y-4" onSubmit={handleSaveCategory}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Category Name"
              name="name"
              required
              defaultValue={editingCategory?.name || ''}
              placeholder="e.g. Travel & Lodging"
            />

            <TextareaField
              label="Description (Optional)"
              name="description"
              defaultValue={editingCategory?.description || ''}
              placeholder="Eligible expenses and policy notes..."
            />

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={editingCategory ? editingCategory.is_active : true}
                className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Active (available for new expense claims)</span>
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setCatModalOpen(false);
                  setEditingCategory(null);
                }}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm Delete Expense */}
      {expenseToDelete && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Expense Claim"
          description={`Are you sure you want to delete your pending expense claim (${expenseToDelete.category_name || ''}, $${Number(expenseToDelete.amount).toFixed(2)})?`}
          confirmLabel="Delete Expense"
          isDestructive={true}
          isLoading={saving}
          onConfirm={() => void handleDeleteExpense(expenseToDelete)}
          onCancel={() => setExpenseToDelete(null)}
        />
      )}

      {/* Confirm Delete Category */}
      {categoryToDelete && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Expense Category"
          description={`Are you sure you want to delete expense category "${categoryToDelete.name}"?`}
          confirmLabel="Delete Category"
          isDestructive={true}
          isLoading={saving}
          onConfirm={() => void handleDeleteCategory(categoryToDelete)}
          onCancel={() => setCategoryToDelete(null)}
        />
      )}
    </div>
  );
}
