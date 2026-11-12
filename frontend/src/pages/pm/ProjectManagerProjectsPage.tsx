import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { client, unwrapList } from '../../api/client';
import type { Employee, Project, Task } from '../../api/types';
import { displayError, formatDate } from '../../components/format';
import CreateProjectWizard from './CreateProjectWizard';
import { useAuth } from '../../context/auth';
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

const PAGE_SIZE = 8;

export default function ProjectManagerProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'managed'>('all');
  const [page, setPage] = useState(1);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [quickTaskProjectId, setQuickTaskProjectId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [projRes, taskRes, empRes] = await Promise.all([
        client.projects(),
        client.tasks(),
        client.employees(),
      ]);
      setProjects(unwrapList(projRes.data));
      setTasks(unwrapList(taskRes.data));
      setEmployees(unwrapList(empRes.data));
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

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Scope filter
      if (scopeFilter === 'managed' && currentEmployee) {
        const isManager =
          p.manager === currentEmployee.public_id ||
          p.manager_details?.public_id === currentEmployee.public_id;
        if (!isManager) return false;
      }

      // Status filter
      if (statusFilter && p.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Search filter
      if (search) {
        const query = search.toLowerCase();
        const managerName = p.manager_details
          ? `${p.manager_details.first_name} ${p.manager_details.last_name}`.toLowerCase()
          : '';
        const matchName = p.name.toLowerCase().includes(query);
        const matchDesc = (p.description || '').toLowerCase().includes(query);
        const matchManager = managerName.includes(query);
        if (!matchName && !matchDesc && !matchManager) return false;
      }

      return true;
    });
  }, [projects, scopeFilter, currentEmployee, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const pageProjects = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredProjects.slice(start, start + PAGE_SIZE);
  }, [filteredProjects, page]);

  // Tasks grouped by project
  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const list = map.get(t.project) || [];
      list.push(t);
      map.set(t.project, list);
    }
    return map;
  }, [tasks]);

  // Project progress computation
  const getProjectProgress = (projId: string) => {
    const projectTasks = tasksByProject.get(projId) || [];
    if (projectTasks.length === 0) return 0;
    const completed = projectTasks.filter(
      (t) => (t.status || '').toLowerCase() === 'done',
    ).length;
    return Math.round((completed / projectTasks.length) * 100);
  };

  // Team members for a given project
  const getProjectTeam = (proj: Project) => {
    const teamMap = new Map<string, Employee>();
    if (proj.manager_details) {
      teamMap.set(proj.manager_details.public_id, proj.manager_details);
    }
    const projectTasks = tasksByProject.get(proj.public_id) || [];
    for (const t of projectTasks) {
      if (t.assigned_to_details) {
        teamMap.set(t.assigned_to_details.public_id, t.assigned_to_details);
      }
    }
    return Array.from(teamMap.values());
  };



  // Edit Project
  const handleUpdateProject = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProject) return;

    setSaving(true);
    setFormError('');
    setError('');

    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') || '').trim();
    const description = String(form.get('description') || '').trim();
    const manager = String(form.get('manager') || '').trim();
    const startDate = String(form.get('start_date') || '').trim();
    const endDate = String(form.get('end_date') || '').trim() || null;
    const status = String(form.get('status') || editingProject.status).trim();

    if (!name) {
      setFormError('Project name is required.');
      setSaving(false);
      return;
    }
    if (endDate && endDate < startDate) {
      setFormError('End date cannot be earlier than start date.');
      setSaving(false);
      return;
    }

    // Check project tasks deadline boundaries
    const projTasks = tasksByProject.get(editingProject.public_id) || [];
    for (const t of projTasks) {
      if (t.deadline) {
        if (t.deadline < startDate) {
          setFormError(
            `Project start date (${startDate}) cannot be after existing task deadline (${t.deadline}) for "${t.title}".`,
          );
          setSaving(false);
          return;
        }
        if (endDate && t.deadline > endDate) {
          setFormError(
            `Project end date (${endDate}) cannot be before existing task deadline (${t.deadline}) for "${t.title}".`,
          );
          setSaving(false);
          return;
        }
      }
    }

    try {
      const { data: updated } = await client.updateProject(editingProject.public_id, {
        name,
        description: description || null,
        manager: manager || undefined,
        start_date: startDate,
        end_date: endDate,
        status,
      });
      setProjects((prev) =>
        prev.map((p) => (p.public_id === updated.public_id ? updated : p)),
      );
      setEditingProject(null);
      if (selectedProject?.public_id === updated.public_id) {
        setSelectedProject(updated);
      }
      setSuccess(`Project "${name}" updated successfully.`);
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Delete Project
  const handleDeleteProject = async () => {
    if (!deletingProject) return;
    setSaving(true);
    setError('');
    try {
      await client.deleteProject(deletingProject.public_id);
      setProjects((prev) => prev.filter((p) => p.public_id !== deletingProject.public_id));
      if (selectedProject?.public_id === deletingProject.public_id) {
        setSelectedProject(null);
      }
      setSuccess(`Project "${deletingProject.name}" was removed.`);
      setDeletingProject(null);
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  // Quick Task Creation for a Project
  const handleQuickTaskCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!quickTaskProjectId) return;
    setSaving(true);
    setFormError('');

    const form = new FormData(e.currentTarget);
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    const assignedTo = String(form.get('assigned_to') || '').trim() || null;
    const deadline = String(form.get('deadline') || '').trim() || null;
    const status = String(form.get('status') || 'To Do').trim();

    if (!title) {
      setFormError('Task title is required.');
      setSaving(false);
      return;
    }

    const targetProject = projects.find((p) => p.public_id === quickTaskProjectId);
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
        project: quickTaskProjectId,
        title,
        description: description || null,
        assigned_to: assignedTo,
        deadline,
        status,
      });
      setTasks((prev) => [newTask, ...prev]);
      setQuickTaskProjectId(null);
      setSuccess(`Task "${title}" created and scheduled.`);
    } catch (cause) {
      setFormError(displayError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Initiative Management"
        title="My Projects"
        description="Plan and direct enterprise initiatives, monitor delivery milestones, track progress, and coordinate project teams."
        action={
          <div className="flex items-center gap-2">
            <Link to="/pm/tasks">
              <Button size="sm" variant="secondary">
                <Icon name="check-circle" size={14} /> View All Tasks
              </Button>
            </Link>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setFormError('');
                setCreateModalOpen(true);
              }}
            >
              <Icon name="plus" size={14} /> New Project
            </Button>
          </div>
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* KPI Stats */}
      <div className="grid gap-3.5 sm:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Icon name="check-circle" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {projects.filter((p) => (p.status || '').toLowerCase() === 'active').length}
              </p>
              <p className="text-xs text-slate-500 font-medium">Active Delivery</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <Icon name="calendar" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {projects.filter((p) => (p.status || '').toLowerCase() === 'planning').length}
              </p>
              <p className="text-xs text-slate-500 font-medium">Planning Phase</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <Icon name="clock" size={18} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {
                  projects.filter((p) => {
                    const st = (p.status || '').toLowerCase();
                    return st === 'completed' || st === 'done';
                  }).length
                }
              </p>
              <p className="text-xs text-slate-500 font-medium">Completed</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Project Card */}
      <Card className="overflow-hidden">
        {/* Controls Bar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setScopeFilter('all');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                scopeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Projects ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setScopeFilter('managed');
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                scopeFilter === 'managed'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Managed by Me (
              {
                projects.filter((p) =>
                  currentEmployee
                    ? p.manager === currentEmployee.public_id ||
                      p.manager_details?.public_id === currentEmployee.public_id
                    : false,
                ).length
              }
              )
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Search projects…"
              className="w-full sm:w-60"
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
              <option value="Planning">Planning</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading project initiatives…" />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title="No projects match criteria"
            description={
              search || statusFilter || scopeFilter === 'managed'
                ? 'Adjust filters or search query to find projects.'
                : 'No projects registered in the workspace yet.'
            }
            action={
              <Button
                size="sm"
                onClick={() => {
                  setFormError('');
                  setCreateModalOpen(true);
                }}
              >
                <Icon name="plus" size={14} /> Create First Project
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Project Initiative</th>
                    <th className="px-5 py-3">Assigned Manager</th>
                    <th className="px-5 py-3">Timeline</th>
                    <th className="px-5 py-3">Progress</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageProjects.map((proj) => {
                    const progress = getProjectProgress(proj.public_id);
                    const projTasks = tasksByProject.get(proj.public_id) || [];
                    const teamMembers = getProjectTeam(proj);

                    return (
                      <tr key={proj.public_id} className="hover:bg-slate-50/70 transition">
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setSelectedProject(proj)}
                            className="text-left group"
                          >
                            <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition">
                              {proj.name}
                            </p>
                            <p className="mt-0.5 max-w-sm truncate text-[11px] text-slate-500">
                              {proj.description || 'No description entered'}
                            </p>
                          </button>
                        </td>

                        <td className="px-5 py-3.5">
                          {proj.manager_details ? (
                            <div className="flex items-center gap-2">
                              <span className="size-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                                {proj.manager_details.first_name?.[0] || 'M'}
                              </span>
                              <div>
                                <p className="font-medium text-slate-900">
                                  {proj.manager_details.first_name}{' '}
                                  {proj.manager_details.last_name}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {proj.manager_details.job_title || 'Project Manager'}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">Unassigned Manager</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                          {formatDate(proj.start_date)}
                          <span className="mx-1 text-slate-300">→</span>
                          {formatDate(proj.end_date)}
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="w-28 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                              <span>{progress}%</span>
                              <span className="text-slate-400 font-normal">
                                {projTasks.length} tasks · {teamMembers.length} team
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <StatusBadge status={proj.status} />
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedProject(proj)}
                              title="View project details & tasks"
                            >
                              <Icon name="info" size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setFormError('');
                                setEditingProject(proj);
                              }}
                              title="Edit project details"
                            >
                              <Icon name="edit" size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setFormError('');
                                setQuickTaskProjectId(proj.public_id);
                              }}
                              title="Add task to this project"
                            >
                              <Icon name="plus" size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => setDeletingProject(proj)}
                              title="Delete project"
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
              totalItems={filteredProjects.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Modal: Create Project Wizard */}
      {createModalOpen && (
        <Modal
          title="Create New Project Initiative"
          description="Follow the guided steps to set up the project, select exactly four team members, and designate a Team Leader."
          onClose={() => setCreateModalOpen(false)}
          maxWidth="max-w-2xl"
        >
          <CreateProjectWizard
            currentEmployeeId={currentEmployee?.public_id}
            onClose={() => setCreateModalOpen(false)}
            onSuccess={async (projectName) => {
              setCreateModalOpen(false);
              setSuccess(`Project "${projectName}" created successfully with team assigned.`);
              await loadData();
            }}
          />
        </Modal>
      )}

      {/* Modal: Edit Project */}
      {editingProject && (
        <Modal
          title={`Edit Project: ${editingProject.name}`}
          description="Update initiative parameters, milestones, and lifecycle status."
          onClose={() => setEditingProject(null)}
        >
          <form className="space-y-4" onSubmit={handleUpdateProject}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Project Name"
              name="name"
              required
              defaultValue={editingProject.name}
            />

            <TextareaField
              label="Description"
              name="description"
              defaultValue={editingProject.description || ''}
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <SelectField
                label="Assigned Manager"
                name="manager"
                required
                defaultValue={
                  editingProject.manager || editingProject.manager_details?.public_id || ''
                }
              >
                {employees.map((emp) => (
                  <option key={emp.public_id} value={emp.public_id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Status"
                name="status"
                defaultValue={editingProject.status}
              >
                <option value="Planning">Planning</option>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
              </SelectField>

              <Field
                label="Start Date"
                name="start_date"
                type="date"
                required
                defaultValue={editingProject.start_date}
              />
              <Field
                label="End Date"
                name="end_date"
                type="date"
                defaultValue={editingProject.end_date || ''}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setEditingProject(null)}
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

      {/* Modal: Project Details View */}
      {selectedProject && (
        <Modal
          title={selectedProject.name}
          description="Comprehensive initiative details, milestone progress, team roster, and deliverable tasks."
          onClose={() => setSelectedProject(null)}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            {/* Overview Header */}
            <div className="grid gap-3 sm:grid-cols-3 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge status={selectedProject.status} />
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Timeline
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-800 font-mono">
                  {formatDate(selectedProject.start_date)} → {formatDate(selectedProject.end_date)}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Project Lead
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-800">
                  {selectedProject.manager_details
                    ? `${selectedProject.manager_details.first_name} ${selectedProject.manager_details.last_name}`
                    : 'Unassigned'}
                </p>
              </div>
            </div>

            {/* Description */}
            {selectedProject.description && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Project Scope
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                  {selectedProject.description}
                </p>
              </div>
            )}

            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-slate-700">Delivery Progress</span>
                <span className="text-blue-600">
                  {getProjectProgress(selectedProject.public_id)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${getProjectProgress(selectedProject.public_id)}%` }}
                />
              </div>
            </div>

            {/* Team Members */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Assigned Team ({getProjectTeam(selectedProject).length})
                </h4>
                <Link
                  to="/pm/team"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Manage Team →
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {getProjectTeam(selectedProject).map((member) => (
                  <span
                    key={member.public_id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-2xs"
                  >
                    <span className="size-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold">
                      {member.first_name?.[0]}
                    </span>
                    <span>
                      {member.first_name} {member.last_name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({member.job_title || 'Team'})
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Tasks in this Project */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Project Tasks ({(tasksByProject.get(selectedProject.public_id) || []).length})
                </h4>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setFormError('');
                    setQuickTaskProjectId(selectedProject.public_id);
                  }}
                >
                  <Icon name="plus" size={13} /> Add Task
                </Button>
              </div>

              {(tasksByProject.get(selectedProject.public_id) || []).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No tasks assigned to this project yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {(tasksByProject.get(selectedProject.public_id) || []).map((t) => (
                    <div
                      key={t.public_id}
                      className="flex items-center justify-between p-2.5 text-xs hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">{t.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {t.assigned_to_details
                            ? `${t.assigned_to_details.first_name} ${t.assigned_to_details.last_name}`
                            : 'Unassigned'}
                          {' · '}Due: {formatDate(t.deadline)}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setSelectedProject(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setEditingProject(selectedProject);
                  setSelectedProject(null);
                }}
              >
                <Icon name="edit" size={14} /> Edit Project
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Quick Task Create */}
      {quickTaskProjectId && (
        <Modal
          title="Add Task to Project"
          description={`Schedule a deliverable task under project: ${
            projects.find((p) => p.public_id === quickTaskProjectId)?.name || 'Project'
          }`}
          onClose={() => setQuickTaskProjectId(null)}
        >
          <form className="space-y-4" onSubmit={handleQuickTaskCreate}>
            {formError && <ErrorMessage>{formError}</ErrorMessage>}

            <Field
              label="Task Title"
              name="title"
              required
              placeholder="e.g. Develop REST endpoint for customer onboarding"
            />

            <TextareaField
              label="Description & Acceptance Criteria"
              name="description"
              placeholder="Provide technical requirements and expected outcomes…"
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <SelectField label="Assignee Team Member" name="assigned_to" defaultValue="">
                <option value="">Unassigned</option>
                {employees.map((emp) => (
                  <option key={emp.public_id} value={emp.public_id}>
                    {emp.first_name} {emp.last_name} ({emp.department_name || 'Staff'})
                  </option>
                ))}
              </SelectField>

              <Field label="Task Deadline" name="deadline" type="date" />

              <SelectField label="Status" name="status" defaultValue="To Do">
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
                onClick={() => setQuickTaskProjectId(null)}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Creating…' : 'Add Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog: Delete Project */}
      <ConfirmDialog
        isOpen={Boolean(deletingProject)}
        title="Delete Project Initiative"
        description={`Are you sure you want to delete "${deletingProject?.name}"? All associated tasks will be removed. This action cannot be undone.`}
        confirmLabel="Delete Project"
        isDestructive
        isLoading={saving}
        onConfirm={handleDeleteProject}
        onCancel={() => setDeletingProject(null)}
      />
    </div>
  );
}
