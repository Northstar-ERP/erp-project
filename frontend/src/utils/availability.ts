import type { Employee, LeaveRequest, Task } from '../api/types';

export type AvailabilityStatus = 'Available' | 'Busy' | 'On Leave' | 'Unavailable' | 'Unknown';

export interface EmployeeAvailabilityResult {
  status: AvailabilityStatus;
  statusLabel: string;
  badgeVariant: 'success' | 'warning' | 'danger' | 'neutral' | 'purple';
  isLeaveVerified: boolean;
  activeTasks: Task[];
  conflictingTasks: Task[];
  approvedLeaves: LeaveRequest[];
  pendingLeaves: LeaveRequest[];
  upcomingAvailableDate: string | null;
  reason: string;
}

export function doDateRangesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean {
  if (!start1 || !end1 || !start2 || !end2) return false;
  return start1 <= end2 && end1 >= start2;
}

export function isEmployeeMatch(employee: Employee, leave: LeaveRequest): boolean {
  const fullName = `${employee.first_name} ${employee.last_name}`.trim().toLowerCase();
  const leaveName = (leave.employee_name || '').trim().toLowerCase();
  if (leaveName && fullName === leaveName) return true;
  if (leave.employee && String(leave.employee) === employee.public_id) return true;
  return false;
}

export function calculateEmployeeAvailability(
  employee: Employee,
  allTasks: Task[],
  allLeaves: LeaveRequest[],
  currentPMEmployeeId: string | null | undefined,
  periodStart: string,
  periodEnd: string,
): EmployeeAvailabilityResult {
  // 1. Employment status check
  const empStatus = (employee.employment_status || '').toLowerCase().trim();
  if (empStatus !== 'active' && empStatus !== '') {
    return {
      status: 'Unavailable',
      statusLabel: `Unavailable (${employee.employment_status})`,
      badgeVariant: 'danger',
      isLeaveVerified: true,
      activeTasks: [],
      conflictingTasks: [],
      approvedLeaves: [],
      pendingLeaves: [],
      upcomingAvailableDate: null,
      reason: `Employment status is ${employee.employment_status}`,
    };
  }

  // 2. Filter tasks assigned to this employee
  const employeeTasks = allTasks.filter(
    (t) =>
      t.assigned_to === employee.public_id ||
      t.assigned_to_details?.public_id === employee.public_id,
  );

  const activeTasks = employeeTasks.filter(
    (t) => (t.status || '').toLowerCase() !== 'done',
  );

  // Conflicting tasks: active tasks due within the period
  const conflictingTasks = activeTasks.filter((t) => {
    if (!t.deadline) return false;
    return t.deadline >= periodStart && t.deadline <= periodEnd;
  });

  // 3. Filter leave requests for this employee
  const employeeLeaves = allLeaves.filter((l) => isEmployeeMatch(employee, l));

  // Determine if PM has verified access to this employee's leaves
  // (Either reports to current PM, is current PM, or has leave records returned by the leave API)
  const isDirectReport = Boolean(
    currentPMEmployeeId && employee.manager === currentPMEmployeeId,
  );
  const isSelf = Boolean(
    currentPMEmployeeId && employee.public_id === currentPMEmployeeId,
  );
  const hasLeaveRecords = employeeLeaves.length > 0;
  const isLeaveVerified = isDirectReport || isSelf || hasLeaveRecords;

  // Approved leaves overlapping period
  const approvedLeaves = employeeLeaves.filter((l) => {
    const isApproved = (l.status || '').toUpperCase() === 'APPROVED';
    return isApproved && doDateRangesOverlap(l.start_date, l.end_date, periodStart, periodEnd);
  });

  // Pending leaves overlapping period (tracked separately, NOT treated as approved)
  const pendingLeaves = employeeLeaves.filter((l) => {
    const isPending = (l.status || '').toUpperCase() === 'PENDING';
    return isPending && doDateRangesOverlap(l.start_date, l.end_date, periodStart, periodEnd);
  });

  // Rule 1: On Leave
  if (approvedLeaves.length > 0) {
    const primaryLeave = approvedLeaves[0];
    const nextFree = new Date(`${primaryLeave.end_date}T00:00:00`);
    nextFree.setDate(nextFree.getDate() + 1);
    const nextFreeStr = nextFree.toISOString().slice(0, 10);

    return {
      status: 'On Leave',
      statusLabel: 'On Leave',
      badgeVariant: 'purple',
      isLeaveVerified: true,
      activeTasks,
      conflictingTasks,
      approvedLeaves,
      pendingLeaves,
      upcomingAvailableDate: nextFreeStr,
      reason: `Approved leave: ${primaryLeave.leave_type_name || 'Leave'} (${primaryLeave.start_date} to ${primaryLeave.end_date})`,
    };
  }

  // Rule 2: Busy
  // If employee has conflicting tasks due in the selected period, or heavy workload (>= 3 active tasks)
  if (conflictingTasks.length > 0 || activeTasks.length >= 3) {
    // Find latest deadline among active tasks
    let latestDeadline = '';
    for (const t of activeTasks) {
      if (t.deadline && (!latestDeadline || t.deadline > latestDeadline)) {
        latestDeadline = t.deadline;
      }
    }

    let upcomingDate: string | null = null;
    if (latestDeadline) {
      const nextDate = new Date(`${latestDeadline}T00:00:00`);
      nextDate.setDate(nextDate.getDate() + 1);
      upcomingDate = nextDate.toISOString().slice(0, 10);
    }

    const reason =
      conflictingTasks.length > 0
        ? `${conflictingTasks.length} task(s) scheduled during selected period`
        : `High workload with ${activeTasks.length} active tasks`;

    return {
      status: 'Busy',
      statusLabel: 'Busy',
      badgeVariant: 'warning',
      isLeaveVerified,
      activeTasks,
      conflictingTasks,
      approvedLeaves,
      pendingLeaves,
      upcomingAvailableDate: upcomingDate,
      reason,
    };
  }

  // Rule 3: Unavailable / Unknown if leave data is not verified and required data is missing
  if (!isLeaveVerified) {
    return {
      status: 'Unknown',
      statusLabel: 'Unknown (Leave Unverified)',
      badgeVariant: 'neutral',
      isLeaveVerified: false,
      activeTasks,
      conflictingTasks,
      approvedLeaves,
      pendingLeaves,
      upcomingAvailableDate: 'Immediate (unverified)',
      reason: 'Leave records cannot be verified through existing manager permissions.',
    };
  }

  // Rule 4: Available
  return {
    status: 'Available',
    statusLabel: 'Available',
    badgeVariant: 'success',
    isLeaveVerified: true,
    activeTasks,
    conflictingTasks,
    approvedLeaves,
    pendingLeaves,
    upcomingAvailableDate: 'Immediate',
    reason: 'No conflicting assignments or approved leave in selected period.',
  };
}
