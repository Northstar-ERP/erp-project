import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../api/client';
import type { Employee, Project, Task } from '../api/types';
import { displayError, formatDate } from '../components/format';
import { useAuth } from '../context/auth';
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

export default function ProjectsPage() {
  const { user, hasRole } = useAuth();
  const canManageProjects = hasRole([
    'System Admin',
    'Department / Project Manager',
  ]);

  const [tab, setTab] = useState<'projects' | 'tasks'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals & Forms
  const [modal, setModal] = useState<'project' | 'task' | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [projectRes, taskRes, employeeRes] = await Promise.all([
        client.projects(),
        client.tasks(),
        client.employees(),
      ]);
      setProjects(unwrapList(projectRes.data));
      setTasks(unwrapList(taskRes.data));
      setEmployees(unwrapList(employeeRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return projects.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.manager_details
          ? `${item.manager_details.first_name} ${item.manager_details.last_name}`
          : ''
        )
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchesStatus =
        !statusFilter || item.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((item) => {
      const matchesSearch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (item.assigned_to_details
          ? `${item.assigned_to_details.first_name} ${item.assigned_to_details.last_name}`
          : ''
        )
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchesStatus =
        !statusFilter || item.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, statusFilter]);

  const rows = tab === 'projects' ? filteredProjects : filteredTasks;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  // Task Status Update (for assignee or manager)
  const handleTaskStatusChange = async (task: Task, newStatus: string) => {
    if (task.status === newStatus) return;
    setUpdatingTaskId(task.public_id);
    setError('');
    setSuccess('');
    try {
      const { data: updated } = await client.updateTask(task.public_id, {
        status: newStatus,
      });
      setTasks((prev) =>
        prev.map((t) => (t.public_id === updated.public_id ? updated : t)),
      );
      setSuccess(`Task "${task.title}" updated to ${newStatus}.`);
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await client.createProject({
        name: String(form.get('name')).trim(),
        description: String(form.get('description') ?? '').trim(),
        manager: String(form.get('manager')),
        start_date: String(form.get('start_date')),
        end_date: String(form.get('end_date') ?? '') || null,
        status: String(form.get('status')),
      });
      setModal(null);
      setSuccess('Initiative project created successfully.');
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
    setError('');
    const form = new FormData(event.currentTarget);
    const assignedTo = String(form.get('assigned_to') ?? '');
    try {
      await client.createTask({
        project: String(form.get('project')),
        assigned_to: assignedTo || null,
        title: String(form.get('title')).trim(),
        description: String(form.get('description') ?? '').trim(),
        deadline: String(form.get('deadline') ?? '') || null,
        status: String(form.get('status')),
      });
      setModal(null);
      setSuccess('Task assigned and added to project.');
      await load();
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Helper to map project UUID to name
  const projectMap = useMemo(() => {
    return new Map(projects.map((p) => [p.public_id, p.name]));
  }, [projects]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Delivery & Operations"
        title="Projects & Work Tracking"
        description="Plan initiatives, assign task deliverables, track timelines, and monitor progress across team teams."
        action={
          canManageProjects ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFormError('');
                  setModal('task');
                }}
              >
                <Icon name="plus" size={14} /> Add Task
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormError('');
                  setModal('project');
                }}
              >
                <Icon name="plus" size={14} /> New Project
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* Summary KPI Bar */}
      <div className="grid gap-3.5 sm:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
              <Icon name="briefcase" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{projects.length}</p>
              <p className="text-xs text-slate-500 font-medium">Total Projects</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Icon name="check-circle" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {projects.filter((p) => (p.status || '').toLowerCase() === 'active').length}
              </p>
              <p className="text-xs text-slate-500 font-medium">In Active Delivery</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon name="grid" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{tasks.length}</p>
              <p className="text-xs text-slate-500 font-medium">Deliverable Tasks</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <Icon name="clock" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {tasks.filter((t) => (t.status || '').toLowerCase() === 'in progress').length}
              </p>
              <p className="text-xs text-slate-500 font-medium">Tasks In Progress</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Workspace Card */}
      <Card className="overflow-hidden">
        {/* Tabs & Search Header */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
            <button
              type="button"
              onClick={() => {
                setTab('projects');
                setPage(1);
                setStatusFilter('');
              }}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                tab === 'projects'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name="briefcase" size={14} />
              <span>Projects ({projects.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('tasks');
                setPage(1);
                setStatusFilter('');
              }}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                tab === 'tasks'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon name="check-circle" size={14} />
              <span>Tasks & Deliverables ({tasks.length})</span>
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder={`Search ${tab}…`}
              className="w-full sm:w-56"
            />

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Statuses</option>
              {tab === 'projects' ? (
                <>
                  <option value="Planning">Planning</option>
                  <option value="Active">Active</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Done">Done</option>
                </>
              ) : (
                <>
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Review">Review</option>
                  <option value="Done">Done</option>
                </>
              )}
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingState label={`Loading ${tab} data…`} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={tab === 'projects' ? 'briefcase' : 'check-circle'}
            title={`No ${tab} found`}
            description={
              search || statusFilter
                ? 'No items matched your search criteria.'
                : `No ${tab} are available in the workspace.`
            }
            action={
              canManageProjects && !search && !statusFilter ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setFormError('');
                    setModal(tab === 'projects' ? 'project' : 'task');
                  }}
                >
                  <Icon name="plus" size={14} /> Create {tab === 'projects' ? 'Project' : 'Task'}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {tab === 'projects' ? (
                    <tr>
                      <th className="px-5 py-3">Project Initiative</th>
                      <th className="px-5 py-3">Project Manager</th>
                      <th className="px-5 py-3">Delivery Timeline</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-5 py-3">Task Deliverable</th>
                      <th className="px-5 py-3">Associated Project</th>
                      <th className="px-5 py-3">Assigned Team Member</th>
                      <th className="px-5 py-3">Due Date</th>
                      <th className="px-5 py-3">Execution Status</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {tab === 'projects'
                    ? (pageRows as Project[]).map((proj) => (
                        <tr key={proj.public_id} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-900">{proj.name}</p>
                            <p className="mt-0.5 max-w-md truncate text-[11px] text-slate-500">
                              {proj.description || 'No initiative description provided'}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            {proj.manager_details ? (
                              <div className="flex items-center gap-1.5">
                                <span className="size-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700">
                                  {proj.manager_details.first_name?.[0] || 'M'}
                                </span>
                                <span>
                                  {proj.manager_details.first_name}{' '}
                                  {proj.manager_details.last_name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">Unassigned Owner</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                            {formatDate(proj.start_date)}
                            <span className="mx-1.5 text-slate-300">→</span>
                            {formatDate(proj.end_date)}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={proj.status} />
                          </td>
                        </tr>
                      ))
                    : (pageRows as Task[]).map((task) => {
                        const isAssignedToMe =
                          task.assigned_to_details?.email === user?.email ||
                          task.assigned_to_details?.public_id === user?.employee_public_id;
                        const canUpdateThisTask = canManageProjects || isAssignedToMe;

                        return (
                          <tr key={task.public_id} className="hover:bg-slate-50/70 transition">
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-slate-900">{task.title}</p>
                              <p className="mt-0.5 max-w-sm truncate text-[11px] text-slate-500">
                                {task.description || 'No task notes'}
                              </p>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-medium text-slate-800">
                                {projectMap.get(task.project) || 'Project Record'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              {task.assigned_to_details ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="size-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                                    {task.assigned_to_details.first_name?.[0] || 'E'}
                                  </span>
                                  <span>
                                    {task.assigned_to_details.first_name}{' '}
                                    {task.assigned_to_details.last_name}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">Unassigned</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                              {formatDate(task.deadline)}
                            </td>
                            <td className="px-5 py-3.5">
                              {canUpdateThisTask ? (
                                <select
                                  disabled={updatingTaskId === task.public_id}
                                  value={task.status}
                                  onChange={(e) =>
                                    void handleTaskStatusChange(task, e.target.value)
                                  }
                                  aria-label={`Status for ${task.title}`}
                                  className="min-h-7 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                >
                                  <option value="To Do">To Do</option>
                                  <option value="In Progress">In Progress</option>
                                  <option value="Review">Review</option>
                                  <option value="Done">Done</option>
                                </select>
                              ) : (
                                <StatusBadge status={task.status} />
                              )}
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
              totalItems={rows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Create Project */}
      {modal === 'project' && (
        <Modal
          title="Create New Initiative Project"
          description="Establish scope, assigned owner, and target timeline for delivery."
          onClose={() => setModal(null)}
        >
          <form className="space-y-4" onSubmit={createProject}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Project Initiative Name"
              name="name"
              required
              placeholder="e.g. Enterprise Client Portal v2"
            />

            <TextareaField
              label="Objective & Deliverable Scope"
              name="description"
              placeholder="Outline high-level goals and acceptance criteria…"
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <SelectField
                label="Assigned Project Manager"
                name="manager"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select manager…
                </option>
                {employees.map((emp) => (
                  <option key={emp.public_id} value={emp.public_id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </SelectField>

              <SelectField label="Initial Lifecycle Status" name="status" defaultValue="Planning">
                <option value="Planning">Planning</option>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
              </SelectField>

              <Field label="Target Start Date" name="start_date" type="date" required />
              <Field label="Target End Date" name="end_date" type="date" />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button disabled={saving || employees.length === 0}>
                {saving ? 'Creating…' : 'Create Project'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Create Task */}
      {modal === 'task' && (
        <Modal
          title="Schedule New Project Task"
          description="Assign an actionable task item with a defined due date."
          onClose={() => setModal(null)}
        >
          <form className="space-y-4" onSubmit={createTask}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Task Title"
              name="title"
              required
              placeholder="e.g. Implement OAuth SSO Flow"
            />

            <TextareaField
              label="Task Scope & Requirements"
              name="description"
              placeholder="Detailed instructions for the assigned engineer or specialist…"
            />

            <SelectField
              label="Parent Initiative Project"
              name="project"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select associated project…
              </option>
              {projects.map((proj) => (
                <option key={proj.public_id} value={proj.public_id}>
                  {proj.name}
                </option>
              ))}
            </SelectField>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <SelectField label="Assignee Team Member" name="assigned_to" defaultValue="">
                <option value="">Unassigned</option>
                {employees.map((emp) => (
                  <option key={emp.public_id} value={emp.public_id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </SelectField>

              <Field label="Completion Deadline" name="deadline" type="date" />
            </div>

            <SelectField label="Current Status" name="status" defaultValue="To Do">
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Review">Review</option>
              <option value="Done">Done</option>
            </SelectField>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" type="button" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button disabled={saving || projects.length === 0}>
                {saving ? 'Saving…' : 'Schedule Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
