'use client';

import { useState, useEffect } from 'react';
import { AppSwitcher } from '@repo/ui/components/AppSwitcher';
import Link from 'next/link';

interface WorkerMetrics {
  workerName: string;
  workerEmail: string;
  totalTasks: number;
  totalHours: number;
  avgHoursPerTask: number;
  daysActive: number;
  tasksPerDay: number;
  experienceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  flagStatus: 'NORMAL' | 'FAST' | 'SLOW' | 'INCONSISTENT';
  flagReason: string | null;
  firstReportDate: string;
  lastReportDate: string;
}

interface Summary {
  totalWorkers: number;
  teamAvgAHT: number;
  teamAvgTasksPerDay: number;
  flaggedWorkers: number;
  lowExperience: number;
  mediumExperience: number;
  highExperience: number;
  slowWorkers: number;
  fastWorkers: number;
  inconsistentWorkers: number;
}

const EXPERIENCE_COLORS = {
  LOW: '#ff6600',
  MEDIUM: '#ffa500',
  HIGH: '#00ff88',
};

const FLAG_COLORS = {
  NORMAL: '#00ff88',
  FAST: '#ffa500',
  SLOW: '#ff4d4d',
  INCONSISTENT: '#ff6600',
};

export default function TimeReportingScreeningPage() {
  const [workers, setWorkers] = useState<WorkerMetrics[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');

  // Sorting
  const [sortColumn, setSortColumn] = useState<keyof WorkerMetrics>('avgHoursPerTask');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchScreening();
  }, []);

  const fetchScreening = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (experienceFilter !== 'all') params.append('experienceLevel', experienceFilter);
      if (flagFilter !== 'all') params.append('flagStatus', flagFilter);

      const response = await fetch(`/api/time-reporting/screening?${params.toString()}`);
      const data = await response.json();

      setWorkers(data.workers || []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error('Error fetching screening data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: keyof WorkerMetrics) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedWorkers = [...workers].sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal);
    const bStr = String(bVal);
    return sortDirection === 'asc'
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr);
  });

  const toggleWorkerSelection = (email: string) => {
    const newSelection = new Set(selectedWorkers);
    if (newSelection.has(email)) {
      newSelection.delete(email);
    } else {
      newSelection.add(email);
    }
    setSelectedWorkers(newSelection);
  };

  const selectAllFlagged = () => {
    const flagged = workers.filter(w => w.flagStatus !== 'NORMAL').map(w => w.workerEmail);
    setSelectedWorkers(new Set(flagged));
  };

  const clearSelection = () => {
    setSelectedWorkers(new Set());
  };

  const runDeepAnalysis = () => {
    const emails = Array.from(selectedWorkers);
    if (emails.length === 0) {
      alert('Please select at least one worker for deep analysis');
      return;
    }

    // Navigate to deep analysis page with selected workers
    const emailsParam = encodeURIComponent(emails.join(','));
    window.location.href = `/time-reporting-analysis?workers=${emailsParam}`;
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1800px', margin: '0 auto' }}>
      <AppSwitcher currentApp="fleet" />

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{
            fontSize: '32px',
            fontWeight: 700,
            marginBottom: '8px',
            background: 'linear-gradient(135deg, var(--accent) 0%, #00d4ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Quick Screening
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
          Fast metrics-based analysis to identify workers with unusual patterns. Select workers for{' '}
          <Link href="/time-reporting-analysis" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            Deep Analysis
          </Link>
          .
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Filters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Experience Level
            </label>
            <select
              value={experienceFilter}
              onChange={(e) => setExperienceFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Levels</option>
              <option value="LOW">Low (&lt;50 tasks)</option>
              <option value="MEDIUM">Medium (50-200 tasks)</option>
              <option value="HIGH">High (200+ tasks)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Flag Status
            </label>
            <select
              value={flagFilter}
              onChange={(e) => setFlagFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="NORMAL">Normal</option>
              <option value="SLOW">Slow AHT</option>
              <option value="FAST">Fast AHT</option>
              <option value="INCONSISTENT">Inconsistent</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
          <button onClick={fetchScreening} className="btn-primary">
            Apply Filters
          </button>
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setExperienceFilter('all');
              setFlagFilter('all');
            }}
            className="btn-secondary"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Total Workers
            </div>
            <div style={{ fontSize: '32px', fontWeight: 600 }}>
              {summary.totalWorkers}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Flagged Workers
            </div>
            <div style={{ fontSize: '32px', fontWeight: 600, color: summary.flaggedWorkers > 0 ? '#ff6600' : 'inherit' }}>
              {summary.flaggedWorkers}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              {summary.totalWorkers > 0 ? ((summary.flaggedWorkers / summary.totalWorkers) * 100).toFixed(1) : 0}% of total
            </div>
          </div>

          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Team Avg AHT
            </div>
            <div style={{ fontSize: '32px', fontWeight: 600 }}>
              {summary.teamAvgAHT.toFixed(2)}h
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              Hours per task
            </div>
          </div>

          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Avg Tasks/Day
            </div>
            <div style={{ fontSize: '32px', fontWeight: 600 }}>
              {summary.teamAvgTasksPerDay.toFixed(1)}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Experience Breakdown
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: EXPERIENCE_COLORS.LOW }}>
                  {summary.lowExperience}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Low</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: EXPERIENCE_COLORS.MEDIUM }}>
                  {summary.mediumExperience}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Med</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: EXPERIENCE_COLORS.HIGH }}>
                  {summary.highExperience}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>High</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selection Actions */}
      {selectedWorkers.size > 0 && (
        <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', backgroundColor: 'var(--accent)22' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>
              {selectedWorkers.size} worker{selectedWorkers.size !== 1 ? 's' : ''} selected
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={runDeepAnalysis} className="btn-primary">
                Run Deep Analysis →
              </button>
              <button onClick={clearSelection} className="btn-secondary">
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workers Table */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>
            Worker Metrics {loading && '(Loading...)'}
          </h3>
          <button onClick={selectAllFlagged} className="btn-secondary" style={{ fontSize: '13px' }}>
            Select All Flagged
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
            Loading screening data...
          </p>
        ) : workers.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
            No workers found. Adjust filters or check data availability.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                  <th style={{ padding: '12px', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={selectedWorkers.size === workers.length && workers.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedWorkers(new Set(workers.map(w => w.workerEmail)));
                        } else {
                          setSelectedWorkers(new Set());
                        }
                      }}
                    />
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('workerName')}
                  >
                    Worker {sortColumn === 'workerName' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('totalTasks')}
                  >
                    Total Tasks {sortColumn === 'totalTasks' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('totalHours')}
                  >
                    Total Hours {sortColumn === 'totalHours' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('avgHoursPerTask')}
                  >
                    Avg AHT {sortColumn === 'avgHoursPerTask' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('tasksPerDay')}
                  >
                    Tasks/Day {sortColumn === 'tasksPerDay' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('daysActive')}
                  >
                    Days Active {sortColumn === 'daysActive' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('experienceLevel')}
                  >
                    Experience {sortColumn === 'experienceLevel' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ padding: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    onClick={() => handleSort('flagStatus')}
                  >
                    Status {sortColumn === 'flagStatus' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedWorkers.map((worker) => (
                  <tr key={worker.workerEmail} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedWorkers.has(worker.workerEmail)}
                        onChange={() => toggleWorkerSelection(worker.workerEmail)}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div>{worker.workerName}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{worker.workerEmail}</div>
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                      {worker.totalTasks}
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                      {worker.totalHours.toFixed(1)}h
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 600 }}>
                      {worker.avgHoursPerTask.toFixed(2)}h
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                      {worker.tasksPerDay.toFixed(1)}
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                      {worker.daysActive}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: 600,
                          backgroundColor: `${EXPERIENCE_COLORS[worker.experienceLevel]}22`,
                          color: EXPERIENCE_COLORS[worker.experienceLevel],
                        }}
                      >
                        {worker.experienceLevel}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: 600,
                          backgroundColor: `${FLAG_COLORS[worker.flagStatus]}22`,
                          color: FLAG_COLORS[worker.flagStatus],
                        }}
                      >
                        {worker.flagStatus}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {worker.flagReason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
