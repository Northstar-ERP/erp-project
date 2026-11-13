import { useCallback, useEffect, useMemo, useState } from 'react';
import { client, unwrapList } from '../api/client';
import type { Branch, Company, Department, Team } from '../api/types';
import { displayError } from '../components/format';
import {
  Card,
  EmptyState,
  ErrorMessage,
  Icon,
  LoadingState,
  PageHeader,
  SearchInput,
} from '../components/ui';

export default function OrgChartPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Collapsed node ids (companies/branches/departments default expanded; collapsing is opt-in).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [compRes, branchRes, deptRes, teamRes] = await Promise.all([
        client.companies(),
        client.branches(),
        client.departments(),
        client.teams(),
      ]);
      setCompanies(unwrapList(compRes.data));
      setBranches(unwrapList(branchRes.data));
      setDepartments(unwrapList(deptRes.data));
      setTeams(unwrapList(teamRes.data));
    } catch (cause) {
      setError(displayError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const branchesByCompany = useMemo(() => {
    const map = new Map<string, Branch[]>();
    for (const b of branches) {
      if (!b.company) continue;
      const list = map.get(b.company) ?? [];
      list.push(b);
      map.set(b.company, list);
    }
    return map;
  }, [branches]);

  const departmentsByBranch = useMemo(() => {
    const map = new Map<string, Department[]>();
    for (const d of departments) {
      if (!d.branch) continue;
      const list = map.get(d.branch) ?? [];
      list.push(d);
      map.set(d.branch, list);
    }
    return map;
  }, [departments]);

  const teamsByDepartment = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const t of teams) {
      if (!t.department) continue;
      const list = map.get(t.department) ?? [];
      list.push(t);
      map.set(t.department, list);
    }
    return map;
  }, [teams]);

  // When searching, auto-expand every node so matches are reachable, and only
  // keep companies whose subtree contains a match.
  const query = search.trim().toLowerCase();
  const matches = useCallback(
    (name: string) => !query || name.toLowerCase().includes(query),
    [query],
  );

  const visibleCompanies = useMemo(() => {
    if (!query) return companies;
    return companies.filter((c) => {
      if (matches(c.name)) return true;
      const compBranches = branchesByCompany.get(c.public_id) ?? [];
      return compBranches.some((b) => {
        if (matches(b.name)) return true;
        const branchDepts = departmentsByBranch.get(b.public_id) ?? [];
        return branchDepts.some((d) => {
          if (matches(d.name)) return true;
          const deptTeams = teamsByDepartment.get(d.public_id) ?? [];
          return deptTeams.some((t) => matches(t.name));
        });
      });
    });
  }, [companies, query, matches, branchesByCompany, departmentsByBranch, teamsByDepartment]);

  const isCollapsed = (id: string) => !query && collapsed.has(id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization Mapping"
        title="Organization Chart"
        description="A single navigable map of the company hierarchy — organizations, their branches, departments, and teams."
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search organizations, branches, departments, or teams…"
            className="w-full sm:w-96"
          />
          <div className="text-xs text-slate-500">
            <strong>{companies.length}</strong> organizations ·{' '}
            <strong>{branches.length}</strong> branches ·{' '}
            <strong>{departments.length}</strong> departments ·{' '}
            <strong>{teams.length}</strong> teams
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading organization chart…" />
        ) : visibleCompanies.length === 0 ? (
          <EmptyState
            icon="sitemap"
            title="No matches found"
            description={
              search
                ? 'No part of the organization chart matches your search.'
                : 'No organizations exist yet.'
            }
          />
        ) : (
          <div className="p-4 sm:p-6 space-y-3">
            {visibleCompanies.map((company) => {
              const compBranches = (branchesByCompany.get(company.public_id) ?? []).filter(
                (b) =>
                  !query ||
                  matches(company.name) ||
                  matches(b.name) ||
                  (departmentsByBranch.get(b.public_id) ?? []).some(
                    (d) =>
                      matches(d.name) ||
                      (teamsByDepartment.get(d.public_id) ?? []).some((t) => matches(t.name)),
                  ),
              );

              return (
                <div key={company.public_id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <NodeHeader
                    icon="building"
                    iconClass="bg-blue-50 text-blue-700 ring-blue-100"
                    title={company.name}
                    subtitle={company.registration_number ? `Reg #${company.registration_number}` : undefined}
                    count={compBranches.length}
                    countLabel={compBranches.length === 1 ? 'branch' : 'branches'}
                    collapsed={isCollapsed(company.public_id)}
                    onToggle={() => toggle(company.public_id)}
                  />

                  {!isCollapsed(company.public_id) && (
                    <div className="border-t border-slate-100 bg-slate-50/40 p-3 sm:p-4 space-y-3">
                      {compBranches.length === 0 ? (
                        <p className="px-2 py-3 text-center text-[11px] text-slate-400 italic">
                          No branches under this organization.
                        </p>
                      ) : (
                        compBranches.map((branch) => {
                          const branchDepts = (departmentsByBranch.get(branch.public_id) ?? []).filter(
                            (d) =>
                              !query ||
                              matches(company.name) ||
                              matches(branch.name) ||
                              matches(d.name) ||
                              (teamsByDepartment.get(d.public_id) ?? []).some((t) => matches(t.name)),
                          );

                          return (
                            <div
                              key={branch.public_id}
                              className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                            >
                              <NodeHeader
                                icon="briefcase"
                                iconClass="bg-indigo-50 text-indigo-700 ring-indigo-100"
                                title={branch.name}
                                subtitle={
                                  branch.manager_name
                                    ? `Branch Manager: ${branch.manager_name}`
                                    : 'Branch Manager: Unassigned'
                                }
                                count={branchDepts.length}
                                countLabel={branchDepts.length === 1 ? 'department' : 'departments'}
                                collapsed={isCollapsed(branch.public_id)}
                                onToggle={() => toggle(branch.public_id)}
                                compact
                              />

                              {!isCollapsed(branch.public_id) && (
                                <div className="border-t border-slate-100 p-3 space-y-2.5">
                                  {branchDepts.length === 0 ? (
                                    <p className="px-2 py-2 text-center text-[11px] text-slate-400 italic">
                                      No departments under this branch.
                                    </p>
                                  ) : (
                                    branchDepts.map((dept) => {
                                      const deptTeams = (
                                        teamsByDepartment.get(dept.public_id) ?? []
                                      ).filter((t) => !query || matches(dept.name) || matches(t.name) || matches(branch.name) || matches(company.name));

                                      return (
                                        <div
                                          key={dept.public_id}
                                          className="rounded-lg border border-slate-100 bg-slate-50/60 overflow-hidden"
                                        >
                                          <NodeHeader
                                            icon="users"
                                            iconClass="bg-emerald-50 text-emerald-700 ring-emerald-100"
                                            title={dept.name}
                                            subtitle={
                                              dept.head_name
                                                ? `Head: ${dept.head_name}`
                                                : 'Head: Unassigned'
                                            }
                                            count={deptTeams.length}
                                            countLabel={deptTeams.length === 1 ? 'team' : 'teams'}
                                            collapsed={isCollapsed(dept.public_id)}
                                            onToggle={() => toggle(dept.public_id)}
                                            compact
                                          />

                                          {!isCollapsed(dept.public_id) && (
                                            <div className="border-t border-slate-100 p-2.5">
                                              {deptTeams.length === 0 ? (
                                                <p className="px-2 py-1.5 text-center text-[11px] text-slate-400 italic">
                                                  No teams under this department.
                                                </p>
                                              ) : (
                                                <div className="flex flex-wrap gap-2">
                                                  {deptTeams.map((team) => (
                                                    <span
                                                      key={team.public_id}
                                                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200"
                                                    >
                                                      <Icon name="users" size={11} />
                                                      {team.name}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function NodeHeader({
  icon,
  iconClass,
  title,
  subtitle,
  count,
  countLabel,
  collapsed,
  onToggle,
  compact = false,
}: {
  icon: 'building' | 'briefcase' | 'users';
  iconClass: string;
  title: string;
  subtitle?: string;
  count: number;
  countLabel: string;
  collapsed: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-3 px-4 text-left transition hover:bg-slate-50/70 ${
        compact ? 'py-2.5' : 'py-3.5'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`flex shrink-0 items-center justify-center rounded-lg ring-1 ${iconClass} ${
            compact ? 'size-8' : 'size-9'
          }`}
        >
          <Icon name={icon} size={compact ? 14 : 16} />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-slate-900 truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
          {count} {countLabel}
        </span>
        <Icon name="chevron-down" size={14} className={collapsed ? '-rotate-90' : ''} />
      </div>
    </button>
  );
}
