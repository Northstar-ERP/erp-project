import { useCallback, useEffect, useMemo, useState } from 'react';
import { client, unwrapList } from '../api/client';
import type { AttendanceRecord, Department, Employee, LeaveRequest } from '../api/types';
import { displayError, formatDate, toLocalISODate } from '../components/format';
import { useAuth } from '../context/auth';
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Icon,
  LoadingState,
  PageHeader,
  SearchInput,
  SelectField,
  SuccessMessage,
} from '../components/ui';

const HR_ROLE = 'HR Manager';
const MANAGER_ROLE = 'Department / Project Manager';

/** Today's date in the browser's local time zone (YYYY-MM-DD). */
const localToday = () => toLocalISODate();

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatWorked(minutes: number | null): string {
  if (minutes == null) return '';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Leadership highlight for HR and managers in the roster. */
function roleHighlight(emp: Employee): { label: string; row: string; badge: string } | null {
  if (emp.role_name === HR_ROLE) {
    return {
      label: 'HR',
      row: 'bg-purple-50/60 border-l-4 border-l-purple-400',
      badge: 'bg-purple-100 text-purple-800 border-purple-200',
    };
  }
  if (emp.role_name === MANAGER_ROLE || emp.is_branch_manager || emp.is_department_head) {
    return {
      label: 'Manager',
      row: 'bg-blue-50/60 border-l-4 border-l-blue-400',
      badge: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }
  return null;
}

export default function AttendancePage() {
  const { user, hasRole } = useAuth();
  const isAdmin = Boolean(
    user?.is_superuser || user?.role_name === 'System Admin' || hasRole(['System Admin']),
  );
  const isHR = Boolean(user?.role_name === HR_ROLE || hasRole([HR_ROLE]));
  const isPM = Boolean(user?.role_name === MANAGER_ROLE || hasRole([MANAGER_ROLE]));
  const canViewOrg = isAdmin || isHR;
  const myEmployeeId = user?.employee_public_id ?? null;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [today] = useState(localToday);
  const [selectedDate, setSelectedDate] = useState(today);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [empRes, deptRes, leaveRes] = await Promise.allSettled([
        client.employees(),
        canViewOrg ? client.departments() : Promise.resolve({ data: [] as Department[] }),
        client.leaveRequests(),
      ]);
      if (empRes.status === 'fulfilled') {
        setEmployees(unwrapList(empRes.value.data));
      } else {
        setError(displayError(empRes.reason));
      }
      if (deptRes.status === 'fulfilled') {
        setDepartments(unwrapList(deptRes.value.data));
      }
      if (leaveRes.status === 'fulfilled') {
        setLeaves(unwrapList(leaveRes.value.data));
      }
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, [canViewOrg]);

  const loadAttendance = useCallback(async () => {
    try {
      const { data } = await client.attendance({ start_date: selectedDate, end_date: selectedDate });
      setRecords(unwrapList(data));
    } catch (cause) {
      setError(displayError(cause));
    }
  }, [selectedDate]);

  const loadToday = useCallback(async () => {
    if (!myEmployeeId) return;
    try {
      const { data } = await client.attendance({ start_date: today, end_date: today });
      setTodayRecord(unwrapList(data).find((r) => r.employee_public_id === myEmployeeId) ?? null);
    } catch {
      // The roster load already surfaces errors.
    }
  }, [myEmployeeId, today]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    void Promise.resolve().then(loadAttendance);
  }, [loadAttendance]);

  useEffect(() => {
    void Promise.resolve().then(loadToday);
  }, [loadToday]);

  const punch = async (kind: 'in' | 'out') => {
    setPunching(true);
    setError('');
    setSuccess('');
    try {
      const { data } = kind === 'in' ? await client.checkIn() : await client.checkOut();
      setTodayRecord(data);
      setSuccess(
        kind === 'in'
          ? `Checked in at ${formatTime(data.check_in)}.`
          : `Checked out at ${formatTime(data.check_out)}. Worked ${formatWorked(data.worked_minutes)}.`,
      );
      if (selectedDate === today) await loadAttendance();
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setPunching(false);
    }
  };

  const recordByEmployee = useMemo(
    () => new Map(records.map((r) => [r.employee_public_id, r])),
    [records],
  );

  // Approved leaves active on the selected date
  const leavesOnSelectedDate = useMemo(() => {
    return leaves.filter((l) => {
      const status = (l.status || '').toLowerCase();
      if (status !== 'approved') return false;
      return l.start_date <= selectedDate && l.end_date >= selectedDate;
    });
  }, [leaves, selectedDate]);

  const activeEmployees = useMemo(() => {
    return employees.filter((e) => (e.employment_status || '').toLowerCase() === 'active');
  }, [employees]);

  // Whose attendance the current user is allowed to see (mirrors the backend rules).
  const canSeeRecordOf = useCallback(
    (emp: Employee) =>
      canViewOrg ||
      emp.public_id === myEmployeeId ||
      (isPM && Boolean(myEmployeeId) && emp.manager === myEmployeeId),
    [canViewOrg, isPM, myEmployeeId],
  );

  const filteredEmployees = useMemo(() => {
    const rows = activeEmployees.filter((emp) => {
      const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
      const matchesSearch =
        !search ||
        fullName.includes(search.toLowerCase()) ||
        (emp.job_title || '').toLowerCase().includes(search.toLowerCase());

      const matchesDept =
        !departmentFilter ||
        emp.department === departmentFilter ||
        emp.department_name === departmentFilter;

      return matchesSearch && matchesDept;
    });
    // HR and managers first so they stand out at the top of the roster.
    const rank = (emp: Employee) => {
      const h = roleHighlight(emp);
      return h?.label === 'HR' ? 0 : h ? 1 : 2;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [activeEmployees, search, departmentFilter]);

  const presentCount = records.filter((r) => r.check_in).length;
  const leadershipCount = activeEmployees.filter((e) => roleHighlight(e)).length;

  if (loading) {
    return <LoadingState label="Loading workforce roster and attendance records..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? 'Organization Monitoring' : canViewOrg ? 'HR Operations' : 'Self Service'}
        title={canViewOrg ? 'Attendance Management' : 'My Attendance'}
        description={
          canViewOrg
            ? 'Monitor daily check-ins and check-outs across the organization alongside approved leave.'
            : 'Check in and out for the day and review your attendance records.'
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}

      {/* Today's check-in / check-out */}
      {myEmployeeId && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <Icon name="clock" size={20} />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">Today · {formatDate(today)}</p>
                <p className="text-xs text-slate-500">
                  {!todayRecord
                    ? 'You have not checked in yet.'
                    : todayRecord.check_out
                      ? `Checked in ${formatTime(todayRecord.check_in)} · Checked out ${formatTime(todayRecord.check_out)} · ${formatWorked(todayRecord.worked_minutes)}`
                      : `Checked in at ${formatTime(todayRecord.check_in)} — remember to check out.`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={punching || Boolean(todayRecord)} onClick={() => void punch('in')}>
                <Icon name="check-circle" size={14} /> Check In
              </Button>
              <Button
                variant="secondary"
                disabled={punching || !todayRecord || Boolean(todayRecord.check_out)}
                onClick={() => void punch('out')}
              >
                <Icon name="clock" size={14} /> Check Out
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="users" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeEmployees.length}</p>
              <p className="text-xs font-medium text-slate-500">Active Staff Headcount</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon name="check-circle" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{presentCount}</p>
              <p className="text-xs font-medium text-slate-500">Checked In on {formatDate(selectedDate)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Icon name="calendar" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{leavesOnSelectedDate.length}</p>
              <p className="text-xs font-medium text-slate-500">On Approved Leave</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
              <Icon name="shield" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{leadershipCount}</p>
              <p className="text-xs font-medium text-slate-500">Managers & HR</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and date bar */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Attendance Date"
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => setSelectedDate(e.target.value || today)}
          />

          {departments.length > 0 ? (
            <SelectField
              label="Filter Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All Departments ({departments.length})</option>
              {departments.map((d) => (
                <option key={d.public_id} value={d.public_id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <div />
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Search Staff</label>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by staff name or title..." />
          </div>
        </div>
      </Card>

      {/* Roster */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Workforce Attendance for {formatDate(selectedDate)}
            </h2>
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-purple-400" /> HR
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-blue-400" /> Manager
              </span>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
            {filteredEmployees.length} Employees
          </span>
        </div>

        {filteredEmployees.length === 0 ? (
          <EmptyState
            icon="users"
            title="No matching staff found"
            description="Adjust your search query or department filter to inspect employees."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-100 font-semibold uppercase tracking-wider text-[10px] text-slate-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Designation</th>
                  <th className="px-5 py-3">Leave Status</th>
                  <th className="px-5 py-3">Check In</th>
                  <th className="px-5 py-3">Check Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEmployees.map((emp) => {
                  const highlight = roleHighlight(emp);
                  const visible = canSeeRecordOf(emp);
                  const record = recordByEmployee.get(emp.public_id);
                  const activeLeave = leavesOnSelectedDate.find(
                    (l) =>
                      l.employee_name === `${emp.first_name} ${emp.last_name}` ||
                      String(l.employee) === String(emp.public_id),
                  );

                  return (
                    <tr
                      key={emp.public_id}
                      className={`transition ${highlight ? highlight.row : 'hover:bg-slate-50/70'}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {emp.first_name} {emp.last_name}
                          </p>
                          {highlight && (
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${highlight.badge}`}
                            >
                              {highlight.label}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">{emp.email || 'No email'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium">
                        {emp.department_name || 'General Operations'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{emp.job_title || 'Staff Member'}</td>
                      <td className="px-5 py-3.5">
                        {activeLeave ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                            <Icon name="calendar" size={12} />
                            On Leave ({activeLeave.leave_type_name})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <Icon name="check-circle" size={12} />
                            On Duty
                          </span>
                        )}
                      </td>
                      {!visible ? (
                        <td colSpan={2} className="px-5 py-3.5 text-[11px] italic text-slate-400">
                          Restricted
                        </td>
                      ) : record ? (
                        <>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-700">
                            {formatTime(record.check_in)}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-700">
                            {record.check_out ? (
                              <>
                                {formatTime(record.check_out)}
                                <span className="ml-1.5 text-slate-400">
                                  ({formatWorked(record.worked_minutes)})
                                </span>
                              </>
                            ) : (
                              <span className="text-amber-600">Still checked in</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={2} className="px-5 py-3.5 text-[11px] text-slate-400">
                          {activeLeave ? 'On leave' : 'No check-in'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
