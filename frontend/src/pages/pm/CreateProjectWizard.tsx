/**
 * CreateProjectWizard – 5-step project creation wizard
 *
 * Step 1  Project Details (name, description, status, dates)
 * Step 2  Select Team Members (exactly 4 active employees from directory)
 * Step 3  Designate Team Leader (exactly 1 of the 4 selected employees)
 * Step 4  Review & Confirm
 * Submit  Creates Project then initial tasks to establish membership
 *
 * ⚠️ Backend Limitation Note:
 *   The backend Project model stores only: name, description, manager,
 *   start_date, end_date, status.  There is no team_members, team_leader,
 *   or priority field.  Team membership is therefore established by creating
 *   one "Project Onboarding" task per team member after the project is saved.
 *   The Team Leader is identified by a "[Team Leader]" prefix in their task
 *   title.  This is the only mechanism available without a backend schema
 *   change.  The wizard is transparent about this limitation.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { client, unwrapList } from '../../api/client';
import type { Employee, LeaveRequest, Task } from '../../api/types';
import { displayError } from '../../components/format';
import {
  Button,
  Card,
  ErrorMessage,
  Field,
  Icon,
  LoadingState,
  SelectField,
  TextareaField,
} from '../../components/ui';
import {
  calculateEmployeeAvailability,
  type EmployeeAvailabilityResult,
} from '../../utils/availability';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardProject {
  name: string;
  description: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface TeamMember {
  employee: Employee;
  availability: EmployeeAvailabilityResult | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_TEAM_SIZE = 4;

const STATUS_OPTIONS = ['Planning', 'Active', 'On Hold', 'Completed'] as const;

const STEP_LABELS = [
  'Project Details',
  'Select Team',
  'Team Leader',
  'Review',
] as const;

// ─── Availability badge ────────────────────────────────────────────────────────

function AvailabilityPill({ avail }: { avail: EmployeeAvailabilityResult | null }) {
  if (!avail) return null;
  const colorMap: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    purple: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colorMap[avail.badgeVariant] ?? colorMap.neutral}`}
    >
      {avail.statusLabel}
    </span>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1;
        const done = stepNum < current;
        const active = stepNum === current;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                  done
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : active
                      ? 'border-blue-600 bg-white text-blue-600'
                      : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`hidden sm:block text-[10px] font-semibold whitespace-nowrap ${active ? 'text-blue-600' : done ? 'text-slate-500' : 'text-slate-400'}`}
              >
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-10px] sm:mt-[-18px] transition-colors ${done ? 'bg-blue-600' : 'bg-slate-200'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Employee card ─────────────────────────────────────────────────────────────

function EmployeeCard({
  employee,
  avail,
  selected,
  isLeader,
  onSelect,
  onRemove,
  selectable,
  disabled,
  showLeaderBadge,
}: {
  employee: Employee;
  avail: EmployeeAvailabilityResult | null;
  selected: boolean;
  isLeader: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  selectable?: boolean;
  disabled?: boolean;
  showLeaderBadge?: boolean;
}) {
  const initials = `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}`.toUpperCase();
  const fullName = `${employee.first_name} ${employee.last_name}`.trim();
  const dept = employee.department_name ?? employee.department ?? '—';
  const jobTitle = employee.job_title ?? '—';

  return (
    <div
      className={`relative flex items-start gap-3 rounded-xl border p-3.5 transition-all ${
        selected
          ? isLeader
            ? 'border-amber-400 bg-amber-50 shadow-sm'
            : 'border-blue-400 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : selectable ? 'cursor-pointer' : ''}`}
      onClick={!disabled && selectable ? onSelect : undefined}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable && !disabled ? 0 : undefined}
      onKeyDown={
        selectable && !disabled && onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      {/* Avatar */}
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isLeader
            ? 'bg-amber-500 text-white'
            : selected
              ? 'bg-blue-600 text-white'
              : 'bg-slate-200 text-slate-600'
        }`}
      >
        {initials || '?'}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-semibold text-slate-900 truncate">{fullName}</p>
          {showLeaderBadge && isLeader && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              ★ Team Leader
            </span>
          )}
          {selected && !isLeader && (
            <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              ✓ Selected
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500 truncate">
          {jobTitle} · {dept}
        </p>
        <p className="text-[10px] text-slate-400 font-mono">ID: {employee.public_id.slice(0, 8)}…</p>
        {avail && (
          <div className="mt-1.5">
            <AvailabilityPill avail={avail} />
            {avail.pendingLeaves.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                ⚠ Pending Leave
              </span>
            )}
          </div>
        )}
      </div>

      {/* Remove button */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-auto shrink-0 flex size-6 items-center justify-center rounded-full text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition"
          title="Remove from team"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────────

interface CreateProjectWizardProps {
  currentEmployeeId: string | undefined;
  onClose: () => void;
  onSuccess: (projectName: string) => void;
}

export default function CreateProjectWizard({
  currentEmployeeId,
  onClose,
  onSuccess,
}: CreateProjectWizardProps) {
  const [step, setStep] = useState(1);

  // Data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');

  // Step 1 – Project details
  const [projectDetails, setProjectDetails] = useState<WizardProject>({
    name: '',
    description: '',
    status: 'Planning',
    start_date: '',
    end_date: '',
  });
  const [step1Error, setStep1Error] = useState('');

  // Step 2 – Team selection
  const [selectedMembers, setSelectedMembers] = useState<TeamMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [step2Error, setStep2Error] = useState('');

  // Step 3 – Team leader
  const [leaderId, setLeaderId] = useState<string>('');
  const [step3Error, setStep3Error] = useState('');

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Date strings for availability calculation
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [twoWeeksStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [empRes, taskRes, leaveRes] = await Promise.all([
        client.employees(),
        client.tasks(),
        client.leaveRequests(),
      ]);
      setEmployees(unwrapList(empRes.data));
      setAllTasks(unwrapList(taskRes.data));
      setAllLeaves(unwrapList(leaveRes.data));
    } catch (cause) {
      setDataError(displayError(cause));
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // ── Availability map ───────────────────────────────────────────────────────

  const availabilityMap = useMemo(() => {
    const map = new Map<string, EmployeeAvailabilityResult>();
    const periodEnd = projectDetails.end_date || twoWeeksStr;
    const periodStart = projectDetails.start_date || todayStr;
    for (const emp of employees) {
      const res = calculateEmployeeAvailability(
        emp,
        allTasks,
        allLeaves,
        currentEmployeeId,
        periodStart,
        periodEnd,
      );
      map.set(emp.public_id, res);
    }
    return map;
  }, [
    employees,
    allTasks,
    allLeaves,
    currentEmployeeId,
    projectDetails.start_date,
    projectDetails.end_date,
    todayStr,
    twoWeeksStr,
  ]);

  // ── Eligible employees (active employment) ─────────────────────────────────

  const eligibleEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const status = (emp.employment_status || '').toLowerCase();
      return status === 'active' || status === '';
    });
  }, [employees]);

  // ── Search-filtered pool (exclude already selected) ────────────────────────

  const selectedIds = useMemo(
    () => new Set(selectedMembers.map((m) => m.employee.public_id)),
    [selectedMembers],
  );

  const filteredPool = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return eligibleEmployees.filter((emp) => {
      if (selectedIds.has(emp.public_id)) return false;
      if (!q) return true;
      const name = `${emp.first_name} ${emp.last_name}`.toLowerCase();
      const dept = (emp.department_name || '').toLowerCase();
      const title = (emp.job_title || '').toLowerCase();
      return name.includes(q) || dept.includes(q) || title.includes(q);
    });
  }, [eligibleEmployees, selectedIds, memberSearch]);

  // ── Step validation helpers ────────────────────────────────────────────────

  const canProceedStep1 = () => {
    if (!projectDetails.name.trim()) {
      setStep1Error('Project name is required.');
      return false;
    }
    if (!projectDetails.start_date) {
      setStep1Error('Start date is required.');
      return false;
    }
    if (projectDetails.end_date && projectDetails.end_date < projectDetails.start_date) {
      setStep1Error('End date cannot be earlier than start date.');
      return false;
    }
    setStep1Error('');
    return true;
  };

  const canProceedStep2 = () => {
    if (selectedMembers.length !== REQUIRED_TEAM_SIZE) {
      setStep2Error(
        `You must select exactly ${REQUIRED_TEAM_SIZE} team members. Currently selected: ${selectedMembers.length}.`,
      );
      return false;
    }
    setStep2Error('');
    return true;
  };

  const canProceedStep3 = () => {
    if (!leaderId) {
      setStep3Error('Please designate one team member as the Team Leader.');
      return false;
    }
    if (!selectedIds.has(leaderId)) {
      setStep3Error('Team Leader must be one of the selected team members.');
      return false;
    }
    setStep3Error('');
    return true;
  };

  const handleAddMember = (emp: Employee) => {
    if (selectedMembers.length >= REQUIRED_TEAM_SIZE) {
      setStep2Error('Team is full. Remove someone before adding another member.');
      return;
    }
    const avail = availabilityMap.get(emp.public_id) ?? null;
    setSelectedMembers((prev) => [...prev, { employee: emp, availability: avail }]);
    setStep2Error('');
  };

  const handleRemoveMember = (empId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.employee.public_id !== empId));
    if (leaderId === empId) setLeaderId('');
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');

    try {
      // 1. Create the project
      const { data: newProject } = await client.createProject({
        name: projectDetails.name.trim(),
        description: projectDetails.description.trim() || null,
        manager: currentEmployeeId,
        start_date: projectDetails.start_date,
        end_date: projectDetails.end_date || null,
        status: projectDetails.status,
      });

      // 2. Create one onboarding task per team member to persist team membership.
      //    The backend has no team_members field – tasks are the only way to
      //    record team membership on the project.
      const taskDate = projectDetails.end_date || projectDetails.start_date;

      await Promise.all(
        selectedMembers.map(async ({ employee }) => {
          const isLeader = employee.public_id === leaderId;
          const titlePrefix = isLeader ? '[Team Leader] ' : '';
          await client.createTask({
            project: newProject.public_id,
            assigned_to: employee.public_id,
            title: `${titlePrefix}Project Onboarding – ${projectDetails.name.trim()}`,
            description: isLeader
              ? `${employee.first_name} ${employee.last_name} is the designated Team Leader for this project. They are responsible for coordinating the team and reporting progress to the Project Manager.`
              : `${employee.first_name} ${employee.last_name} has been assigned to this project team.`,
            deadline: taskDate,
            status: 'To Do',
          });
        }),
      );

      onSuccess(projectDetails.name.trim());
    } catch (cause) {
      setSubmitError(displayError(cause));
      setSubmitting(false);
    }
  };

  // ── Computed leader employee ───────────────────────────────────────────────

  const leaderEmployee = useMemo(
    () => selectedMembers.find((m) => m.employee.public_id === leaderId)?.employee ?? null,
    [selectedMembers, leaderId],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (dataLoading) return <LoadingState label="Loading employee directory…" />;
  if (dataError) return <ErrorMessage>{dataError}</ErrorMessage>;

  return (
    <div>
      <StepIndicator current={step} />

      {/* ─── Step 1: Project Details ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Step 1 — Project Details</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Provide core information about the project initiative.
            </p>
          </div>

          {step1Error && <ErrorMessage>{step1Error}</ErrorMessage>}

          <Field
            label="Project Name"
            required
            placeholder="e.g. Next-Gen Core ERP Portal"
            value={projectDetails.name}
            onChange={(e) => setProjectDetails((p) => ({ ...p, name: e.target.value }))}
          />

          <TextareaField
            label="Objective & Scope Description"
            placeholder="Provide strategic purpose, objectives, and deliverables…"
            value={projectDetails.description}
            onChange={(e) => setProjectDetails((p) => ({ ...p, description: e.target.value }))}
          />

          <div className="grid gap-3.5 sm:grid-cols-2">
            <SelectField
              label="Status"
              value={projectDetails.status}
              onChange={(e) => setProjectDetails((p) => ({ ...p, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectField>

            <div />

            <Field
              label="Planned Start Date"
              type="date"
              required
              value={projectDetails.start_date}
              onChange={(e) => setProjectDetails((p) => ({ ...p, start_date: e.target.value }))}
            />

            <Field
              label="Planned End Date"
              type="date"
              value={projectDetails.end_date}
              onChange={(e) => setProjectDetails((p) => ({ ...p, end_date: e.target.value }))}
            />
          </div>

          {/* Backend limitation notice */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-700">
            <span className="font-semibold">Note:</span> Project priority is not stored in the
            backend schema. Team membership and leader designation will be recorded via initial task
            assignments (the only available mechanism without a backend schema change).
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (canProceedStep1()) setStep(2);
              }}
            >
              Next: Select Team <Icon name="arrow" size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 2: Team Selection ──────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Step 2 — Select Exactly 4 Team Members
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose four employees from the active directory. Availability is evaluated over the
              project period.
            </p>
          </div>

          {step2Error && <ErrorMessage>{step2Error}</ErrorMessage>}

          {/* Selected members panel */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Selected Team ({selectedMembers.length} / {REQUIRED_TEAM_SIZE})
              </p>
              {selectedMembers.length === REQUIRED_TEAM_SIZE && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  ✓ Team Complete
                </span>
              )}
            </div>

            {selectedMembers.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">
                No members selected yet. Pick from the directory below.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedMembers.map(({ employee, availability }) => (
                  <EmployeeCard
                    key={employee.public_id}
                    employee={employee}
                    avail={availability}
                    selected
                    isLeader={false}
                    showLeaderBadge={false}
                    onRemove={() => handleRemoveMember(employee.public_id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Directory pool */}
          <div>
            <div className="mb-2">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Employee Directory ({filteredPool.length} eligible)
              </p>
            </div>

            <input
              type="search"
              placeholder="Search by name, department, or job title…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            />

            {filteredPool.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-4">
                {memberSearch
                  ? 'No employees match your search.'
                  : 'All eligible employees are already selected.'}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 max-h-72 overflow-y-auto pr-1">
                {filteredPool.map((emp) => {
                  const avail = availabilityMap.get(emp.public_id) ?? null;
                  const isFull = selectedMembers.length >= REQUIRED_TEAM_SIZE;
                  return (
                    <EmployeeCard
                      key={emp.public_id}
                      employee={emp}
                      avail={avail}
                      selected={false}
                      isLeader={false}
                      selectable={!isFull}
                      disabled={isFull}
                      onSelect={() => handleAddMember(emp)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {eligibleEmployees.length < REQUIRED_TEAM_SIZE && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-700">
              <span className="font-semibold">Warning:</span> Only {eligibleEmployees.length} active
              employees exist in the directory. You need {REQUIRED_TEAM_SIZE} to create a project.
            </div>
          )}

          <div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (canProceedStep2()) setStep(3);
              }}
            >
              Next: Choose Leader <Icon name="arrow" size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Team Leader ─────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Step 3 — Designate Team Leader</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select exactly one of the four team members to act as Team Leader. The Team Leader
              coordinates the team and reports progress to the Project Manager. They do not receive
              Admin or Project Manager permissions.
            </p>
          </div>

          {step3Error && <ErrorMessage>{step3Error}</ErrorMessage>}

          <div className="grid gap-3 sm:grid-cols-2">
            {selectedMembers.map(({ employee, availability }) => {
              const isCurrentLeader = employee.public_id === leaderId;
              return (
                <button
                  key={employee.public_id}
                  type="button"
                  onClick={() => {
                    setLeaderId(employee.public_id);
                    setStep3Error('');
                  }}
                  className={`relative text-left rounded-xl border-2 p-4 transition-all ${
                    isCurrentLeader
                      ? 'border-amber-400 bg-amber-50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isCurrentLeader ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {employee.first_name?.[0]}
                      {employee.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">
                        {employee.first_name} {employee.last_name}
                      </p>
                      <p className="text-[11px] text-slate-500">{employee.job_title ?? '—'}</p>
                      <p className="text-[11px] text-slate-400">
                        {employee.department_name ?? '—'}
                      </p>
                      {availability && (
                        <div className="mt-1.5">
                          <AvailabilityPill avail={availability} />
                        </div>
                      )}
                    </div>
                  </div>

                  {isCurrentLeader && (
                    <div className="absolute top-2 right-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        ★ Team Leader
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {leaderId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
              <span className="font-semibold">
                ★ {leaderEmployee?.first_name} {leaderEmployee?.last_name}
              </span>{' '}
              is designated as Team Leader. Their initial onboarding task will be labelled{' '}
              <code className="font-mono">[Team Leader]</code> so the role is identifiable in the
              backend records.
            </div>
          )}

          <div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => setStep(2)}>
              ← Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (canProceedStep3()) setStep(4);
              }}
            >
              Next: Review <Icon name="arrow" size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Review & Confirm ────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Step 4 — Review & Confirm</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Confirm all project details before submitting.
            </p>
          </div>

          {submitError && <ErrorMessage>{submitError}</ErrorMessage>}

          {/* Project info */}
          <Card className="p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Project Information
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Name</p>
                <p className="font-bold text-slate-900">{projectDetails.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Status</p>
                <p className="font-semibold text-slate-800">{projectDetails.status}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Start Date</p>
                <p className="font-mono text-slate-800">{projectDetails.start_date}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">End Date</p>
                <p className="font-mono text-slate-800">{projectDetails.end_date || 'Not set'}</p>
              </div>
              {projectDetails.description && (
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold text-slate-500">Description</p>
                  <p className="text-slate-700 leading-relaxed">{projectDetails.description}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Team */}
          <Card className="p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Project Team ({REQUIRED_TEAM_SIZE} Members)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedMembers.map(({ employee, availability }) => (
                <EmployeeCard
                  key={employee.public_id}
                  employee={employee}
                  avail={availability}
                  selected
                  isLeader={employee.public_id === leaderId}
                  showLeaderBadge
                />
              ))}
            </div>
          </Card>

          {/* Persistence notice */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[11px] text-slate-600 leading-relaxed space-y-1.5">
            <p className="font-semibold text-slate-700">How team membership is persisted</p>
            <p>
              The backend{' '}
              <code className="font-mono text-[10px] bg-slate-200 px-1 rounded">Project</code>{' '}
              model has no{' '}
              <code className="font-mono text-[10px] bg-slate-200 px-1 rounded">team_members</code>{' '}
              or{' '}
              <code className="font-mono text-[10px] bg-slate-200 px-1 rounded">team_leader</code>{' '}
              field. Submitting will create the project, then automatically create one{' '}
              <em>Project Onboarding</em> task per team member. The Team Leader&apos;s task will be
              prefixed with{' '}
              <code className="font-mono text-[10px] bg-slate-200 px-1 rounded">[Team Leader]</code>
              . These tasks establish team membership and can be edited or reassigned later.
            </p>
          </div>

          <div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" type="button" onClick={() => setStep(3)}>
              ← Back
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {submitting ? 'Creating Project…' : 'Create Project & Assign Team'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
