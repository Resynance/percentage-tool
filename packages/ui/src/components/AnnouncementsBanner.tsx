'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

interface Announcement {
  id: string
  title: string
  content: string
  createdAt: string
  isRead: boolean
  createdBy: {
    email: string
    firstName: string | null
    lastName: string | null
  }
}

interface AnnouncementsBannerProps {
  // No props needed - each app has its own /api/announcements endpoint
}

export function AnnouncementsBanner({}: AnnouncementsBannerProps = {}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMarkingRead, setIsMarkingRead] = useState(false)

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('announcements-banner-collapsed')
    if (saved !== null) {
      setIsExpanded(saved === 'false')
    }
  }, [])

  // Fetch announcements on mount
  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setIsLoading(true)

      // Use local API endpoint (proxies to Fleet app if needed)
      const response = await fetch('/api/announcements', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        // If it's a 401, user might not be authenticated - don't show error
        if (response.status === 401) {
          setAnnouncements([])
          return
        }
        throw new Error(`Failed to fetch announcements: ${response.status}`)
      }

      const data = await response.json()
      setAnnouncements(data.announcements || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching announcements:', err)
      // Don't show error in UI - just hide announcements
      setAnnouncements([])
      setError(null)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleExpanded = () => {
    const newState = !isExpanded
    setIsExpanded(newState)
    localStorage.setItem('announcements-banner-collapsed', String(!newState))
  }

  const markAllAsRead = async () => {
    try {
      setIsMarkingRead(true)

      // Get all unread announcement IDs
      const unreadIds = announcements
        .filter(a => !a.isRead)
        .map(a => a.id)

      if (unreadIds.length === 0) return

      // Call mark-read endpoint
      const response = await fetch('/api/announcements/mark-read', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ announcementIds: unreadIds })
      })

      if (!response.ok) {
        throw new Error(`Failed to mark announcements as read: ${response.status}`)
      }

      // Update local state to mark all as read
      setAnnouncements(prev =>
        prev.map(announcement => ({ ...announcement, isRead: true }))
      )
    } catch (err) {
      console.error('Error marking announcements as read:', err)
    } finally {
      setIsMarkingRead(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  // Calculate unread count
  const unreadCount = announcements.filter(a => !a.isRead).length

  // Don't render if no announcements
  if (!isLoading && announcements.length === 0) {
    return null
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)',
        borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
        transition: 'all 0.3s ease'
      }}
    >
      {/* Header - Always visible */}
      <button
        onClick={toggleExpanded}
        style={{
          width: '100%',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255, 255, 255, 0.9)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1rem', fontWeight: 600 }}>
            📢 Announcements
          </span>
          {!isExpanded && unreadCount > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.3)',
                color: 'rgba(255, 255, 255, 0.9)'
              }}
            >
              {unreadCount} new
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {/* Content - Expandable */}
      {isExpanded && (
        <>
          {/* Mark All as Read Button */}
          {unreadCount > 0 && (
            <div style={{ padding: '8px 24px 0' }}>
              <button
                onClick={markAllAsRead}
                disabled={isMarkingRead}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.9)',
                  background: 'rgba(59, 130, 246, 0.3)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                  borderRadius: '6px',
                  cursor: isMarkingRead ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: isMarkingRead ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isMarkingRead) {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.4)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)'
                }}
              >
                {isMarkingRead ? 'Marking as read...' : `Mark All as Read (${unreadCount})`}
              </button>
            </div>
          )}

          <div
            style={{
              padding: '0 24px 16px',
              maxHeight: '400px',
              overflowY: 'auto'
            }}
          >
            {isLoading ? (
            <div style={{ color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', padding: '16px' }}>
              Loading announcements...
            </div>
          ) : error ? (
            <div style={{ color: 'rgba(239, 68, 68, 0.9)', textAlign: 'center', padding: '16px' }}>
              {error}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '12px 16px'
                  }}
                >
                  <div style={{ marginBottom: '8px' }}>
                    <h3
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: 'rgba(255, 255, 255, 0.95)',
                        margin: 0,
                        marginBottom: '4px'
                      }}
                    >
                      {announcement.title}
                    </h3>
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: 'rgba(255, 255, 255, 0.7)',
                        margin: 0
                      }}
                    >
                      {announcement.content}
                    </p>
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'rgba(255, 255, 255, 0.5)',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>
                      Posted by {announcement.createdBy.firstName && announcement.createdBy.lastName
                        ? `${announcement.createdBy.firstName} ${announcement.createdBy.lastName}`
                        : announcement.createdBy.email}
                    </span>
                    <span>{formatDate(announcement.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </>
      )}
    </div>
  )
}
