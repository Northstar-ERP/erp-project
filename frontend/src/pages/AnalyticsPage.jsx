
import { useCallback, useEffect, useState } from 'react';
import { client } from '../api/client';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#64748b', '#dc2626'];

const cardConfig = [
  { key: 'employees', title: 'Employees', description: 'Total employees', icon: '👥', accent: 'blue' },
  { key: 'departments', title: 'Departments', description: 'Total departments', icon: '🏢', accent: 'violet' },
  { key: 'projects', title: 'Projects', description: 'Total projects', icon: '📁', accent: 'indigo' },
  { key: 'tasks', title: 'Tasks', description: 'Total tasks', icon: '✓', accent: 'green' },
  { key: 'assets', title: 'Assets', description: 'Total assets', icon: '💻', accent: 'amber' },
];

const accentStyles = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const chartTooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  fontSize: '12px',
};

function Panel({ title, subtitle, children, className = '' }) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ title, value, description, icon, accent }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {(Number(value) || 0).toLocaleString('en-IN')}
          </p>
        </div>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${accentStyles[accent]}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

function EmptyChart({ message = 'No data available yet.' }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 text-center dark:border-gray-700">
      <span className="text-3xl text-gray-300 dark:text-gray-600" aria-hidden="true">
        ◌
      </span>
      <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
        Nothing to display
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {message}
      </p>
    </div>
  );
}

function normalizeStatus(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    status: String(item.status || 'Unknown'),
    total: Math.max(0, Number(item.total) || 0),
  }));
}

function StatusDonut({ title, subtitle, items }) {
  const data = normalizeStatus(items).filter((item) => item.total > 0);
  const total = data.reduce((sum, item) => sum + item.total, 0);

  return (
    <Panel title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <>
          <div className="relative h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="total"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={91}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.map((item, index) => (
                    <Cell
                      key={`${item.status}-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={chartTooltipStyle}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-5">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {total.toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Total records
              </span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function TaskStatusChart({ items }) {
  const data = normalizeStatus(items);

  return (
    <Panel
      title="Tasks by Status"
      subtitle="Number of tasks in each status"
    >
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="#e5e7eb"
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="status"
                width={90}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value) => [value, 'Tasks']}
              />
              <Bar
                dataKey="total"
                name="Tasks"
                fill="#2563eb"
                radius={[0, 6, 6, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function formatMonth(value) {
  if (!value) return 'Unknown';

  // Handle YYYY-MM values consistently without timezone shifts.
  const match = String(value).match(/^(\d{4})-(\d{2})/);

  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    return date.toLocaleDateString('en-IN', {
      month: 'short',
      year: '2-digit',
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
  });
}

function buildMonthlyChart(monthly) {
  const keys = [
    'projects_created',
    'tasks_created',
    'employees_hired',
  ];

  const monthMap = new Map();

  keys.forEach((key) => {
    const items = Array.isArray(monthly?.[key]) ? monthly[key] : [];

    items.forEach((item) => {
      if (!item.month) return;

      const monthKey = String(item.month).slice(0, 7);
      const existing = monthMap.get(monthKey) || {
        monthKey,
        month: formatMonth(item.month),
        projects: 0,
        tasks: 0,
        employees: 0,
      };

      const total = Math.max(0, Number(item.total) || 0);

      if (key === 'projects_created') existing.projects = total;
      if (key === 'tasks_created') existing.tasks = total;
      if (key === 'employees_hired') existing.employees = total;

      monthMap.set(monthKey, existing);
    });
  });

  return [...monthMap.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-12);
}

function MonthlyTrendChart({ data }) {
  return (
    <Panel
      title="Monthly Business Trends"
      subtitle="Projects created, tasks created, and employees hired"
    >
      {data.length === 0 ? (
        <EmptyChart message="Monthly trends will appear when records are available." />
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, left: -15, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: '12px' }}
              />
              <Line
                type="monotone"
                dataKey="projects"
                name="Projects"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="tasks"
                name="Tasks"
                stroke="#16a34a"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="employees"
                name="Employees"
                stroke="#9333ea"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}


function formatCurrency(value) {
  const amount = Number(value) || 0;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}


function MonthlyBreakdown({ title, items }) {
  const rows = Array.isArray(items) ? [...items].slice().reverse() : [];

  return (
    <Panel title={title} subtitle="Monthly record count">
      {rows.length === 0 ? (
        <p className="py-5 text-sm text-gray-500 dark:text-gray-400">
          No monthly data available yet.
        </p>
      ) : (
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {rows.map((item, index) => (
            <div
              key={`${item.month}-${index}`}
              className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-gray-700"
            >
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {formatMonth(item.month)}
              </span>
              <span className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-100">
                {(Number(item.total) || 0).toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}


function MonthlyExpenseBreakdown({ items }) {
  const rows = Array.isArray(items) ? [...items].reverse() : [];

  return (
    <Panel
      title="Monthly Expenses"
      subtitle="Total expense amount by month"
    >
      {rows.length === 0 ? (
        <p className="py-5 text-sm text-gray-500 dark:text-gray-400">
          No monthly expense data available yet.
        </p>
      ) : (
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {rows.map((item, index) => (
            <div
              key={`${item.month}-${index}`}
              className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-gray-700"
            >
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {formatMonth(item.month)}
              </span>
              <span className="text-right text-sm font-semibold text-gray-800 dark:text-gray-100">
                {formatCurrency(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}


export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError('');

    try {
      const response = await client.analytics();
      setSummary(response.data);
    } catch (err) {
      console.error('Failed to load analytics:', err);

      if (err.response?.status === 401 || err.response?.status === 403) {
        setError(
          'You are not authorized to view analytics. Please check your login and permissions.'
        );
      } else {
        setError(
          'Unable to load analytics. Check that the backend server is running, then try again.'
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const totals = summary?.totals || {};
  const monthly = summary?.monthly_analytics || {};
  const expenseTotals = summary?.expense_totals || {};
  const leaveTotals = summary?.leave_totals || {};
  const monthlyChartData = buildMonthlyChart(monthly);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Loading analytics...
          </p>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">
          Analytics unavailable
        </h2>
        <p className="mt-2 text-sm text-red-600 dark:text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => fetchAnalytics()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            REPORTING & INSIGHTS
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            ERP Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Monitor your organization’s employees, departments, projects,
            tasks, and assets in one place.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchAnalytics(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <span aria-hidden="true">{refreshing ? '◌' : '↻'}</span>
          {refreshing ? 'Refreshing...' : 'Refresh data'}
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Refresh failed. The dashboard may be showing previously loaded data.
          {' '}{error}
        </div>
      )}

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Organization overview
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cardConfig.map((card) => (
            <SummaryCard
              key={card.key}
              title={card.title}
              value={totals[card.key]}
              description={card.description}
              icon={card.icon}
              accent={card.accent}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Status overview
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Distribution of records by their current status.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <StatusDonut
            title="Project Status"
            subtitle="Project distribution"
            items={summary?.projects_by_status}
          />
          <TaskStatusChart items={summary?.tasks_by_status} />
          <StatusDonut
            title="Asset Status"
            subtitle="Asset distribution"
            items={summary?.assets_by_status}
          />
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Monthly trends
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Monthly record creation and activity, based on available ERP data.
          </p>
        </div>

        <MonthlyTrendChart data={monthlyChartData} />

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <MonthlyBreakdown
            title="Assets Purchased"
            items={monthly.assets_purchased}
          />
          <MonthlyBreakdown
            title="Asset Allocations"
            items={monthly.asset_allocations}
          />
          <MonthlyBreakdown
            title="Asset History Events"
            items={monthly.asset_history_events}
          />
        </div>
      </section>

      
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Expense Analytics
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Monitor spending, expense status, and monthly costs.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SummaryCard
            title="Total Expenses"
            value={expenseTotals.count ?? 0}
            description="Expense records"
            icon="💳"
            accent="blue"
          />
          <SummaryCard
            title="Total Amount"
            value={formatCurrency(expenseTotals.amount)}
            description="Recorded expense amount"
            icon="₹"
            accent="green"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <StatusDonut
            title="Expenses by Status"
            subtitle="Number of expenses in each status"
            items={summary?.expenses_by_status}
          />

          <Panel
            title="Expenses by Category"
            subtitle="Expense count and total amount"
          >
            {Array.isArray(summary?.expenses_by_category) &&
            summary.expenses_by_category.length > 0 ? (
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {summary.expenses_by_category.map((item, index) => (
                  <div
                    key={`${item["category__name"] || "Uncategorized"}-${index}`}
                    className="border-b border-gray-100 pb-3 last:border-0 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        {item["category__name"] || "Uncategorized"}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {Number(item.total) || 0} expenses
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChart message="No expense category data available yet." />
            )}
          </Panel>

          <MonthlyExpenseBreakdown
            items={monthly.expenses_by_month}
          />
        </div>
      </section>


      
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Leave Analytics
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Review leave requests, leave types, and annual balances.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SummaryCard
            title="Total Leave Requests"
            value={leaveTotals.count ?? 0}
            description="Recorded leave requests"
            icon="📅"
            accent="blue"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <StatusDonut
            title="Leave Requests by Status"
            subtitle="Number of requests in each status"
            items={summary?.leaves_by_status}
          />

          <Panel
            title="Leave Requests by Type"
            subtitle="Request count for each leave type"
          >
            {Array.isArray(summary?.leaves_by_type) &&
            summary.leaves_by_type.length > 0 ? (
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {summary.leaves_by_type.map((item, index) => (
                  <div
                    key={`${item["leave_type__name"] || "Unknown type"}-${index}`}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 dark:border-gray-700"
                  >
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {item["leave_type__name"] || "Unknown type"}
                    </span>
                    <span className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-100">
                      {(Number(item.total) || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChart message="No leave type data available yet." />
            )}
          </Panel>

          <MonthlyBreakdown
            title="Monthly Leave Requests"
            items={monthly.leaves_by_month}
          />
        </div>

        <div className="mt-5">
          <Panel
            title="Annual Leave Balances"
            subtitle="Allocated, used, and carried-forward leave by year"
          >
            {Array.isArray(summary?.leave_balances) &&
            summary.leave_balances.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <th className="px-3 py-3 font-medium">Year</th>
                      <th className="px-3 py-3 font-medium">Allocated</th>
                      <th className="px-3 py-3 font-medium">Used</th>
                      <th className="px-3 py-3 font-medium">Carried Forward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.leave_balances.map((item, index) => (
                      <tr
                        key={`${item.year}-${index}`}
                        className="border-b border-gray-100 last:border-0 dark:border-gray-700"
                      >
                        <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                          {item.year}
                        </td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                          {(Number(item.allocated) || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                          {(Number(item.used) || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-200">
                          {(Number(item.carried_forward) || 0).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyChart message="No annual leave balance data available yet." />
            )}
          </Panel>
        </div>
      </section>



      <p className="border-t border-gray-200 pt-4 text-xs leading-5 text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Analytics reflect records returned by the ERP database. Monthly task
        figures represent tasks created, not tasks completed. Empty charts
        indicate that no matching records are currently available.
      </p>
    </div>
  );
}
