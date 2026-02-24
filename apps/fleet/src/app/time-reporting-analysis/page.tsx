'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { AppSwitcher } from '@repo/ui';

interface Flag {
  id: string;
  workerName: string;
  workerEmail: string;
  workDate: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  flagReason: string;
  actualHours: number;
  expectedHours: number;
  discrepancyPercentage: number;
  averageQualityScore: number;
  meetingHoursVerified: number;
}

interface Summary {
  totalReports: number;
  totalFlags: number;
  flagsBySeverity: Record<string, number>;
  averageDiscrepancy: number;
  averageQuality: number;
}

interface WorkerDetails {
  workerEmail: string;
  workerName: string;
  summary: {
    totalReports: number;
    totalHoursWorked: number;
    totalEstimatedHours: number;
    totalMeetingHoursClaimed: number;
    totalMeetingHoursVerified: number;
    averageQualityScore: number;
    totalFlags: number;
    flagsBySeverity: Record<string, number>;
    flagsByStatus: Record<string, number>;
  };
  timeReports: any[];
}

const SEVERITY_COLORS = {
  LOW: '#00ff88',
  MEDIUM: '#ffaa00',
  HIGH: '#ff6600',
  CRITICAL: '#ff4d4d',
};

export default function TimeReportingAnalysisPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [startDate, setStartDate] = useState('2026-02-01');
  const [endDate, setEndDate] = useState('2026-02-15');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [workerDetails, setWorkerDetails] = useState<WorkerDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (severityFilter !== 'all') params.append('severity', severityFilter);

      const response = await fetch(`/api/time-reporting/flags?${params}`);
      if (response.ok) {
        const data = await response.json();
        setFlags(data.flags || []);
      }
    } catch (error) {
      console.error('Error fetching flags:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, severityFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/time-reporting/analyze?${params}`);
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchFlags();
    fetchSummary();
  }, [fetchFlags, fetchSummary]);

  const runAnalysis = async () => {
    if (!startDate || !endDate) {
      setMessage({ type: 'error', text: 'Please select date range' });
      return;
    }

    setAnalyzing(true);
    setMessage(null);

    try {
      const response = await fetch('/api/time-reporting/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          type: 'success',
          text: `Analysis complete! Analyzed ${data.analyzed} reports, flagged ${data.flagged} workers`,
        });
        fetchFlags();
        fetchSummary();
      } else {
        setMessage({ type: 'error', text: data.error || 'Analysis failed' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Network error' });
    } finally {
      setAnalyzing(false);
    }
  };

  const updateFlagStatus = async (flagId: string, status: string) => {
    try {
      const response = await fetch('/api/time-reporting/flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagId, status }),
      });

      if (response.ok) {
        fetchFlags();
      }
    } catch (error) {
      console.error('Error updating flag:', error);
    }
  };

  const viewWorkerDetails = async (workerEmail: string) => {
    setSelectedWorker(workerEmail);
    setLoadingDetails(true);
    try {
      const params = new URLSearchParams();
      params.append('workerEmail', workerEmail);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(`/api/time-reporting/worker-details?${params}`);
      if (response.ok) {
        const data = await response.json();
        setWorkerDetails(data);
      }
    } catch (error) {
      console.error('Error fetching worker details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeModal = () => {
    setSelectedWorker(null);
    setWorkerDetails(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-main)',
        color: 'var(--text-primary)',
        padding: '40px',
      }}
    >
      <AppSwitcher currentApp="fleet" />

      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        <div style={{ marginBottom: '40px' }}>
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 600,
              marginBottom: '8px',
              background: 'linear-gradient(135deg, var(--accent) 0%, #00d4ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Time Reporting Analysis
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
            Analyze workforce time logs and identify discrepancies
          </p>
        </div>

        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px', marginBottom: '32px' }}>
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Total Reports
              </div>
              <div style={{ fontSize: '32px', fontWeight: 600 }}>{summary.totalReports}</div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Total Flags
              </div>
              <div style={{ fontSize: '32px', fontWeight: 600, color: summary.totalFlags > 0 ? '#ff6600' : 'inherit' }}>
                {summary.totalFlags}
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Avg Discrepancy
              </div>
              <div style={{ fontSize: '32px', fontWeight: 600 }}>
                {summary.averageDiscrepancy.toFixed(1)}%
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Avg Quality
              </div>
              <div style={{ fontSize: '32px', fontWeight: 600 }}>
                {summary.averageQuality.toFixed(1)}/10
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Critical
              </div>
              <div style={{ fontSize: '32px', fontWeight: 600, color: SEVERITY_COLORS.CRITICAL }}>
                {summary.flagsBySeverity.CRITICAL || 0}
              </div>
            </div>
          </div>
        )}

        <div className="glass-card" style={{ padding: '32px', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px' }}>Run Analysis</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="btn-primary"
                style={{ width: '100%', padding: '12px' }}
              >
                {analyzing ? 'Analyzing...' : '▶ Run Analysis'}
              </button>
            </div>

            <div>
              <button onClick={fetchFlags} disabled={loading} className="btn-secondary" style={{ padding: '12px' }}>
                ⟳ Refresh
              </button>
            </div>
          </div>

          {message && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: message.type === 'success' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                border: `1px solid ${message.type === 'success' ? '#00ff88' : '#ff4d4d'}`,
                color: message.type === 'success' ? '#00ff88' : '#ff4d4d',
              }}
            >
              {message.text}
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Flagged Workers</h2>

            <div style={{ display: 'flex', gap: '12px' }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="all">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="RESOLVED">Resolved</option>
                <option value="DISMISSED">Dismissed</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="all">All Severity</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
              Loading flags...
            </p>
          ) : flags.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
              No flags found. Run analysis to identify discrepancies.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Worker</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Date</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Severity</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Discrepancy</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Quality</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Reason</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((flag) => (
                    <tr key={flag.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                      <td style={{ padding: '12px' }}>
                        <div>{flag.workerName}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{flag.workerEmail}</div>
                      </td>
                      <td style={{ padding: '12px' }}>{new Date(flag.workDate).toLocaleDateString()}</td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '13px',
                            fontWeight: 600,
                            backgroundColor: `${SEVERITY_COLORS[flag.severity]}22`,
                            color: SEVERITY_COLORS[flag.severity],
                          }}
                        >
                          {flag.severity}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                        {flag.discrepancyPercentage.toFixed(1)}%
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                        {flag.averageQualityScore.toFixed(1)}/10
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{flag.flagReason}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {flag.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => viewWorkerDetails(flag.workerEmail)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '13px' }}
                          >
                            View Details
                          </button>
                          {flag.status === 'PENDING' && (
                            <button
                              onClick={() => updateFlagStatus(flag.id, 'UNDER_REVIEW')}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '13px' }}
                            >
                              Review
                            </button>
                          )}
                          {flag.status === 'UNDER_REVIEW' && (
                            <button
                              onClick={() => updateFlagStatus(flag.id, 'RESOLVED')}
                              className="btn-primary"
                              style={{ padding: '4px 8px', fontSize: '13px' }}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Worker Detail Modal */}
        {selectedWorker && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '40px',
            }}
            onClick={closeModal}
          >
            <div
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '1200px',
                maxHeight: '90vh',
                overflow: 'auto',
                padding: '32px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 600 }}>Worker Details</h2>
                <button onClick={closeModal} className="btn-secondary" style={{ padding: '8px 16px' }}>
                  ✕ Close
                </button>
              </div>

              {loadingDetails ? (
                <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  Loading worker details...
                </p>
              ) : workerDetails ? (
                <>
                  {/* Worker Summary */}
                  <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                      {workerDetails.workerName}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                      {workerDetails.workerEmail}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Total Reports
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 600 }}>
                          {workerDetails.summary.totalReports}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Hours Worked
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 600 }}>
                          {workerDetails.summary.totalHoursWorked.toFixed(1)}h
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          Est: {workerDetails.summary.totalEstimatedHours.toFixed(1)}h
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Avg Quality
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 600 }}>
                          {workerDetails.summary.averageQualityScore.toFixed(1)}/10
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Total Flags
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 600, color: workerDetails.summary.totalFlags > 0 ? '#ff6600' : 'inherit' }}>
                          {workerDetails.summary.totalFlags}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Meeting Summary */}
                  <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Meeting Summary</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Claimed Hours
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 600 }}>
                          {workerDetails.summary.totalMeetingHoursClaimed.toFixed(1)}h
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Verified Hours
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 600, color: '#00ff88' }}>
                          {workerDetails.summary.totalMeetingHoursVerified.toFixed(1)}h
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Verification Rate
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 600 }}>
                          {workerDetails.summary.totalMeetingHoursClaimed > 0
                            ? ((workerDetails.summary.totalMeetingHoursVerified / workerDetails.summary.totalMeetingHoursClaimed) * 100).toFixed(0)
                            : 0}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Flag Summary */}
                  {workerDetails.summary.totalFlags > 0 && (
                    <div style={{ marginBottom: '32px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Flag Summary</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        {Object.entries(workerDetails.summary.flagsBySeverity).map(([severity, count]) => (
                          <div key={severity} className="glass-card" style={{ padding: '16px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              {severity}
                            </div>
                            <div
                              style={{
                                fontSize: '20px',
                                fontWeight: 600,
                                color: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS],
                              }}
                            >
                              {count}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time Reports Table */}
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Time Reports</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                            <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Date</th>
                            <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Hours</th>
                            <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Estimated</th>
                            <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Meetings</th>
                            <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Quality</th>
                            <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Flags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workerDetails.timeReports.map((report) => (
                            <tr key={report.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                              <td style={{ padding: '12px' }}>
                                {new Date(report.workDate).toLocaleDateString()}
                              </td>
                              <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                                {Number(report.hoursWorked).toFixed(1)}h
                              </td>
                              <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                                {report.estimatedHours.toFixed(1)}h
                              </td>
                              <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                                <div>{report.meetingHoursClaimed.toFixed(1)}h claimed</div>
                                <div style={{ fontSize: '11px', color: '#00ff88' }}>
                                  {report.meetingHoursVerified.toFixed(1)}h verified
                                </div>
                              </td>
                              <td style={{ padding: '12px', fontFamily: 'monospace' }}>
                                {report.averageQualityScore > 0 ? report.averageQualityScore.toFixed(1) : 'N/A'}/10
                              </td>
                              <td style={{ padding: '12px' }}>
                                {report.flags.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {report.flags.map((flag: any) => (
                                      <span
                                        key={flag.id}
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: '3px',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          backgroundColor: `${SEVERITY_COLORS[flag.severity as keyof typeof SEVERITY_COLORS]}22`,
                                          color: SEVERITY_COLORS[flag.severity as keyof typeof SEVERITY_COLORS],
                                        }}
                                      >
                                        {flag.severity}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>None</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
