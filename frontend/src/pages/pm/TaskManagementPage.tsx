import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { client, unwrapList } from '../../api/client';
import type { Employee, LeaveRequest, Project, Task } from '../../api/types';
import { displayError, formatDate, initials } from '../../components/format';
import { useAuth } from '../../context/auth';
import {
  calculateEmployeeAvailability,
  type EmployeeAvailabilityResult,
} from '../../utils/availability';
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
} from '../../components/ui';

const PAGE_SIZE = 10;

export default function TaskManagementPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [nextWeekStr] = useState(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().slice(0, 10);
  });
  const loadData = useCallback(async () => {
    try {
      const [taskRes, projRes, empRes, leaveRes] = await Promise.all([
        client.tasks(),
        client.projects(),
        client.employees(),
        client.leaveRequests(),
      ]);
      setTasks(unwrapList(taskRes.data));
      setProjects(unwrapList(projRes.data));
      setEmployees(unwrapList(empRes.data));
      setLeaves(unwrapList(leaveRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // Current PM Employee ID
  const currentEmployee = useMemo(() => {
    return employees.find(
      (e) =>
        e.public_id === user?.employee_public_id ||
        e.user_details?.username === user?.username ||
        e.email === user?.email,
    );
  }, [employees, user]);

  // Project lookup map
  const projectMap = useMemo(() => {
    return new Map(projects.map((p) => [p.public_id, p]));
  }, [projects]);

  // Employee availability lookup map
  const availabilityMap = useMemo(() => {
    const map = new Map<string, EmployeeAvailabilityResult>();
    const endStr = nextWeekStr;

    for (const emp of employees) {
      const res = calculateEmployeeAvailability(
        emp,
        tasks,
        leaves,
        currentEmployee?.public_id,
        todayStr,
        endStr,
      );
      map.set(emp.public_id, res);
    }
    return map;
  }, [employees, tasks, leaves, currentEmployee, todayStr, nextWeekStr]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (projectFilter && t.project !== projectFilter) return false;

      if (assigneeFilter) {
        if (assigneeFilter === 'unassigned') {
          if (t.assigned_to || t.assigned_to_details) return false;
        } else {
          const assigneeId = t.assigned_to || t.assigned_to_details?.public_id;
          if (assigneeId !== assigneeFilter) return false;
        }
      }

      if (statusFilter && t.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Urgency filter
      if (urgencyFilter) {
        const isDone = (t.status || '').toLowerCase() === 'done';
        const deadline = t.deadline;

        if (urgencyFilter === 'overdue') {
          if (isDone || !deadline || deadline >= todayStr) return false;
        } else if (urgencyFilter === 'today') {
          if (!deadline || deadline !== todayStr) return false;
        } else if (urgencyFilter === 'this_week') {
          if (!deadline) return false;
          const target = new Date(`${deadline}T00:00:00`);
          const today = new Date(`${todayStr}T00:00:00`);
          const diffDays = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
          if (diffDays < 0 || diffDays > 7) return false;
        } else if (urgencyFilter === 'completed') {
          if (!isDone) return false;
        }
      }

      // Search filter
      if (search) {
        const query = search.toLowerCase();
        const titleMatch = t.title.toLowerCase().includes(query);
        const descMatch = (t.description || '').toLowerCase().includes(query);
        const projName = (projectMap.get(t.project)?.name || '').toLowerCase();
        const projMatch = projName.includes(query);
        const assigneeName = t.assigned_to_details
          ? `${t.assigned_to_details.first_name} ${t.assigned_to_details.last_name}`.toLowerCase()
          : '';
        const assigneeMatch = assigneeName.includes(query);

        if (!titleMatch && !descMatch && !projMatch && !assigneeMatch) return false;
      }

      return true;
    });
  }, [tasks, projectFilter, assigneeFilter, statusFilter, urgencyFilter, search, todayStr, projectMap]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const pageTasks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTasks.slice(start, start + PAGE_SIZE);
  }, [filteredTasks, page]);

  // Handle direct task status change
  const handleStatusChange = async (task: Task, newStatus: string) => {
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

  // Create Task
  const handleCreateTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    setError('');

    const form = new FormData(e.currentTarget);
    const project = String(form.get('project') || '').trim();
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    const assignedTo = String(form.get('assigned_to') || '').trim() || null;
    const deadline = String(form.get('deadline') || '').trim() || null;
    const status = String(form.get('status') || 'To Do').trim();

    if (!project) {
      setFormError('Target project is required.');
      setSaving(false);
      return;
    }
    if (!title) {
      setFormError('Task title is required.');
      setSaving(false);
      return;
    }

    const targetProject = projectMap.get(project);
    if (targetProject && deadline) {
      if (targetProject.start_date && deadline < targetProject.start_date) {
        setFormError(
          `Task deadline cannot be earlier than project start date (${targetProject.start_date}).`,
        );
        setSaving(false);
        return;
      }
      if (targetProject.end_date && deadline > targetProject.end_date) {
        setFormError(
          `Task deadline cannot be after project end date (${targetProject.end_date}).`,
        );
        setSaving(false);
        return;
      }
    }

    try {
      const { data: newTask } = await client.createTask({
        project,
        title,
        description: description || null,
        assigned_to: assignedTo,
        deadline,
        status,
      });
      setTasks((prev) => [newTask, ...prev]);
      setCreateModalOpen(false);
      setSuccess(`Task "${title}" created and scheduled.`);
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Edit / Reassign Task
  const handleUpdateTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTask) return;
    setSaving(true);
    setFormError('');
    setError('');

    const form = new FormData(e.currentTarget);
    const project = String(form.get('project') || editingTask.project).trim();
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    const assignedTo = String(form.get('assigned_to') || '').trim() || null;
    const deadline = String(form.get('deadline') || '').trim() || null;
    const status = String(form.get('status') || editingTask.status).trim();

    if (!title) {
      setFormError('Task title is required.');
      setSaving(false);
      return;
    }

    const targetProject = projectMap.get(project);
    if (targetProject && deadline) {
      if (targetProject.start_date && deadline < targetProject.start_date) {
        setFormError(
          `Task deadline cannot be before project start date (${targetProject.start_date}).`,
        );
        setSaving(false);
        return;
      }
      if (targetProject.end_date && deadline > targetProject.end_date) {
        setFormError(
          `Task deadline cannot be after project end date (${targetProject.end_date}).`,
        );
        setSaving(false);
        return;
      }
    }

    try {
      const { data: updated } = await client.updateTask(editingTask.public_id, {
        project,
        title,
        description: description || null,
        assigned_to: assignedTo,
        deadline,
        status,
      });

      setTasks((prev) =>
        prev.map((t) => (t.public_id === updated.public_id ? updated : t)),
      );
      setEditingTask(null);
      if (selectedTask?.public_id === updated.public_id) {
        setSelectedTask(updated);
      }
      setSuccess(`Task "${title}" updated successfully.`);
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async () => {
    if (!deletingTask) return;
    setSaving(true);
    setError('');
    try {
      await client.deleteTask(deletingTask.public_id);
      setTasks((prev) => prev.filter((t) => t.public_id !== deletingTask.public_id));
      if (selectedTask?.public_id === deletingTask.public_id) {
        setSelectedTask(null);
      }
      setSuccess(`Task "${deletingTask.title}" was removed.`);
      setDeletingTask(null);
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Compute Metrics
  const totalTasks = tasks.length;
  const todoTasks = tasks.filter((t) => (t.status || '').toLowerCase() === 'to do').length;
  const inProgressTasks = tasks.filter(
    (t) => (t.status || '').toLowerCase() === 'in progress',
  ).length;
  const reviewTasks = tasks.filter((t) => (t.status || '').toLowerCase() === 'review').length;
  const doneTasks = tasks.filter((t) => (t.status || '').toLowerCase() === 'done').length;
  const overdueTasks = tasks.filter((t) => {
    const isDone = (t.status || '').toLowerCase() === 'done';
    return !isDone && t.deadline && t.deadline < todayStr;
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations & Tracking"
        title="Task Management"
        description="Schedule project deliverables, reassign tasks, track overdue milestones, and supervise progress."
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setFormError('');
                setCreateModalOpen(true);
              }}
            >
              <Icon name="plus" size={14} /> Schedule Task
            </Button>
          </div>
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* Backend Compatibility Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3">
        <Icon name="info" size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <p className="font-bold text-blue-950">Backend Scheduling Compatibility</p>
          <p className="mt-0.5 text-blue-800 text-[11px]">
            The current ERP API schema supports project association, employee assignments, delivery
            deadlines (calendar dates), and lifecycle statuses (To Do, In Progress, Review, Done).
            Task priorities, start times, and estimated effort hours are not stored in the backend
            schema and are omitted to avoid unpersisted data.
          </p>
        </div>
      </div>

      {/* KPI Deck */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-slate-500">Total Tasks</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalTasks}</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-blue-600">To Do</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{todoTasks}</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-amber-600">In Progress</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{inProgressTasks}</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-purple-600">Review</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">{reviewTasks}</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-emerald-600">Completed</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{doneTasks}</p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[11px] font-semibold text-rose-600">Overdue</p>
          <p className="text-2xl font-bold text-rose-700 mt-1">{overdueTasks}</p>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden">
        {/* Filter controls */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search deliverables…"
              className="w-full sm:w-56"
            />

            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by project"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.public_id} value={p.public_id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={assigneeFilter}
              onChange={(e) => {
                setAssigneeFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by assignee"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Assignees</option>
              <option value="unassigned">Unassigned</option>
              {employees.map((emp) => (
                <option key={emp.public_id} value={emp.public_id}>
                  {emp.first_name} {emp.last_name}
                </option>
              ))}
            </select>

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
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Review">Review</option>
              <option value="Done">Done</option>
            </select>

            <select
              value={urgencyFilter}
              onChange={(e) => {
                setUrgencyFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by deadline"
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            >
              <option value="">All Deadlines</option>
              <option value="overdue">Overdue Tasks</option>
              <option value="today">Due Today</option>
              <option value="this_week">Due This Week</option>
              <option value="completed">Completed Tasks</option>
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading project tasks…" />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="No tasks match filter criteria"
            description="Try modifying search keywords or clearing filter dropdowns."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setFormError('');
                  setCreateModalOpen(true);
                }}
              >
                <Icon name="plus" size={14} /> Schedule First Task
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Task Deliverable</th>
                    <th className="px-5 py-3">Associated Project</th>
                    <th className="px-5 py-3">Assigned Employee</th>
                    <th className="px-5 py-3">Deadline</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageTasks.map((task) => {
                    const isDone = (task.status || '').toLowerCase() === 'done';
                    const isOverdue = !isDone && task.deadline && task.deadline < todayStr;
                    const isDueToday = !isDone && task.deadline === todayStr;
                    const parentProj = projectMap.get(task.project);

                    return (
                      <tr key={task.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setSelectedTask(task)}
                            className="text-left group"
                          >
                            <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition">
                              {task.title}
                            </p>
                            <p className="mt-0.5 max-w-sm truncate text-[11px] text-slate-500">
                              {task.description || 'No task notes entered'}
                            </p>
                          </button>
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-slate-800">
                            {parentProj?.name || 'Project Record'}
                          </span>
                        </td>

                        <td className="px-5 py-3.5">
                          {task.assigned_to_details ? (
                            <div className="flex items-center gap-2">
                              <span className="size-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                                {initials(
                                  `${task.assigned_to_details.first_name} ${task.assigned_to_details.last_name}`,
                                )}
                              </span>
                              <div>
                                <p className="font-medium text-slate-900">
                                  {task.assigned_to_details.first_name}{' '}
                                  {task.assigned_to_details.last_name}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  {task.assigned_to_details.department_name || 'Staff'}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                isOverdue
                                  ? 'text-rose-600 font-bold'
                                  : isDueToday
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-600'
                              }
                            >
                              {formatDate(task.deadline)}
                            </span>
                            {isOverdue && (
                              <span className="rounded-md bg-rose-50 text-rose-700 px-1.5 py-0.5 text-[9px] font-bold uppercase border border-rose-200">
                                Overdue
                              </span>
                            )}
                            {isDueToday && (
                              <span className="rounded-md bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase border border-amber-200">
                                Today
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <select
                            disabled={updatingTaskId === task.public_id}
                            value={task.status}
                            onChange={(e) => void handleStatusChange(task, e.target.value)}
                            aria-label={`Status for ${task.title}`}
                            className="min-h-7 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-medium"
                          >
                            <option value="To Do">To Do</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Review">Review</option>
                            <option value="Done">Done</option>
                          </select>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedTask(task)}
                              title="View details"
                            >
                              <Icon name="info" size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setFormError('');
                                setEditingTask(task);
                              }}
                              title="Edit / Reassign task"
                            >
                              <Icon name="edit" size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => setDeletingTask(task)}
                              title="Delete task"
                            >
                              <Icon name="trash" size={14} />
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
              totalItems={filteredTasks.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Schedule Task */}
      {createModalOpen && (
        <Modal
          title="Schedule New Task"
          description="Assign a project deliverable with a verified completion deadline."
          onClose={() => setCreateModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={handleCreateTask}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Associated Initiative Project"
              name="project"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select target project…
              </option>
              {projects.map((p) => (
                <option key={p.public_id} value={p.public_id}>
                  {p.name} ({p.status} · {p.start_date} to {p.end_date || 'Ongoing'})
                </option>
              ))}
            </SelectField>

            <Field
              label="Task Title"
              name="title"
              required
              placeholder="e.g. Implement Role-Based Access Control Middleware"
            />

            <TextareaField
              label="Deliverable Scope & Brief"
              name="description"
              placeholder="Describe acceptance criteria and technical requirements…"
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <SelectField label="Assignee Team Member" name="assigned_to" defaultValue="">
                <option value="">Unassigned</option>
                {employees.map((emp) => {
                  const avail = availabilityMap.get(emp.public_id);
                  const tag = avail ? ` [${avail.status}]` : '';
                  return (
                    <option key={emp.public_id} value={emp.public_id}>
                      {emp.first_name} {emp.last_name} ({emp.department_name || 'Staff'}){tag}
                    </option>
                  );
                })}
              </SelectField>

              <Field label="Completion Deadline" name="deadline" type="date" />

              <SelectField label="Initial Status" name="status" defaultValue="To Do">
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Done">Done</option>
              </SelectField>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Scheduling…' : 'Schedule Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit / Reassign Task */}
      {editingTask && (
        <Modal
          title={`Edit Task: ${editingTask.title}`}
          description="Update deliverable details, reassign to a team member, or modify deadline."
          onClose={() => setEditingTask(null)}
        >
          <form className="space-y-4" onSubmit={handleUpdateTask}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <SelectField
              label="Associated Initiative Project"
              name="project"
              required
              defaultValue={editingTask.project}
            >
              {projects.map((p) => (
                <option key={p.public_id} value={p.public_id}>
                  {p.name}
                </option>
              ))}
            </SelectField>

            <Field
              label="Task Title"
              name="title"
              required
              defaultValue={editingTask.title}
            />

            <TextareaField
              label="Description"
              name="description"
              defaultValue={editingTask.description || ''}
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <SelectField
                label="Assignee (Reassign)"
                name="assigned_to"
                defaultValue={
                  editingTask.assigned_to || editingTask.assigned_to_details?.public_id || ''
                }
              >
                <option value="">Unassigned</option>
                {employees.map((emp) => {
                  const avail = availabilityMap.get(emp.public_id);
                  const tag = avail ? ` [${avail.status}]` : '';
                  return (
                    <option key={emp.public_id} value={emp.public_id}>
                      {emp.first_name} {emp.last_name} ({emp.department_name || 'Staff'}){tag}
                    </option>
                  );
                })}
              </SelectField>

              <Field
                label="Deadline"
                name="deadline"
                type="date"
                defaultValue={editingTask.deadline || ''}
              />

              <SelectField label="Status" name="status" defaultValue={editingTask.status}>
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Done">Done</option>
              </SelectField>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditingTask(null)}
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

      {/* Modal: Task Details View */}
      {selectedTask && (
        <Modal
          title={selectedTask.title}
          description="Task deliverable specification, assignment details, and milestone deadline."
          onClose={() => setSelectedTask(null)}
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Project
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {projectMap.get(selectedTask.project)?.name || 'Project Record'}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge status={selectedTask.status} />
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Assigned Team Member
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selectedTask.assigned_to_details
                    ? `${selectedTask.assigned_to_details.first_name} ${selectedTask.assigned_to_details.last_name}`
                    : 'Unassigned'}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Delivery Deadline
                </p>
                <p className="mt-1 font-semibold font-mono text-slate-800">
                  {formatDate(selectedTask.deadline)}
                </p>
              </div>
            </div>

            {selectedTask.description && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Deliverable Notes
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                  {selectedTask.description}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setSelectedTask(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setEditingTask(selectedTask);
                  setSelectedTask(null);
                }}
              >
                <Icon name="edit" size={14} /> Edit Task
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm: Delete Task */}
      <ConfirmDialog
        isOpen={Boolean(deletingTask)}
        title="Delete Task"
        description={`Are you sure you want to delete task "${deletingTask?.title}"? This deliverable record will be permanently removed.`}
        confirmLabel="Delete Task"
        isDestructive
        isLoading={saving}
        onConfirm={handleDeleteTask}
        onCancel={() => setDeletingTask(null)}
      />
    </div>
  );
}
