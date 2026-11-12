import { useCallback, useEffect, useMemo, useState } from 'react';
import { client, unwrapList } from '../../api/client';
import type { LeaveRequest, Project, Task } from '../../api/types';
import { displayError, formatDate } from '../../components/format';
import {
  Button,
  Card,
  ErrorMessage,
  Icon,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
  SuccessMessage,
} from '../../components/ui';

export default function ScheduleCalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Month navigation (current year and month, 0-indexed)
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));

  const loadData = useCallback(async () => {
    try {
      const [taskRes, projRes, leaveRes] = await Promise.all([
        client.tasks(),
        client.projects(),
        client.leaveRequests(),
      ]);
      setTasks(unwrapList(taskRes.data));
      setProjects(unwrapList(projRes.data));
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

  const projectMap = useMemo(() => {
    return new Map(projects.map((p) => [p.public_id, p]));
  }, [projects]);

  // Filter tasks by project if selected
  const activeTasks = useMemo(() => {
    if (!projectFilter) return tasks;
    return tasks.filter((t) => t.project === projectFilter);
  }, [tasks, projectFilter]);

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0 - 11

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);
  }, [currentDate]);

  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(year, month, 1).getDay(); // 0 = Sunday
  }, [year, month]);

  // Group tasks by deadline string (YYYY-MM-DD)
  const tasksByDeadline = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of activeTasks) {
      if (t.deadline) {
        const key = t.deadline.slice(0, 10);
        const list = map.get(key) || [];
        list.push(t);
        map.set(key, list);
      }
    }
    return map;
  }, [activeTasks]);

  // Approved leaves spanning month
  const approvedLeaves = useMemo(() => {
    return leaves.filter((l) => (l.status || '').toUpperCase() === 'APPROVED');
  }, [leaves]);

  // Check if any leave spans a date
  const leavesOnDate = useCallback(
    (dateStr: string) => {
      return approvedLeaves.filter((l) => l.start_date <= dateStr && l.end_date >= dateStr);
    },
    [approvedLeaves],
  );

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const resetToToday = () => {
    setCurrentDate(new Date());
  };

  // Status update
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

  // Upcoming feed calculations
  const overdueTasks = useMemo(() => {
    return activeTasks.filter((t) => {
      const isDone = (t.status || '').toLowerCase() === 'done';
      return !isDone && t.deadline && t.deadline < todayStr;
    });
  }, [activeTasks, todayStr]);

  const dueTodayTasks = useMemo(() => {
    return activeTasks.filter((t) => {
      const isDone = (t.status || '').toLowerCase() === 'done';
      return !isDone && t.deadline === todayStr;
    });
  }, [activeTasks, todayStr]);

  const dueThisWeekTasks = useMemo(() => {
    const today = new Date(`${todayStr}T00:00:00`);
    return activeTasks.filter((t) => {
      const isDone = (t.status || '').toLowerCase() === 'done';
      if (isDone || !t.deadline) return false;
      const target = new Date(`${t.deadline}T00:00:00`);
      const diffDays = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diffDays > 0 && diffDays <= 7;
    });
  }, [activeTasks, todayStr]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Chronology & Milestones"
        title="Schedule / Calendar"
        description="Visualize project delivery timelines, milestone task deadlines, and team absence schedules."
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={resetToToday}>
              <Icon name="clock" size={14} /> Jump to Today
            </Button>
          </div>
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* Backend Scheduling Notice */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3">
        <Icon name="info" size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <p className="font-bold text-blue-950">Persisted Scheduling Model</p>
          <p className="mt-0.5 text-blue-800 text-[11px]">
            The existing ERP backend stores dates (YYYY-MM-DD) for project start/end dates and task
            deadlines. Time-of-day clock scheduling (hours/minutes) is not supported by the backend
            schema and is safely omitted to ensure consistent, persisted records.
          </p>
        </div>
      </div>

      {/* Legend & Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="font-bold text-slate-700">Legend:</span>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-500" />
            <span className="text-slate-600">To Do</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600">In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-purple-500" />
            <span className="text-slate-600">Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600">Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-500" />
            <span className="text-slate-600 font-semibold">Overdue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-violet-400" />
            <span className="text-slate-600">Team Leave</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filter:</label>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="min-h-8.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-hidden"
          >
            <option value="">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.public_id} value={p.public_id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Calendar on Left (2 cols), Upcoming Feed on Right (1 col) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar Section */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {/* Calendar Month Navigation Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-6">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                {monthLabel}
              </h2>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={prevMonth} aria-label="Previous Month">
                  <Icon name="chevron" size={14} className="rotate-180" />
                </Button>
                <Button size="sm" variant="secondary" onClick={nextMonth} aria-label="Next Month">
                  <Icon name="chevron" size={14} />
                </Button>
              </div>
            </div>

            {loading ? (
              <LoadingState label="Building timeline calendar…" />
            ) : (
              <div className="p-3 sm:p-5">
                {/* Days of Week Header */}
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  <span>Sun</span>
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                </div>

                {/* Day Grid */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {/* Empty padding cells */}
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="min-h-20 sm:min-h-24 rounded-lg bg-slate-50/50 p-1.5 opacity-40 border border-slate-100"
                    />
                  ))}

                  {/* Month days */}
                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const dateObj = new Date(year, month, dayNum);
                    const dateStr = dateObj.toISOString().slice(0, 10);
                    const isToday = dateStr === todayStr;
                    const dayTasks = tasksByDeadline.get(dateStr) || [];
                    const dayLeaves = leavesOnDate(dateStr);
                    const isSelected = selectedDayDate === dateStr;

                    return (
                      <button
                        type="button"
                        key={dateStr}
                        onClick={() => setSelectedDayDate(dateStr)}
                        className={`min-h-20 sm:min-h-24 flex flex-col text-left rounded-lg p-1.5 transition border ${
                          isSelected
                            ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/20'
                            : isToday
                              ? 'border-blue-300 bg-blue-50/30 shadow-2xs'
                              : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span
                            className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
                              isToday
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-700'
                            }`}
                          >
                            {dayNum}
                          </span>
                          {dayTasks.length > 0 && (
                            <span className="text-[9px] font-mono font-semibold text-slate-400">
                              {dayTasks.length}
                            </span>
                          )}
                        </div>

                        {/* Task items preview */}
                        <div className="flex-1 w-full space-y-1 overflow-hidden">
                          {dayTasks.slice(0, 2).map((t) => {
                            const isDone = (t.status || '').toLowerCase() === 'done';
                            const isOverdue = !isDone && t.deadline && t.deadline < todayStr;

                            let bgClass = 'bg-blue-50 text-blue-800 border-blue-200';
                            if (isOverdue) bgClass = 'bg-rose-50 text-rose-800 border-rose-200';
                            else if (t.status === 'In Progress')
                              bgClass = 'bg-amber-50 text-amber-800 border-amber-200';
                            else if (t.status === 'Review')
                              bgClass = 'bg-purple-50 text-purple-800 border-purple-200';
                            else if (isDone)
                              bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';

                            return (
                              <div
                                key={t.public_id}
                                className={`truncate rounded border px-1 py-0.5 text-[9px] font-semibold leading-tight ${bgClass}`}
                                title={`${t.title} (${t.status})`}
                              >
                                {t.title}
                              </div>
                            );
                          })}

                          {dayTasks.length > 2 && (
                            <p className="text-[9px] text-slate-400 font-semibold px-0.5">
                              +{dayTasks.length - 2} more
                            </p>
                          )}

                          {dayLeaves.length > 0 && (
                            <div className="truncate rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9px] text-violet-700 font-medium">
                              {dayLeaves.length} on leave
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Section: Upcoming Deadlines Feed */}
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1">
              Upcoming Deadlines Feed
            </h3>
            <p className="text-[11px] text-slate-500 mb-4">
              Real-time milestone tracking by urgency category.
            </p>

            {/* Overdue Section */}
            {overdueTasks.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between border-b border-rose-100 pb-1">
                  <span className="text-[11px] font-bold text-rose-700 uppercase flex items-center gap-1">
                    <Icon name="alert" size={12} /> Overdue Milestones ({overdueTasks.length})
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {overdueTasks.map((t) => (
                    <div
                      key={t.public_id}
                      className="p-2 rounded-lg bg-rose-50/70 border border-rose-200 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-rose-950 truncate">{t.title}</p>
                        <p className="text-[10px] text-rose-700 font-mono">
                          Due: {formatDate(t.deadline)}
                        </p>
                      </div>
                      <select
                        disabled={updatingTaskId === t.public_id}
                        value={t.status}
                        onChange={(e) => void handleTaskStatusChange(t, e.target.value)}
                        className="rounded border border-rose-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-800"
                      >
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Review">Review</option>
                        <option value="Done">Done</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Due Today Section */}
            {dueTodayTasks.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between border-b border-amber-100 pb-1">
                  <span className="text-[11px] font-bold text-amber-700 uppercase flex items-center gap-1">
                    <Icon name="clock" size={12} /> Due Today ({dueTodayTasks.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {dueTodayTasks.map((t) => (
                    <div
                      key={t.public_id}
                      className="p-2 rounded-lg bg-amber-50/60 border border-amber-200 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 truncate">{t.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {t.assigned_to_details
                            ? `${t.assigned_to_details.first_name} ${t.assigned_to_details.last_name}`
                            : 'Unassigned'}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Due This Week Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="text-[11px] font-bold text-slate-600 uppercase">
                  Due This Week ({dueThisWeekTasks.length})
                </span>
              </div>
              {dueThisWeekTasks.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-1">No upcoming deadlines this week.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {dueThisWeekTasks.map((t) => (
                    <div
                      key={t.public_id}
                      className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 truncate">{t.title}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {formatDate(t.deadline)}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal: Selected Day Details */}
      {selectedDayDate && (
        <Modal
          title={`Schedule for ${formatDate(selectedDayDate)}`}
          description="Task deliverables and team absences scheduled for this date."
          onClose={() => setSelectedDayDate(null)}
        >
          <div className="space-y-4 text-xs">
            {/* Tasks on this day */}
            <div>
              <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px] mb-2">
                Task Deadlines ({(tasksByDeadline.get(selectedDayDate) || []).length})
              </h4>
              {(tasksByDeadline.get(selectedDayDate) || []).length === 0 ? (
                <p className="text-slate-400 italic">No tasks due on this date.</p>
              ) : (
                <div className="space-y-2">
                  {(tasksByDeadline.get(selectedDayDate) || []).map((t) => (
                    <div
                      key={t.public_id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{t.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Project: {projectMap.get(t.project)?.name || 'Project'} · Assignee:{' '}
                          {t.assigned_to_details
                            ? `${t.assigned_to_details.first_name} ${t.assigned_to_details.last_name}`
                            : 'Unassigned'}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leaves on this day */}
            <div className="border-t border-slate-100 pt-3">
              <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px] mb-2">
                Team Absences ({leavesOnDate(selectedDayDate).length})
              </h4>
              {leavesOnDate(selectedDayDate).length === 0 ? (
                <p className="text-slate-400 italic">No team members on leave on this date.</p>
              ) : (
                <div className="space-y-1.5">
                  {leavesOnDate(selectedDayDate).map((l) => (
                    <div
                      key={l.public_id}
                      className="p-2.5 rounded-lg border border-violet-200 bg-violet-50 flex items-center justify-between text-violet-900"
                    >
                      <div>
                        <p className="font-semibold">{l.employee_name || 'Team Member'}</p>
                        <p className="text-[10px] text-violet-700">
                          {l.leave_type_name || 'Leave'} ({l.start_date} to {l.end_date})
                        </p>
                      </div>
                      <span className="rounded bg-violet-200/80 px-2 py-0.5 text-[10px] font-bold uppercase">
                        Approved
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button variant="secondary" onClick={() => setSelectedDayDate(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
