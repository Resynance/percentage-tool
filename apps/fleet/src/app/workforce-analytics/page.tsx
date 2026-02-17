'use client'

import { useEffect, useState } from 'react'
import { useRoleCheck } from '@/hooks/useRoleCheck'
import styles from './page.module.css'

interface WorkerAnalytics {
  email: string
  name: string | null
  totalRecords: number
  taskCount: number
  feedbackCount: number
  totalFlags: number
  activeFlags: number
  earliestRecord: string
  latestRecord: string
  daysSinceFirstRecord: number
  daysSinceLastRecord: number
}

interface WorkerDetails {
  email: string
  name: string | null
  summary: {
    totalRecords: number
    taskCount: number
    feedbackCount: number
  }
  byEnvironment: Array<{
    environment: string
    count: number
    taskCount: number
    feedbackCount: number
  }>
  recentActivity: Array<{
    date: string
    count: number
  }>
  flags: Array<{
    id: string
    flagType: string
    status: string
    reason: string
    createdAt: string
  }>
}

interface AnalyticsSummary {
  totalWorkers: number
  totalRecords: number
  totalTasks: number
  totalFeedback: number
  totalFlags: number
  activeFlags: number
  avgRecordsPerWorker: number
}

interface AnalyticsData {
  summary: AnalyticsSummary
  workers: WorkerAnalytics[]
}

export default function WorkforceAnalyticsPage() {
  const { isAuthorized } = useRoleCheck({
    allowedRoles: ['FLEET', 'ADMIN'],
    redirectOnUnauthorized: '/',
    redirectOnUnauthenticated: '/login'
  })

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWorker, setSelectedWorker] = useState<string>('')
  const [sortBy, setSortBy] = useState<'totalRecords' | 'activeFlags' | 'latest'>('totalRecords')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [detailsWorker, setDetailsWorker] = useState<string | null>(null)
  const [workerDetails, setWorkerDetails] = useState<WorkerDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    fetchAnalytics()
  }, [selectedWorker])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedWorker) params.append('workerEmail', selectedWorker)

      const response = await fetch(`/api/workforce-analytics?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }

      const analyticsData = await response.json()
      setData(analyticsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchWorkerDetails = async (email: string) => {
    try {
      setLoadingDetails(true)
      const response = await fetch(`/api/workforce-analytics/details?email=${encodeURIComponent(email)}`)

      if (!response.ok) {
        throw new Error('Failed to fetch worker details')
      }

      const details = await response.json()
      setWorkerDetails(details)
    } catch (err) {
      console.error('Error fetching worker details:', err)
      alert('Failed to load worker details')
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleWorkerClick = (email: string) => {
    setDetailsWorker(email)
    fetchWorkerDetails(email)
  }

  const closeDetails = () => {
    setDetailsWorker(null)
    setWorkerDetails(null)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  const sortWorkers = (workers: WorkerAnalytics[]) => {
    return [...workers].sort((a, b) => {
      switch (sortBy) {
        case 'totalRecords':
          return b.totalRecords - a.totalRecords
        case 'activeFlags':
          return b.activeFlags - a.activeFlags
        case 'latest':
          return new Date(b.latestRecord).getTime() - new Date(a.latestRecord).getTime()
        default:
          return 0
      }
    })
  }

  const sortWorkersForDropdown = (workers: WorkerAnalytics[]) => {
    return [...workers].sort((a, b) => {
      // Extract last names from the name field or use email
      const getLastName = (worker: WorkerAnalytics) => {
        if (worker.name) {
          const parts = worker.name.split(' ')
          return parts[parts.length - 1] || worker.email
        }
        return worker.email
      }

      const lastNameA = getLastName(a).toLowerCase()
      const lastNameB = getLastName(b).toLowerCase()

      return lastNameA.localeCompare(lastNameB)
    })
  }

  const filterWorkersBySearch = (workers: WorkerAnalytics[]) => {
    if (!searchTerm.trim()) return workers

    const term = searchTerm.toLowerCase()
    return workers.filter(worker =>
      (worker.name && worker.name.toLowerCase().includes(term)) ||
      worker.email.toLowerCase().includes(term)
    )
  }

  if (isAuthorized === null) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Checking permissions...</div>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Workforce Analytics</h1>
        <div className={styles.loading}>Loading analytics...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Workforce Analytics</h1>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  if (!data) return null

  const filteredWorkers = filterWorkersBySearch(data.workers)
  const sortedWorkers = sortWorkers(filteredWorkers)
  const sortedWorkersForDropdown = sortWorkersForDropdown(data.workers)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Workforce Analytics</h1>
        <button onClick={fetchAnalytics} className={styles.refreshButton} disabled={loading}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Stats */}
      <div className={styles.summaryGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Workers</div>
          <div className={styles.statValue}>{data.summary.totalWorkers}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Records</div>
          <div className={styles.statValue}>{data.summary.totalRecords.toLocaleString()}</div>
          <div className={styles.statSubtext}>
            {data.summary.totalTasks.toLocaleString()} tasks, {data.summary.totalFeedback.toLocaleString()} feedback
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Avg per Worker</div>
          <div className={styles.statValue}>{data.summary.avgRecordsPerWorker}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Flags</div>
          <div className={styles.statValue}>{data.summary.activeFlags}</div>
          <div className={styles.statSubtext}>
            {data.summary.totalFlags} total flags
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Search:</label>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Filter by Worker:</label>
          <select
            className={styles.select}
            value={selectedWorker}
            onChange={(e) => setSelectedWorker(e.target.value)}
          >
            <option value="">All Workers</option>
            {sortedWorkersForDropdown.map((worker) => (
              <option key={worker.email} value={worker.email}>
                {worker.name || worker.email}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Sort by:</label>
          <select
            className={styles.select}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="totalRecords">Total Records</option>
            <option value="activeFlags">Active Flags</option>
            <option value="latest">Latest Activity</option>
          </select>
        </div>

        {(selectedWorker || searchTerm) && (
          <>
            <div className={styles.resultCount}>
              Showing {sortedWorkers.length} of {data.workers.length} workers
            </div>
            <button
              className={styles.clearButton}
              onClick={() => {
                setSelectedWorker('')
                setSearchTerm('')
              }}
            >
              Clear Filters
            </button>
          </>
        )}
      </div>

      {/* Worker Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Worker</th>
              <th className={styles.th}>Total Records</th>
              <th className={styles.th}>Tasks</th>
              <th className={styles.th}>Feedback</th>
              <th className={styles.th}>Active Flags</th>
              <th className={styles.th}>Total Flags</th>
              <th className={styles.th}>First Record</th>
              <th className={styles.th}>Latest Activity</th>
              <th className={styles.th}>Days Active</th>
            </tr>
          </thead>
          <tbody>
            {sortedWorkers.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  No worker data found
                </td>
              </tr>
            ) : (
              sortedWorkers.map((worker) => (
                <tr
                  key={worker.email}
                  className={styles.tableRow}
                  onClick={() => handleWorkerClick(worker.email)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className={styles.td}>
                    <div className={styles.workerInfo}>
                      <div className={styles.workerName}>{worker.name || 'Unknown'}</div>
                      <div className={styles.workerEmail}>{worker.email}</div>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.highlight}>{worker.totalRecords.toLocaleString()}</span>
                  </td>
                  <td className={styles.td}>{worker.taskCount.toLocaleString()}</td>
                  <td className={styles.td}>{worker.feedbackCount.toLocaleString()}</td>
                  <td className={styles.td}>
                    {worker.activeFlags > 0 ? (
                      <span className={styles.flagBadge}>{worker.activeFlags}</span>
                    ) : (
                      <span className={styles.noFlags}>0</span>
                    )}
                  </td>
                  <td className={styles.td}>{worker.totalFlags}</td>
                  <td className={styles.td}>
                    <div className={styles.dateInfo}>
                      <div>{formatDate(worker.earliestRecord)}</div>
                      <div className={styles.daysAgo}>{worker.daysSinceFirstRecord}d ago</div>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.dateInfo}>
                      <div>{formatDate(worker.latestRecord)}</div>
                      <div className={styles.daysAgo}>
                        {worker.daysSinceLastRecord === 0 ? 'Today' : `${worker.daysSinceLastRecord}d ago`}
                      </div>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.daysActive}>
                      {worker.daysSinceFirstRecord - worker.daysSinceLastRecord} days
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Worker Details Panel */}
      {detailsWorker && (
        <>
          <div className={styles.overlay} onClick={closeDetails} />
          <div className={styles.detailsPanel}>
            <div className={styles.detailsHeader}>
              <div>
                <h2 className={styles.detailsTitle}>
                  {workerDetails?.name || detailsWorker}
                </h2>
                <p className={styles.detailsEmail}>{detailsWorker}</p>
              </div>
              <button className={styles.closeButton} onClick={closeDetails}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className={styles.detailsContent}>
              {loadingDetails ? (
                <div className={styles.detailsLoading}>Loading details...</div>
              ) : workerDetails ? (
                <>
                  {/* Summary Stats */}
                  <div className={styles.detailsSection}>
                    <h3 className={styles.sectionTitle}>Summary</h3>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailCard}>
                        <div className={styles.detailLabel}>Total Records</div>
                        <div className={styles.detailValue}>{workerDetails.summary.totalRecords}</div>
                      </div>
                      <div className={styles.detailCard}>
                        <div className={styles.detailLabel}>Tasks</div>
                        <div className={styles.detailValue}>{workerDetails.summary.taskCount}</div>
                      </div>
                      <div className={styles.detailCard}>
                        <div className={styles.detailLabel}>Feedback</div>
                        <div className={styles.detailValue}>{workerDetails.summary.feedbackCount}</div>
                      </div>
                    </div>
                  </div>

                  {/* By Environment */}
                  {workerDetails.byEnvironment.length > 0 && (
                    <div className={styles.detailsSection}>
                      <h3 className={styles.sectionTitle}>Records by Environment</h3>
                      <div className={styles.environmentList}>
                        {workerDetails.byEnvironment.map((env) => (
                          <div key={env.environment} className={styles.environmentCard}>
                            <div className={styles.envHeader}>
                              <span className={styles.envName}>{env.environment || 'Unknown'}</span>
                              <span className={styles.envTotal}>{env.count} total</span>
                            </div>
                            <div className={styles.envBreakdown}>
                              <span>{env.taskCount} tasks</span>
                              <span>•</span>
                              <span>{env.feedbackCount} feedback</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity */}
                  {workerDetails.recentActivity.length > 0 && (
                    <div className={styles.detailsSection}>
                      <h3 className={styles.sectionTitle}>Recent Activity (Last 30 Days)</h3>
                      <div className={styles.activityList}>
                        {workerDetails.recentActivity.map((activity) => (
                          <div key={activity.date} className={styles.activityItem}>
                            <span className={styles.activityDate}>{formatDate(activity.date)}</span>
                            <span className={styles.activityCount}>{activity.count} records</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Flags */}
                  {workerDetails.flags.length > 0 && (
                    <div className={styles.detailsSection}>
                      <h3 className={styles.sectionTitle}>Flags ({workerDetails.flags.length})</h3>
                      <div className={styles.flagsList}>
                        {workerDetails.flags.map((flag) => (
                          <div key={flag.id} className={styles.flagCard}>
                            <div className={styles.flagHeader}>
                              <span className={styles.flagType}>{flag.flagType.replace(/_/g, ' ')}</span>
                              <span className={`${styles.flagStatus} ${styles[flag.status.toLowerCase()]}`}>
                                {flag.status}
                              </span>
                            </div>
                            <p className={styles.flagReason}>{flag.reason}</p>
                            <span className={styles.flagDate}>{formatDate(flag.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
