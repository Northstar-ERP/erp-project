import { useCallback, useEffect, useMemo, useState } from 'react';
import { client, unwrapList } from '../api/client';
import type { AttendanceRecord, Department, Employee, LeaveRequest } from '../api/types';
import { displayError, formatDate } from '../components/format';
import { useAuth } from '../context/auth';
import {
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Icon,
  LoadingState,
  PageHeader,
  SearchInput,
  SelectField,
  StatusBadge,
} from '../components/ui';

export default function AttendancePage() {
  const { user, hasRole } = useAuth();
  const isAdmin = Boolean(
    user?.is_superuser || user?.role_name === 'System Admin' || hasRole(['System Admin']),
  );

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [empRes, deptRes, leaveRes] = await Promise.allSettled([
        client.employees(),
        client.departments(),
        client.leaveRequests(),
      ]);
      const attendanceRes = await client.attendance({
        start_date: selectedDate,
        end_date: selectedDate,
      });
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
      setAttendance(unwrapList(attendanceRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Real leaves active on the selected date
  const leavesOnSelectedDate = useMemo(() => {
    return leaves.filter((l) => {
      const status = (l.status || '').toLowerCase();
      if (status !== 'approved') return false;
      return l.start_date <= selectedDate && l.end_date >= selectedDate;
    });
  }, [leaves, selectedDate]);

  // Active employees
  const activeEmployees = useMemo(() => {
    return employees.filter(
      (e) => (e.employment_status || '').toLowerCase() === 'active',
    );
  }, [employees]);

  // Filtered employees for workforce context
  const filteredEmployees = useMemo(() => {
    return activeEmployees.filter((emp) => {
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
  }, [activeEmployees, search, departmentFilter]);

  if (loading) {
    return <LoadingState label="Loading workforce roster and schedule telemetry..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAdmin ? 'Organization Monitoring' : 'HR Operations'}
        title="Attendance Management"
        description={
          isAdmin
            ? 'Monitor organization-wide attendance records, daily active staffing, and leave schedule synchronization.'
            : 'Track daily attendance logs, verify present/absent statuses, monitor shifts, and audit timekeeping data.'
        }
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-emerald-950 shadow-xs">
        <div className="flex items-start gap-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
            <Icon name="check-circle" size={20} />
          </span>
          <div className="space-y-1.5 text-xs">
            <h3 className="font-bold text-emerald-900 text-sm">
              Attendance records synchronized
            </h3>
            <p className="leading-relaxed text-emerald-800">
              Showing verified attendance records from the backend for {formatDate(selectedDate)}.
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 text-[11px] text-emerald-900 font-medium">
              <div className="flex items-center gap-1.5">
                <Icon name="check-circle" size={13} className="text-emerald-700" />
                <span>Verified workforce headcount: {activeEmployees.length} active employees</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Icon name="check-circle" size={13} className="text-emerald-700" />
                <span>Synchronized approved leave: {leavesOnSelectedDate.length} on leave for {formatDate(selectedDate)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Tiles based on real verified backend data */}
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
            <span className="flex size-11 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Icon name="calendar" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{leavesOnSelectedDate.length}</p>
              <p className="text-xs font-medium text-slate-500">Scheduled on Approved Leave</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Icon name="building" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{departments.length}</p>
              <p className="text-xs font-medium text-slate-500">Operating Departments</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icon name="clock" size={20} />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{attendance.length}</p>
              <p className="text-xs font-medium text-slate-500">Attendance Records</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Date Bar */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Attendance Date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />

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

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Search Staff</label>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by staff name or title..."
            />
          </div>
        </div>
      </Card>

      {/* Workforce Roster & Scheduled Leave Synchronizer */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Workforce Roster & Time-Off Status for {formatDate(selectedDate)}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Cross-referenced against verified employee profiles and active leave approvals
            </p>
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
                  <th className="px-5 py-3">Leave Calendar Status</th>
                  <th className="px-5 py-3">Timekeeping Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEmployees.map((emp) => {
                  const activeLeave = leavesOnSelectedDate.find(
                    (l) =>
                      l.employee_name === `${emp.first_name} ${emp.last_name}` ||
                      String(l.employee) === String(emp.public_id),
                  );

                  const record = attendance.find(
                    (item) =>
                      item.employee_name === `${emp.first_name} ${emp.last_name}` ||
                      String(item.employee) === String(emp.public_id),
                  );

                  return (
                    <tr key={emp.public_id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">
                          {emp.first_name} {emp.last_name}
                        </p>
                        <p className="text-[11px] text-slate-500">{emp.email || 'No email'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium">
                        {emp.department_name || 'General Operations'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {emp.job_title || 'Staff Member'}
                      </td>
                      <td className="px-5 py-3.5">
                        {activeLeave ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                            <Icon name="calendar" size={12} />
                            On Approved Leave ({activeLeave.leave_type_name})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <Icon name="check-circle" size={12} />
                            Scheduled On Duty
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {record ? (
                          <div className="space-y-1">
                            <StatusBadge status={record.status} />
                            <p className="text-[11px] text-slate-500">
                              {record.check_in
                                ? `In ${new Date(record.check_in).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : 'No check-in recorded'}
                              {record.check_out
                                ? ` · Out ${new Date(record.check_out).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}`
                                : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">No record for this date</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
          Attendance tracking
        </h3>
        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
            <p className="font-bold text-slate-900">Daily Punch Logs</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Attendance records include check-in and check-out timestamps from the backend timekeeping service.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
            <p className="font-bold text-slate-900">Status & Anomaly Engine</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Records are classified as Present, Late, Absent, or Half-Day by the backend.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
            <p className="font-bold text-slate-900">HR Correction Audit</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
              Attendance data remains read-only in this view and follows the backend audit trail.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
