'use client';

import React, { useState, useEffect } from 'react';

interface Job {
  id: string;
  status: string;
  totalPrompts: number;
  analyzedPrompts: number;
  failedPrompts: number;
  flaggedNonNative: number;
  flaggedAIGenerated: number;
  totalCost: number;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  pausedAt?: string;
}

interface PromptResult {
  id: string;
  versionId: string;
  taskKey: string;
  prompt: string;
  createdByName?: string;
  createdByEmail?: string;
  isLikelyNonNative?: boolean;
  nonNativeConfidence?: number;
  nonNativeIndicators?: string[];
  isLikelyAIGenerated?: boolean;
  aiGeneratedConfidence?: number;
  aiGeneratedIndicators?: string[];
  overallAssessment?: string;
  recommendations?: string[];
  analyzedAt?: string;
}

export default function PromptAuthenticityPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'analyze' | 'results'>('import');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recordLimit, setRecordLimit] = useState<string>('');

  const [results, setResults] = useState<PromptResult[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPagination, setResultsPagination] = useState<any>(null);
  const [resultsFilter, setResultsFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [expandedPromptTexts, setExpandedPromptTexts] = useState<Set<string>>(new Set());
  const [tableStats, setTableStats] = useState<any>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [jobHistory, setJobHistory] = useState<Job[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [jobFailures, setJobFailures] = useState<Record<string, any[]>>({});

  const toggleJobExpanded = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
        // Fetch failures if not already loaded
        if (!jobFailures[jobId]) {
          fetchFailures();
        }
      }
      return next;
    });
  };

  const fetchFailures = async () => {
    try {
      const response = await fetch('/api/prompt-authenticity/failures');
      const data = await response.json();
      if (data.failures) {
        setJobFailures({ all: data.failures });
      }
    } catch (error) {
      console.error('Failed to fetch failures:', error);
    }
  };

  // Fetch job history
  const fetchJobHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('/api/prompt-authenticity/analyze');
      const data = await response.json();
      if (data.jobs) {
        setJobHistory(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch job history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load job history on mount and when currentJob completes
  useEffect(() => {
    fetchJobHistory();
  }, []);

  useEffect(() => {
    if (currentJob?.status === 'COMPLETED' || currentJob?.status === 'FAILED' || currentJob?.status === 'CANCELLED') {
      fetchJobHistory();
    }
  }, [currentJob?.status]);

  // Poll job status
  useEffect(() => {
    if (currentJob && (currentJob.status === 'RUNNING' || currentJob.status === 'PENDING')) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/prompt-authenticity/analyze?jobId=${currentJob.id}`);
          const data = await response.json();
          setCurrentJob(data);

          if (data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'CANCELLED') {
            clearInterval(interval);
          }
        } catch (error) {
          console.error('Poll error:', error);
        }
      }, 2000);
      setPollingInterval(interval);

      return () => clearInterval(interval);
    }
  }, [currentJob?.id, currentJob?.status]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setImportMessage(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setImportMessage({ type: 'error', text: 'Please select a CSV file' });
      return;
    }

    setImporting(true);
    setImportMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/prompt-authenticity/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Log debug info to console
        if (data.debug) {
          console.log('[Import Debug Info]', data.debug);
        }
        setImportMessage({
          type: 'success',
          text: data.message + (data.debug ? ` (Check console for debug info)` : ''),
        });
        setFile(null);
      } else {
        setImportMessage({ type: 'error', text: data.error || 'Import failed' });
      }
    } catch (error: any) {
      setImportMessage({ type: 'error', text: error.message || 'Network error' });
    } finally {
      setImporting(false);
    }
  };

  const startAnalysis = async () => {
    try {
      const payload: any = { batchSize: 25 };
      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;
      if (recordLimit) payload.limit = parseInt(recordLimit);

      const response = await fetch('/api/prompt-authenticity/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentJob(data);
        setActiveTab('analyze');
      } else {
        alert(data.error || 'Failed to start analysis');
      }
    } catch (error: any) {
      alert(error.message || 'Network error');
    }
  };

  const controlJob = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!currentJob) return;

    try {
      const response = await fetch('/api/prompt-authenticity/analyze', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJob.id, action }),
      });

      if (response.ok) {
        const updatedResponse = await fetch(`/api/prompt-authenticity/analyze?jobId=${currentJob.id}`);
        const data = await updatedResponse.json();
        setCurrentJob(data);
      }
    } catch (error) {
      console.error('Control job error:', error);
    }
  };

  const loadResults = async () => {
    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const response = await fetch(`/api/prompt-authenticity/results?page=${resultsPage}&limit=50&filter=${resultsFilter}${searchParam}`);
      const data = await response.json();

      if (response.ok) {
        setResults(data.results);
        setStats(data.stats);
        setResultsPagination(data.pagination);
      }
    } catch (error) {
      console.error('Load results error:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'results') {
      loadResults();
    }
  }, [activeTab, resultsPage, resultsFilter, searchQuery]);

  const toggleExpanded = (promptId: string) => {
    const newExpanded = new Set(expandedPrompts);
    if (newExpanded.has(promptId)) {
      newExpanded.delete(promptId);
    } else {
      newExpanded.add(promptId);
    }
    setExpandedPrompts(newExpanded);
  };

  const togglePromptText = (promptId: string) => {
    const newExpanded = new Set(expandedPromptTexts);
    if (newExpanded.has(promptId)) {
      newExpanded.delete(promptId);
    } else {
      newExpanded.add(promptId);
    }
    setExpandedPromptTexts(newExpanded);
  };

  const formatDuration = (job: Job) => {
    if (!job.startedAt) return '-';

    const start = new Date(job.startedAt).getTime();
    let end: number;

    if (job.status === 'COMPLETED' && job.completedAt) {
      end = new Date(job.completedAt).getTime();
    } else if (job.status === 'CANCELLED' && job.cancelledAt) {
      end = new Date(job.cancelledAt).getTime();
    } else if (job.status === 'PAUSED' && job.pausedAt) {
      end = new Date(job.pausedAt).getTime();
    } else if (job.status === 'RUNNING') {
      end = Date.now();
    } else {
      return '-';
    }

    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const loadTableStats = async () => {
    try {
      const response = await fetch('/api/prompt-authenticity/clear');
      if (response.ok) {
        const data = await response.json();
        setTableStats(data);
      }
    } catch (error) {
      console.error('Load stats error:', error);
    }
  };

  const clearAllData = async () => {
    if (clearConfirmText !== 'DELETE ALL DATA') {
      alert('Please type "DELETE ALL DATA" to confirm');
      return;
    }

    setClearing(true);
    try {
      const response = await fetch('/api/prompt-authenticity/clear', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText: clearConfirmText }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Successfully deleted ${data.recordsDeleted} prompts and ${data.jobsDeleted} jobs`);
        setShowClearConfirm(false);
        setClearConfirmText('');
        loadTableStats();
      } else {
        alert(data.error || 'Failed to clear data');
      }
    } catch (error: any) {
      alert(error.message || 'Network error');
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'import') {
      loadTableStats();
    }
  }, [activeTab]);

  return (
    <div style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
          🔍 Prompt Authenticity Checker
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
          Analyze prompts to detect non-native speaker patterns and AI-generated content
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '2px solid var(--border-primary)' }}>
        {(['import', 'analyze', 'results'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: 'pointer',
              fontSize: '16px',
              marginBottom: '-2px',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Import Tab */}
      {activeTab === 'import' && (
        <div className="glass-card" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Import CSV File</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
            Import your CSV file (73 MB, ~6.5M prompts). This will load the data into the database for analysis.
          </p>

          {importMessage && (
            <div
              style={{
                padding: '16px 24px',
                marginBottom: '24px',
                borderRadius: '8px',
                backgroundColor: importMessage.type === 'success' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                border: `1px solid ${importMessage.type === 'success' ? '#00ff88' : '#ff4d4d'}`,
                color: importMessage.type === 'success' ? '#00ff88' : '#ff4d4d',
              }}
            >
              {importMessage.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={handleImport}
              disabled={importing || !file}
              className="btn-primary"
              style={{ padding: '12px 24px', whiteSpace: 'nowrap' }}
            >
              {importing ? '⏳ Importing...' : '📥 Import CSV'}
            </button>
          </div>

          <div style={{ marginTop: '32px', padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              <strong>Expected CSV Format:</strong>
            </p>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
version_id, task_key, prompt, version_no, is_active, created_by_name, created_by_email, created_at, ...
            </pre>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
              Import is fast (~30-60 seconds for 6.5M rows). After import, go to the Analyze tab to start AI analysis.
            </p>
          </div>

          {/* Database Stats */}
          {tableStats && (
            <div style={{ marginTop: '32px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Database Statistics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Records</div>
                  <div style={{ fontSize: '24px', fontWeight: 600 }}>{tableStats.totalRecords.toLocaleString()}</div>
                </div>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pending</div>
                  <div style={{ fontSize: '24px', fontWeight: 600, color: '#ff6600' }}>{tableStats.pendingRecords.toLocaleString()}</div>
                </div>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Completed</div>
                  <div style={{ fontSize: '24px', fontWeight: 600, color: '#00ff88' }}>{tableStats.completedRecords.toLocaleString()}</div>
                </div>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Jobs</div>
                  <div style={{ fontSize: '24px', fontWeight: 600 }}>{tableStats.totalJobs}</div>
                </div>
              </div>
            </div>
          )}

          {/* Danger Zone */}
          {tableStats && tableStats.totalRecords > 0 && (
            <div style={{ marginTop: '32px', padding: '24px', border: '2px solid #ff4d4d', borderRadius: '8px', backgroundColor: 'rgba(255, 77, 77, 0.05)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#ff4d4d' }}>⚠️ Danger Zone</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Clear all imported prompts and analysis jobs. This action cannot be undone.
              </p>

              {!showClearConfirm ? (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#ff4d4d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#ff6666')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ff4d4d')}
                >
                  Clear All Data
                </button>
              ) : (
                <div>
                  <p style={{ fontSize: '13px', color: '#ff4d4d', marginBottom: '12px', fontWeight: 600 }}>
                    Type "DELETE ALL DATA" to confirm:
                  </p>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={clearConfirmText}
                      onChange={(e) => setClearConfirmText(e.target.value)}
                      placeholder="DELETE ALL DATA"
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '2px solid #ff4d4d',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                      }}
                    />
                    <button
                      onClick={clearAllData}
                      disabled={clearing || clearConfirmText !== 'DELETE ALL DATA'}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: clearing ? '#666' : '#ff4d4d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: clearing ? 'not-allowed' : 'pointer',
                        opacity: clearConfirmText !== 'DELETE ALL DATA' ? 0.5 : 1,
                      }}
                    >
                      {clearing ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button
                      onClick={() => {
                        setShowClearConfirm(false);
                        setClearConfirmText('');
                      }}
                      className="btn-secondary"
                      style={{ padding: '10px 20px' }}
                    >
                      Cancel
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                    This will delete {tableStats.totalRecords.toLocaleString()} prompts and {tableStats.totalJobs} jobs.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Analyze Tab */}
      {activeTab === 'analyze' && (
        <div className="glass-card" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Start Analysis Job</h2>

          {!currentJob && (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                Start analyzing prompts in batches. Processing happens in the background and can be paused/resumed.
              </p>

              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
                  Date Range Filter (Optional)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
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
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px',
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
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                  Leave blank to analyze all pending prompts. Use date range to target specific time periods.
                </p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
                  Record Limit (Optional - For Testing)
                </h3>
                <div style={{ maxWidth: '300px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Max Records to Analyze
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Leave blank for all"
                    value={recordLimit}
                    onChange={(e) => setRecordLimit(e.target.value)}
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
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                  Useful for testing. Leave blank to analyze all matching records.
                </p>
              </div>

              <button
                onClick={startAnalysis}
                className="btn-primary"
                style={{ padding: '12px 24px' }}
              >
                🚀 Start Analysis Job
              </button>
            </div>
          )}

          {currentJob && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status</div>
                  <div style={{ fontSize: '20px', fontWeight: 600 }}>{currentJob.status}</div>
                </div>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Progress</div>
                  <div style={{ fontSize: '20px', fontWeight: 600 }}>
                    {currentJob.analyzedPrompts}/{currentJob.totalPrompts}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {((currentJob.analyzedPrompts / currentJob.totalPrompts) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Cost</div>
                  <div style={{ fontSize: '20px', fontWeight: 600 }}>${Number(currentJob.totalCost ?? 0).toFixed(4)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Non-Native</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: '#ff6600' }}>{currentJob.flaggedNonNative}</div>
                </div>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>AI-Generated</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: '#ff4d4d' }}>{currentJob.flaggedAIGenerated}</div>
                </div>
                <div className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Failed</div>
                  <div style={{ fontSize: '20px', fontWeight: 600 }}>{currentJob.failedPrompts}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                {currentJob.status === 'RUNNING' && (
                  <>
                    <button
                      onClick={() => controlJob('pause')}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: 600,
                        backgroundColor: '#ff9800',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      ⏸️ Pause
                    </button>
                    <button
                      onClick={() => controlJob('cancel')}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: 600,
                        backgroundColor: '#ff4d4d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      ❌ Cancel
                    </button>
                  </>
                )}
                {currentJob.status === 'PAUSED' && (
                  <>
                    <button
                      onClick={() => controlJob('resume')}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: 600,
                        backgroundColor: '#00c853',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      ▶️ Resume
                    </button>
                    <button
                      onClick={() => controlJob('cancel')}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: 600,
                        backgroundColor: '#ff4d4d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      ❌ Cancel
                    </button>
                  </>
                )}
                {(currentJob.status === 'COMPLETED' || currentJob.status === 'FAILED' || currentJob.status === 'CANCELLED') && (
                  <button
                    onClick={() => {
                      setCurrentJob(null);
                      setStartDate('');
                      setEndDate('');
                      setRecordLimit('');
                    }}
                    className="btn-primary"
                  >
                    ➕ Create New Analysis Job
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Job History */}
          <div style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Job History</h3>
              <button
                onClick={fetchJobHistory}
                style={{
                  padding: '8px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loadingHistory ? 'not-allowed' : 'pointer',
                  opacity: loadingHistory ? 0.6 : 1,
                }}
                disabled={loadingHistory}
              >
                {loadingHistory ? '↻ Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {jobHistory.length === 0 ? (
              <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No jobs found
              </div>
            ) : (
              <div className="glass-card" style={{ padding: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Job ID</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Progress</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Non-Native</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>AI-Generated</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Failed</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Cost</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Started</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Duration</th>
                      <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobHistory.map((job) => (
                      <React.Fragment key={job.id}>
                        <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                          <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '11px' }}>
                            {job.id.substring(0, 8)}...
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span
                              style={{
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor:
                                  job.status === 'COMPLETED' ? 'rgba(0, 255, 136, 0.1)' :
                                  job.status === 'RUNNING' ? 'rgba(0, 150, 255, 0.1)' :
                                  job.status === 'FAILED' ? 'rgba(255, 77, 77, 0.2)' :
                                  job.status === 'PAUSED' ? 'rgba(255, 200, 0, 0.2)' :
                                  'rgba(255, 255, 255, 0.1)',
                                color:
                                  job.status === 'COMPLETED' ? '#00ff88' :
                                  job.status === 'RUNNING' ? '#0096ff' :
                                  job.status === 'FAILED' ? '#ff4d4d' :
                                  job.status === 'PAUSED' ? '#ffc800' :
                                  'var(--text-secondary)',
                              }}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>
                              {job.analyzedPrompts}/{job.totalPrompts}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              {((job.analyzedPrompts / job.totalPrompts) * 100).toFixed(1)}%
                            </div>
                          </td>
                          <td style={{ padding: '12px', color: '#ff6600', fontWeight: 600 }}>{job.flaggedNonNative || 0}</td>
                          <td style={{ padding: '12px', color: '#ff4d4d', fontWeight: 600 }}>{job.flaggedAIGenerated || 0}</td>
                          <td style={{ padding: '12px' }}>
                            {job.failedPrompts > 0 ? (
                              <button
                                onClick={() => toggleJobExpanded(job.id)}
                                style={{
                                  color: '#ff4d4d',
                                  fontWeight: 600,
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                }}
                              >
                                {job.failedPrompts}
                              </button>
                            ) : (
                              <span>{job.failedPrompts || 0}</span>
                            )}
                          </td>
                          <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
                            ${Number(job.totalCost ?? 0).toFixed(4)}
                          </td>
                          <td style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {job.startedAt ? new Date(job.startedAt).toLocaleString() : '-'}
                          </td>
                          <td style={{ padding: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatDuration(job)}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {job.status === 'RUNNING' && (
                                <button
                                  onClick={async () => {
                                    if (confirm('Stop this analysis job?')) {
                                      try {
                                        await fetch('/api/prompt-authenticity/analyze', {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ jobId: job.id, action: 'cancel' }),
                                        });
                                        await fetchJobHistory();
                                      } catch (error) {
                                        console.error('Failed to stop job:', error);
                                      }
                                    }
                                  }}
                                  style={{
                                    padding: '6px 16px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    backgroundColor: '#ff4d4d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Stop
                                </button>
                              )}
                              {(job.status === 'RUNNING' || job.status === 'PAUSED') && (
                                <button
                                  onClick={() => {
                                    setCurrentJob(job);
                                    // Scroll to top of page to see the job details
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  style={{
                                    padding: '6px 16px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    backgroundColor: 'var(--accent)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  View
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedJobs.has(job.id) && (
                          <tr>
                            <td colSpan={9} style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
                              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#ff4d4d' }}>
                                Failed Records ({jobFailures.all?.length || 0} total failures)
                              </h4>
                              {jobFailures.all && jobFailures.all.length > 0 ? (
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)' }}>Version ID</th>
                                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)' }}>Task Key</th>
                                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)' }}>Error</th>
                                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-secondary)' }}>Prompt (first 100 chars)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {jobFailures.all.map((failure: any) => (
                                        <tr key={failure.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                                          <td style={{ padding: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
                                            {failure.versionId.substring(0, 20)}...
                                          </td>
                                          <td style={{ padding: '8px', fontSize: '11px' }}>{failure.taskKey}</td>
                                          <td style={{ padding: '8px', fontSize: '11px', color: '#ff4d4d' }}>{failure.errorMessage}</td>
                                          <td style={{ padding: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                            {failure.prompt.substring(0, 100)}...
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No failure details available</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <div>
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div className="glass-card" style={{ padding: '24px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Analyzed</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--accent)' }}>{stats.totalAnalyzed}</div>
              </div>
              <div className="glass-card" style={{ padding: '24px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Non-Native</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#ff6600' }}>{stats.flaggedNonNative}</div>
              </div>
              <div className="glass-card" style={{ padding: '24px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>AI-Generated</div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#ff4d4d' }}>{stats.flaggedAIGenerated}</div>
              </div>
            </div>
          )}

          <div className="glass-card" style={{ padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Analysis Results</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setResultsPage(1); }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    width: '250px',
                  }}
                />
                <select
                  value={resultsFilter}
                  onChange={(e) => { setResultsFilter(e.target.value); setResultsPage(1); }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="all">All Results</option>
                  <option value="completed">Completed</option>
                  <option value="flagged">Flagged (Any)</option>
                  <option value="non-native">Non-Native Only</option>
                  <option value="ai-generated">AI-Generated Only</option>
                </select>
                <a
                  href={`/api/prompt-authenticity/export?filter=${resultsFilter}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`}
                  download
                  className="btn-secondary"
                  style={{ padding: '8px 16px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  📥 Export to CSV
                </a>
              </div>
            </div>

            {results.length > 0 ? (
              <>
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
                        <th style={{ padding: '12px', color: 'var(--text-secondary)', width: '200px' }}>Version ID</th>
                        <th style={{ padding: '12px', color: 'var(--text-secondary)', width: '150px' }}>Author</th>
                        <th style={{ padding: '12px', color: 'var(--text-secondary)', width: '180px' }}>Email</th>
                        <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Prompt</th>
                        <th style={{ padding: '12px', color: 'var(--text-secondary)', width: '120px' }}>Non-Native</th>
                        <th style={{ padding: '12px', color: 'var(--text-secondary)', width: '120px' }}>AI Generated</th>
                        <th style={{ padding: '12px', color: 'var(--text-secondary)', width: '80px' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result) => (
                        <React.Fragment key={result.id}>
                          <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                            <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '11px' }}>
                              {result.versionId.substring(0, 20)}...
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              {result.createdByName || '-'}
                            </td>
                            <td style={{ padding: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {result.createdByEmail || '-'}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <div
                                onClick={() => togglePromptText(result.id)}
                                style={{
                                  maxWidth: '400px',
                                  overflow: 'hidden',
                                  textOverflow: expandedPromptTexts.has(result.id) ? 'clip' : 'ellipsis',
                                  whiteSpace: expandedPromptTexts.has(result.id) ? 'pre-wrap' : 'nowrap',
                                  cursor: 'pointer',
                                  color: 'var(--text-primary)',
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = 'var(--text-primary)';
                                }}
                              >
                                {result.prompt}
                                <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                  {expandedPromptTexts.has(result.id) ? '▲' : '▼'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px' }}>
                              {result.isLikelyNonNative !== undefined && (
                                <div
                                  style={{
                                    display: 'inline-block',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    backgroundColor: result.isLikelyNonNative ? 'rgba(255, 102, 0, 0.2)' : 'rgba(0, 255, 136, 0.1)',
                                    color: result.isLikelyNonNative ? '#ff6600' : '#00ff88',
                                  }}
                                >
                                  {result.isLikelyNonNative ? 'Yes' : 'No'} ({result.nonNativeConfidence}%)
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {result.isLikelyAIGenerated !== undefined && (
                                <div
                                  style={{
                                    display: 'inline-block',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    backgroundColor: result.isLikelyAIGenerated ? 'rgba(255, 77, 77, 0.2)' : 'rgba(0, 255, 136, 0.1)',
                                    color: result.isLikelyAIGenerated ? '#ff4d4d' : '#00ff88',
                                  }}
                                >
                                  {result.isLikelyAIGenerated ? 'Yes' : 'No'} ({result.aiGeneratedConfidence}%)
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <button
                                onClick={() => toggleExpanded(result.id)}
                                style={{
                                  padding: '8px 16px',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  backgroundColor: 'var(--accent)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                {expandedPrompts.has(result.id) ? '▼' : '▶'} Details
                              </button>
                            </td>
                          </tr>
                          {expandedPrompts.has(result.id) && (
                            <tr key={`${result.id}-details`}>
                              <td colSpan={5} style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
                                <div style={{ display: 'grid', gap: '16px' }}>
                                  <div>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Full Prompt:</h4>
                                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                                      {result.prompt}
                                    </div>
                                  </div>
                                  {result.nonNativeIndicators && result.nonNativeIndicators.length > 0 && (
                                    <div>
                                      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#ff6600' }}>
                                        Non-Native Indicators:
                                      </h4>
                                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                        {result.nonNativeIndicators.map((ind, i) => (
                                          <li key={i} style={{ marginBottom: '4px', fontSize: '13px' }}>{ind}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {result.aiGeneratedIndicators && result.aiGeneratedIndicators.length > 0 && (
                                    <div>
                                      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#ff4d4d' }}>
                                        AI-Generated Indicators:
                                      </h4>
                                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                        {result.aiGeneratedIndicators.map((ind, i) => (
                                          <li key={i} style={{ marginBottom: '4px', fontSize: '13px' }}>{ind}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {result.overallAssessment && (
                                    <div>
                                      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Assessment:</h4>
                                      <p style={{ margin: 0, fontSize: '13px' }}>{result.overallAssessment}</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {resultsPagination && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                    <button
                      onClick={() => setResultsPage(1)}
                      disabled={resultsPage === 1}
                      className="btn-secondary"
                      style={{ padding: '8px 12px' }}
                    >
                      First
                    </button>
                    <button
                      onClick={() => setResultsPage(p => p - 1)}
                      disabled={resultsPage === 1}
                      className="btn-secondary"
                      style={{ padding: '8px 12px' }}
                    >
                      Previous
                    </button>
                    <span style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                      Page {resultsPage} of {resultsPagination.pages}
                    </span>
                    <button
                      onClick={() => setResultsPage(p => p + 1)}
                      disabled={resultsPage === resultsPagination.pages}
                      className="btn-secondary"
                      style={{ padding: '8px 12px' }}
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setResultsPage(resultsPagination.pages)}
                      disabled={resultsPage === resultsPagination.pages}
                      className="btn-secondary"
                      style={{ padding: '8px 12px' }}
                    >
                      Last
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
                No results found. Run analysis first.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
