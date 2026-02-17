/**
 * Utility functions for worker flags
 */

/**
 * Get the priority order for worker flag statuses
 * Used for sorting: ACTIVE > UNDER_REVIEW > APPEALED > RESOLVED
 */
export function getStatusPriority(status: string): number {
  switch (status) {
    case 'ACTIVE':
      return 1
    case 'UNDER_REVIEW':
      return 2
    case 'APPEALED':
      return 3
    case 'RESOLVED':
      return 4
    default:
      return 5
  }
}

/**
 * Get the display label for a worker flag status
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active'
    case 'UNDER_REVIEW':
      return 'Under Review'
    case 'RESOLVED':
      return 'Resolved'
    case 'APPEALED':
      return 'Appealed'
    default:
      return status
  }
}

/**
 * Get the color for a worker flag status badge
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return '#ef4444' // red
    case 'UNDER_REVIEW':
      return '#f59e0b' // amber
    case 'RESOLVED':
      return '#10b981' // green
    case 'APPEALED':
      return '#a855f7' // purple
    default:
      return '#6b7280' // gray
  }
}

/**
 * Get the display label for a flag type
 */
export function getFlagTypeLabel(type: string): string {
  switch (type) {
    case 'QUALITY_ISSUE':
      return 'Quality Issue'
    case 'POLICY_VIOLATION':
      return 'Policy Violation'
    case 'ATTENDANCE':
      return 'Attendance'
    case 'COMMUNICATION':
      return 'Communication'
    case 'PERFORMANCE':
      return 'Performance'
    case 'OTHER':
      return 'Other'
    default:
      return type
  }
}

/**
 * Get the color for a flag type badge
 */
export function getFlagTypeColor(type: string): string {
  switch (type) {
    case 'QUALITY_ISSUE':
      return '#dc2626' // red
    case 'POLICY_VIOLATION':
      return '#ea580c' // orange
    case 'ATTENDANCE':
      return '#d97706' // yellow
    case 'COMMUNICATION':
      return '#0891b2' // cyan
    case 'PERFORMANCE':
      return '#7c3aed' // violet
    case 'OTHER':
      return '#6b7280' // gray
    default:
      return '#6b7280' // gray
  }
}
