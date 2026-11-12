import { useState } from 'react';
import { client } from '../api/client';
import type { Branch, Company, Department } from '../api/types';
import type { HierarchySelection } from '../utils/managers';
import { displayError } from './format';
import { Button, Icon } from './ui';

export function OrgHierarchySelect({
  companies,
  branches,
  departments,
  value,
  onChange,
  canCreateDepartment = false,
  onDepartmentCreated,
  required = true,
}: {
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  value: HierarchySelection;
  onChange: (next: HierarchySelection) => void;
  canCreateDepartment?: boolean;
  onDepartmentCreated?: (dept: Department) => void;
  required?: boolean;
}) {
  const [newDeptName, setNewDeptName] = useState('');
  const [creatingDept, setCreatingDept] = useState(false);
  const [deptError, setDeptError] = useState('');

  const branchesForCompany = value.companyId
    ? branches.filter((b) => b.company === value.companyId)
    : [];

  const departmentsForBranch = value.branchId
    ? departments.filter((d) => d.branch === value.branchId)
    : [];

  const handleCompanyChange = (nextCompanyId: string) => {
    setDeptError('');
    const nextBranches = nextCompanyId
      ? branches.filter((b) => b.company === nextCompanyId)
      : [];
    const nextBranchId = nextBranches[0]?.public_id ?? '';
    const nextDepts = nextBranchId
      ? departments.filter((d) => d.branch === nextBranchId)
      : [];
    const nextDepartmentId = nextDepts[0]?.public_id ?? '';
    onChange({
      companyId: nextCompanyId,
      branchId: nextBranchId,
      departmentId: nextDepartmentId,
    });
  };

  const handleBranchChange = (nextBranchId: string) => {
    setDeptError('');
    const nextDepts = nextBranchId
      ? departments.filter((d) => d.branch === nextBranchId)
      : [];
    const nextDepartmentId = nextDepts[0]?.public_id ?? '';
    onChange({
      companyId: value.companyId,
      branchId: nextBranchId,
      departmentId: nextDepartmentId,
    });
  };

  const handleDepartmentChange = (nextDepartmentId: string) => {
    setDeptError('');
    onChange({
      companyId: value.companyId,
      branchId: value.branchId,
      departmentId: nextDepartmentId,
    });
  };

  const handleCreateDepartment = async () => {
    const trimmed = newDeptName.trim();
    if (!trimmed) {
      setDeptError('Enter a department name.');
      return;
    }
    if (!value.branchId) {
      setDeptError('Select a branch first.');
      return;
    }

    setCreatingDept(true);
    setDeptError('');
    try {
      const { data: created } = await client.createDepartment({
        branch: value.branchId,
        name: trimmed,
      });
      setNewDeptName('');
      onDepartmentCreated?.(created);
      onChange({
        companyId: value.companyId,
        branchId: value.branchId,
        departmentId: created.public_id,
      });
    } catch (cause) {
      setDeptError(displayError(cause));
    } finally {
      setCreatingDept(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Organization */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Organization {required && <span className="text-rose-500">*</span>}
          </label>
          <select
            value={value.companyId}
            onChange={(e) => handleCompanyChange(e.target.value)}
            required={required}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Select Organization</option>
            {companies.map((c) => (
              <option key={c.public_id} value={c.public_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Branch */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Branch {required && <span className="text-rose-500">*</span>}
          </label>
          <select
            value={value.branchId}
            onChange={(e) => handleBranchChange(e.target.value)}
            required={required}
            disabled={!value.companyId}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">
              {!value.companyId
                ? 'Select Organization first'
                : branchesForCompany.length === 0
                  ? 'No branches available'
                  : 'Select Branch'}
            </option>
            {branchesForCompany.map((b) => (
              <option key={b.public_id} value={b.public_id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Department */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Department {required && <span className="text-rose-500">*</span>}
          </label>
          <select
            value={value.departmentId}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            required={required}
            disabled={!value.branchId}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">
              {!value.branchId
                ? 'Select Branch first'
                : departmentsForBranch.length === 0
                  ? 'No departments in branch'
                  : 'Select Department'}
            </option>
            {departmentsForBranch.map((d) => (
              <option key={d.public_id} value={d.public_id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Inline Department Creation when selected branch has 0 departments */}
      {value.branchId && departmentsForBranch.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-amber-950">
              No departments exist in this branch yet.
              {canCreateDepartment
                ? ' Create one right here:'
                : ' Ask Admin or HR to add a department.'}
            </p>
          </div>
          {canCreateDepartment && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="New department name (e.g. Engineering)"
                className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={creatingDept}
                onClick={handleCreateDepartment}
              >
                <Icon name="plus" size={13} />
                <span>{creatingDept ? 'Creating…' : 'Create Department'}</span>
              </Button>
            </div>
          )}
          {deptError && <p className="text-[11px] font-medium text-rose-700">{deptError}</p>}
        </div>
      )}
    </div>
  );
}
