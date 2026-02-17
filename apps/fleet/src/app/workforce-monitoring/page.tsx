'use client'

import { useEffect, useState, Fragment } from 'react'
import { useRoleCheck } from '@/hooks/useRoleCheck'
import { getStatusPriority, getStatusLabel, getStatusColor, getFlagTypeLabel, getFlagTypeColor } from '@/lib/worker-flags'
import styles from './page.module.css'

interface WorkerFlag {
  id: string
  workerId: string
  workerEmail: string
  flagType: string
  status: string
  reason: string
  detailedNotes: string | null
  flaggedById: string
  flaggedByEmail: string
  resolutionNotes: string | null
  resolvedById: string | null
  resolvedByEmail: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  displayName?: string
}

export default function WorkforceMonitoringPage() {
  const { isAuthorized } = useRoleCheck({
    allowedRoles: ['FLEET', 'ADMIN'],
    redirectOnUnauthorized: '/',
    redirectOnUnauthenticated: '/login'
  })

  const [flags, setFlags] = useState<WorkerFlag[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [selectedFlag, setSelectedFlag] = useState<WorkerFlag | null>(null)

  // Filter states
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  // Form states
  const [formData, setFormData] = useState({
    workerId: '',
    workerEmail: '',
    flagType: 'QUALITY_ISSUE',
    reason: '',
    detailedNotes: '',
  })
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchFlags()
    fetchUsers()
  }, [statusFilter, typeFilter])

  const fetchFlags = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (typeFilter) params.append('flagType', typeFilter)

      const response = await fetch(`/api/worker-flags?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch worker flags')
      }

      const data = await response.json()
      setFlags(data.workerFlags || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users')
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await response.json()
      setUsers(data.users || [])
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const createFlag = async () => {
    if (!formData.workerId || !formData.reason) {
      alert('Please fill in all required fields')
      return
    }

    try {
      setSaving(true)
      const response = await fetch('/api/worker-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create flag')
      }

      // Reset form and close modal
      setFormData({
        workerId: '',
        workerEmail: '',
        flagType: 'QUALITY_ISSUE',
        reason: '',
        detailedNotes: '',
      })
      setShowCreateModal(false)

      // Refresh flags
      await fetchFlags()

      alert('Worker flag created successfully')
    } catch (err) {
      console.error('Error creating flag:', err)
      alert(err instanceof Error ? err.message : 'Failed to create flag')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch('/api/worker-flags', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, status }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update status')
      }

      await fetchFlags()
    } catch (err) {
      console.error('Error updating status:', err)
      alert(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const resolveFlag = async () => {
    if (!selectedFlag || !resolutionNotes) {
      alert('Please enter resolution notes')
      return
    }

    try {
      setSaving(true)
      const response = await fetch('/api/worker-flags', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedFlag.id,
          status: 'RESOLVED',
          resolutionNotes,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to resolve flag')
      }

      setResolutionNotes('')
      setSelectedFlag(null)
      setShowResolveModal(false)
      await fetchFlags()

      alert('Flag resolved successfully')
    } catch (err) {
      console.error('Error resolving flag:', err)
      alert(err instanceof Error ? err.message : 'Failed to resolve flag')
    } finally {
      setSaving(false)
    }
  }

  const handleWorkerSelect = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (user) {
      setFormData({
        ...formData,
        workerId: userId,
        workerEmail: user.email,
      })
    }
  }

  const clearFilters = () => {
    setStatusFilter('')
    setTypeFilter('')
  }

  if (isAuthorized === null) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Checking permissions...</div>
      </div>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  if (loading && flags.length === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Worker Flags</h1>
        <div className={styles.loading}>Loading worker flags...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Worker Flags</h1>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Worker Flags</h1>
        <div className={styles.headerActions}>
          <button onClick={() => setShowFilters(!showFilters)} className={styles.filterButton}>
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
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            Filters
          </button>
          <button onClick={fetchFlags} className={styles.refreshButton}>
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
            Refresh
          </button>
          <button onClick={() => setShowCreateModal(true)} className={styles.createButton}>
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
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Flag Worker
          </button>
        </div>
      </div>

      {showFilters && (
        <div className={styles.filtersPanel}>
          <div className={styles.filterRow}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Status:</label>
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="APPEALED">Appealed</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Type:</label>
              <select
                className={styles.filterSelect}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="QUALITY_ISSUE">Quality Issue</option>
                <option value="POLICY_VIOLATION">Policy Violation</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="COMMUNICATION">Communication</option>
                <option value="PERFORMANCE">Performance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            {(statusFilter || typeFilter) && (
              <button onClick={clearFilters} className={styles.clearFiltersButton}>
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {flags.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No worker flags found.</p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Worker</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Flagged By</th>
                <th className={styles.th}>Date</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <Fragment key={flag.id}>
                  <tr
                    className={`${styles.tableRow} ${expandedId === flag.id ? styles.expandedRow : ''}`}
                    onClick={() => setExpandedId(expandedId === flag.id ? null : flag.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setExpandedId(expandedId === flag.id ? null : flag.id)
                      }
                    }}
                  >
                    <td className={styles.td}>
                      <span className={styles.workerEmail}>{flag.workerEmail}</span>
                    </td>
                    <td className={styles.td}>
                      <div
                        className={styles.typeBadge}
                        style={{ backgroundColor: getFlagTypeColor(flag.flagType) + '20', color: getFlagTypeColor(flag.flagType) }}
                      >
                        {getFlagTypeLabel(flag.flagType)}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div
                        className={styles.statusBadge}
                        style={{ backgroundColor: getStatusColor(flag.status) + '20', color: getStatusColor(flag.status) }}
                      >
                        {getStatusLabel(flag.status)}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.userEmail}>{flag.flaggedByEmail}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.date}>{formatDate(flag.createdAt)}</span>
                    </td>
                    <td className={styles.td}>
                      <svg
                        className={`${styles.expandIcon} ${expandedId === flag.id ? styles.expandIconRotated : ''}`}
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </td>
                  </tr>
                  {expandedId === flag.id && (
                    <tr key={`${flag.id}-details`} className={styles.detailsRow}>
                      <td colSpan={6} className={styles.detailsCell}>
                        <div className={styles.detailsContent}>
                          <div className={styles.detailsSection}>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>Reason:</span>
                              <p className={styles.description}>{flag.reason}</p>
                            </div>

                            {flag.detailedNotes && (
                              <div className={styles.field}>
                                <span className={styles.fieldLabel}>Detailed Notes:</span>
                                <p className={styles.description}>{flag.detailedNotes}</p>
                              </div>
                            )}

                            {flag.status === 'RESOLVED' && flag.resolutionNotes && (
                              <div className={styles.field}>
                                <span className={styles.fieldLabel}>Resolution Notes:</span>
                                <p className={styles.description}>{flag.resolutionNotes}</p>
                              </div>
                            )}

                            {flag.resolvedByEmail && (
                              <div className={styles.field}>
                                <span className={styles.fieldLabel}>Resolved By:</span>
                                <span className={styles.fieldValue}>{flag.resolvedByEmail}</span>
                                {flag.resolvedAt && (
                                  <span className={styles.fieldValue}> on {formatDate(flag.resolvedAt)}</span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className={styles.detailsActions}>
                            <div className={styles.statusControls}>
                              <select
                                className={styles.statusSelect}
                                value={flag.status}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  updateStatus(flag.id, e.target.value)
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="ACTIVE">Active</option>
                                <option value="UNDER_REVIEW">Under Review</option>
                                <option value="APPEALED">Appealed</option>
                                <option value="RESOLVED">Resolved</option>
                              </select>

                              {flag.status !== 'RESOLVED' && (
                                <button
                                  className={styles.resolveButton}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedFlag(flag)
                                    setShowResolveModal(true)
                                  }}
                                >
                                  Resolve Flag
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Flag Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Flag Worker</h2>
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Worker *</label>
                <select
                  className={styles.input}
                  value={formData.workerId}
                  onChange={(e) => handleWorkerSelect(e.target.value)}
                  required
                >
                  <option value="">Select a worker...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName || user.email}
                      {user.displayName && user.displayName !== user.email ? ` (${user.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Flag Type *</label>
                <select
                  className={styles.input}
                  value={formData.flagType}
                  onChange={(e) => setFormData({ ...formData, flagType: e.target.value })}
                  required
                >
                  <option value="QUALITY_ISSUE">Quality Issue</option>
                  <option value="POLICY_VIOLATION">Policy Violation</option>
                  <option value="ATTENDANCE">Attendance</option>
                  <option value="COMMUNICATION">Communication</option>
                  <option value="PERFORMANCE">Performance</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Reason *</label>
                <textarea
                  className={styles.textarea}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows={3}
                  placeholder="Brief description of the issue..."
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Detailed Notes (Optional)</label>
                <textarea
                  className={styles.textarea}
                  value={formData.detailedNotes}
                  onChange={(e) => setFormData({ ...formData, detailedNotes: e.target.value })}
                  rows={5}
                  placeholder="Additional context, evidence, or details..."
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowCreateModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={styles.submitButton}
                onClick={createFlag}
                disabled={saving || !formData.workerId || !formData.reason}
              >
                {saving ? 'Creating...' : 'Create Flag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Flag Modal */}
      {showResolveModal && selectedFlag && (
        <div className={styles.modalOverlay} onClick={() => setShowResolveModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Resolve Flag</h2>
            <div className={styles.modalContent}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Worker:</span>
                <span className={styles.fieldValue}>{selectedFlag.workerEmail}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Type:</span>
                <span className={styles.fieldValue}>{getFlagTypeLabel(selectedFlag.flagType)}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Reason:</span>
                <p className={styles.description}>{selectedFlag.reason}</p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Resolution Notes *</label>
                <textarea
                  className={styles.textarea}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={5}
                  placeholder="Describe how this issue was resolved..."
                  required
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => {
                  setShowResolveModal(false)
                  setSelectedFlag(null)
                  setResolutionNotes('')
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={styles.submitButton}
                onClick={resolveFlag}
                disabled={saving || !resolutionNotes}
              >
                {saving ? 'Resolving...' : 'Resolve Flag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
