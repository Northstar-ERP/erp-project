import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Employee, Project, Task } from '../api/types';
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

const pageSize = 8;

function Paginator({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages < 2) return null;
  return <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500 sm:px-6">
    <span>Page {page} of {pages}</span>
    <div className="flex gap-2">
      <Button variant="secondary" disabled={page === 1} onClick={() => onPage(page - 1)} className="!min-h-8 !rounded-lg !px-3 !text-xs">Previous</Button>
      <Button variant="secondary" disabled={page === pages} onClick={() => onPage(page + 1)} className="!min-h-8 !rounded-lg !px-3 !text-xs">Next</Button>
    </div>
  </div>;
}

export default function ProjectsPage() {
  const [tab, setTab] = useState<'projects' | 'tasks'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'project' | 'task' | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [projectResponse, taskResponse, employeeResponse] = await Promise.all([
        client.projects(),
        client.tasks(),
        client.employees(),
      ]);
      setProjects(unwrapList(projectResponse.data));
      setTasks(unwrapList(taskResponse.data));
      setEmployees(unwrapList(employeeResponse.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const projectMatches = useMemo(
    () => projects.filter((item) => `${item.name} ${item.status}`.toLowerCase().includes(search.toLowerCase())),
    [projects, search],
  );
  const taskMatches = useMemo(
    () => tasks.filter((item) => `${item.title} ${item.status}`.toLowerCase().includes(search.toLowerCase())),
    [tasks, search],
  );
  const rows = tab === 'projects' ? projectMatches : taskMatches;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createProject({
        name: String(form.get('name')),
        description: String(form.get('description') ?? ''),
        manager: String(form.get('manager')),
        start_date: String(form.get('start_date')),
        end_date: String(form.get('end_date') ?? '') || null,
        status: String(form.get('status')),
      });
      setModal(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const assignedTo = String(form.get('assigned_to') ?? '');
    try {
      await client.createTask({
        project: String(form.get('project')),
        assigned_to: assignedTo || null,
        title: String(form.get('title')),
        description: String(form.get('description') ?? ''),
        deadline: String(form.get('deadline') ?? '') || null,
        status: String(form.get('status')),
      });
      setModal(null);
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Delivery workspace"
        title="Projects & tasks"
        description="Plan initiatives, coordinate ownership, and keep delivery moving."
        action={<Button onClick={() => { setFormError(''); setModal(tab === 'projects' ? 'project' : 'task'); }}><Icon name="plus" size={16} /> New {tab === 'projects' ? 'project' : 'task'}</Button>}
      />
      <Card>
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {(['projects', 'tasks'] as const).map((value) => <button key={value} onClick={() => { setTab(value); setPage(1); }} className={`rounded-lg px-4 py-2 text-xs font-semibold capitalize transition ${tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{value} <span className="ml-1 text-slate-400">{value === 'projects' ? projects.length : tasks.length}</span></button>)}
          </div>
          <label className="relative block sm:w-64">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Search ${tab}…`} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
          </label>
        </div>
        {error && <div className="p-5 sm:px-6"><ErrorMessage>{error}</ErrorMessage></div>}
        {loading ? <LoadingState label={`Loading ${tab}`} /> : !rows.length ? (
          <EmptyState title={`No ${tab} found`} description={search ? 'Try a different search term.' : `Create your first ${tab === 'projects' ? 'project' : 'task'} to get work moving.`} action={!search && <Button onClick={() => { setFormError(''); setModal(tab === 'projects' ? 'project' : 'task'); }}><Icon name="plus" size={15} /> Add {tab === 'projects' ? 'project' : 'task'}</Button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {tab === 'projects' ? <tr><th className="px-6 py-3.5">Project</th><th className="px-5 py-3.5">Owner</th><th className="px-5 py-3.5">Timeline</th><th className="px-5 py-3.5">Status</th></tr> : <tr><th className="px-6 py-3.5">Task</th><th className="px-5 py-3.5">Project ID</th><th className="px-5 py-3.5">Assignee</th><th className="px-5 py-3.5">Due date</th><th className="px-5 py-3.5">Status</th></tr>}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tab === 'projects' ? (pageRows as Project[]).map((project) => <tr key={project.public_id} className="transition hover:bg-slate-50/70">
                    <td className="px-6 py-4"><p className="text-sm font-semibold text-slate-800">{project.name}</p><p className="mt-1 max-w-sm truncate text-xs text-slate-500">{project.description || 'No description provided'}</p></td>
                    <td className="px-5 py-4 text-xs text-slate-600">{project.manager_details ? `${project.manager_details.first_name} ${project.manager_details.last_name}` : 'Not assigned'}</td>
                    <td className="px-5 py-4 text-xs text-slate-600">{formatDate(project.start_date)} <span className="text-slate-300">→</span> {formatDate(project.end_date)}</td>
                    <td className="px-5 py-4"><StatusBadge status={project.status} /></td>
                  </tr>) : (pageRows as Task[]).map((task) => <tr key={task.public_id} className="transition hover:bg-slate-50/70">
                    <td className="px-6 py-4"><p className="text-sm font-semibold text-slate-800">{task.title}</p><p className="mt-1 max-w-sm truncate text-xs text-slate-500">{task.description || 'No description provided'}</p></td>
                    <td className="max-w-40 truncate px-5 py-4 font-mono text-[10px] text-slate-500" title={task.project}>{task.project}</td>
                    <td className="px-5 py-4 text-xs text-slate-600">{task.assigned_to_details ? `${task.assigned_to_details.first_name} ${task.assigned_to_details.last_name}` : 'Unassigned'}</td>
                    <td className="px-5 py-4 text-xs text-slate-600">{formatDate(task.deadline)}</td>
                    <td className="px-5 py-4"><StatusBadge status={task.status} /></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <Paginator page={page} pages={pages} onPage={setPage} />
          </>
        )}
      </Card>
      {modal === 'project' && <Modal title="Create a project" description="Set the initiative owner and delivery window." onClose={() => setModal(null)}>
        <form className="space-y-4" onSubmit={createProject}>
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          <Field label="Project name" name="name" required placeholder="e.g. Customer portal refresh" />
          <TextareaField label="Description" name="description" placeholder="What does this project aim to deliver?" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Project manager" name="manager" required defaultValue=""><option value="" disabled>Select an owner</option>{employees.map((employee) => <option key={employee.public_id} value={employee.public_id}>{employee.first_name} {employee.last_name}</option>)}</SelectField>
            <SelectField label="Initial status" name="status" defaultValue="Planning"><option>Planning</option><option>Active</option><option>On Hold</option></SelectField>
            <Field label="Start date" name="start_date" type="date" required />
            <Field label="Target end date" name="end_date" type="date" />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button variant="secondary" type="button" onClick={() => setModal(null)}>Cancel</Button><Button disabled={saving || !employees.length}>{saving ? 'Creating…' : 'Create project'}</Button></div>
        </form>
      </Modal>}
      {modal === 'task' && <Modal title="Create a task" description="Add a clear next step to a project." onClose={() => setModal(null)}>
        <form className="space-y-4" onSubmit={createTask}>
          {formError && <ErrorMessage>{formError}</ErrorMessage>}
          <Field label="Task title" name="title" required placeholder="What needs to get done?" />
          <TextareaField label="Details" name="description" placeholder="Add context for the assignee…" />
          <SelectField label="Project" name="project" required defaultValue=""><option value="" disabled>Select a project</option>{projects.map((project) => <option key={project.public_id} value={project.public_id}>{project.name}</option>)}</SelectField>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Assignee" name="assigned_to" defaultValue=""><option value="">Unassigned</option>{employees.map((employee) => <option key={employee.public_id} value={employee.public_id}>{employee.first_name} {employee.last_name}</option>)}</SelectField>
            <Field label="Due date" name="deadline" type="date" />
          </div>
          <SelectField label="Status" name="status" defaultValue="To Do"><option>To Do</option><option>In Progress</option><option>Review</option><option>Done</option></SelectField>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button variant="secondary" type="button" onClick={() => setModal(null)}>Cancel</Button><Button disabled={saving || !projects.length}>{saving ? 'Creating…' : 'Create task'}</Button></div>
        </form>
      </Modal>}
    </>
  );
}
