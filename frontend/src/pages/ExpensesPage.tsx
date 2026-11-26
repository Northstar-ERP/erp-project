import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/auth';
import { client, unwrapList } from '../api/client';
import type { Expense, ExpenseCategory } from '../api/types';
import { displayError, formatDate } from '../components/format';
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
  SelectField,
  StatusBadge,
  TextareaField,
} from '../components/ui';

export default function ExpensesPage() {
  const { user, hasRole } = useAuth();
  const canViewOrganizationExpenses = hasRole(['System Admin', 'HR Manager']);
  const canSubmitExpense = Boolean(user?.employee_public_id);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    try {
      const [expenseResponse, categoryResponse] = await Promise.all([
        client.expenses(),
        client.expenseCategories(),
      ]);
      setExpenses(unwrapList(expenseResponse.data));
      setCategories(unwrapList(categoryResponse.data).filter((item) => item.is_active));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createExpense(form);
      setModalOpen(false);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const pending = expenses.filter((expense) => expense.status.toLowerCase() === 'pending').length;

  return (
    <>
      <PageHeader eyebrow="Reimbursements" title="Expense center" description={canViewOrganizationExpenses ? 'Review expense claims submitted across your organization.' : 'Submit business expenses and keep track of your reimbursement progress.'} action={canSubmitExpense ? <Button onClick={() => { setFormError(''); setModalOpen(true); }}><Icon name="plus" size={16} /> Submit expense</Button> : undefined} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[{ label: canViewOrganizationExpenses ? 'Organization claims' : 'Your submissions', value: expenses.length, icon: 'receipt' as const }, { label: canViewOrganizationExpenses ? 'Pending claims' : 'Awaiting review', value: pending, icon: 'clock' as const }, { label: canViewOrganizationExpenses ? 'Claim total' : 'Submitted total', value: total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), icon: 'arrow' as const }].map((metric) => <Card key={metric.label} className="flex items-center gap-4 p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon name={metric.icon} size={18} /></span><div><p className="text-2xl font-bold text-slate-900">{metric.value}</p><p className="text-xs text-slate-500">{metric.label}</p></div></Card>)}
      </div>
      <Card>
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:px-6"><div><h2 className="text-sm font-bold text-slate-900">Expense submissions</h2><p className="mt-1 text-xs text-slate-500">{canViewOrganizationExpenses ? 'Organization-wide claims' : `For ${user?.username || 'your account'}`}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{expenses.length} records</span></div>
        {error && <div className="p-5 sm:px-6"><ErrorMessage>{error}</ErrorMessage></div>}
        {loading ? <LoadingState label="Loading expense submissions" /> : expenses.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><tr>{canViewOrganizationExpenses && <th className="px-6 py-3.5">Employee</th>}<th className="px-6 py-3.5">Expense</th><th className="px-5 py-3.5">Category</th><th className="px-5 py-3.5">Date</th><th className="px-5 py-3.5">Amount</th><th className="px-5 py-3.5">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{expenses.map((expense) => <tr key={expense.public_id} className="hover:bg-slate-50/70">{canViewOrganizationExpenses && <td className="px-6 py-4 text-sm font-medium text-slate-700">{expense.employee_name || 'Employee'}</td>}<td className="px-6 py-4"><p className="text-sm font-semibold text-slate-800">{expense.description}</p></td><td className="px-5 py-4 text-xs text-slate-600">{expense.category_name || expense.category}</td><td className="px-5 py-4 text-xs text-slate-600">{formatDate(expense.expense_date)}</td><td className="px-5 py-4 text-xs font-semibold text-slate-800">{Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="px-5 py-4"><StatusBadge status={expense.status} /></td></tr>)}</tbody>
          </table>
        </div> : <EmptyState title="No expenses submitted" description={canViewOrganizationExpenses ? 'No employee expense claims are available yet.' : 'Your expense claims will appear here so you can follow them through review.'} action={canSubmitExpense ? <Button onClick={() => setModalOpen(true)}><Icon name="plus" size={15} /> Submit an expense</Button> : undefined} />}
      </Card>
      {modalOpen && <Modal title="Submit an expense" description="Add the receipt details for a business expense." onClose={() => setModalOpen(false)}>
        <form onSubmit={submitExpense} className="space-y-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          <SelectField label="Category" name="category" required defaultValue=""><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.public_id} value={category.public_id}>{category.name}</option>)}</SelectField>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /><Field label="Expense date" name="expense_date" type="date" required /></div>
          <TextareaField label="Description" name="description" required placeholder="What was this expense for?" />
          <label className="grid gap-2 text-sm font-medium text-slate-700">Receipt (optional)<input type="file" name="receipt" accept="image/*,.pdf" className="block w-full cursor-pointer rounded-xl border border-slate-200 bg-white text-xs text-slate-500 file:mr-3 file:rounded-l-xl file:border-0 file:bg-slate-50 file:px-4 file:py-3 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-100" /></label>
          <p className="text-xs leading-5 text-slate-500">Your employee profile and submission status are attached by the server.</p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button disabled={saving || !categories.length}>{saving ? 'Submitting…' : 'Submit expense'}</Button></div>
        </form>
      </Modal>}
    </>
  );
}
