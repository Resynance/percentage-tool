'use client'

import { useEffect, useState } from 'react'
import { useRoleCheck } from '@/hooks/useRoleCheck'
import styles from './page.module.css'

interface Announcement {
  id: string
  title: string
  content: string
  published: boolean
  visibility: 'ALL_USERS' | 'QA_AND_ABOVE'
  createdAt: string
  updatedAt: string
  createdBy: {
    email: string
  }
}

export default function AnnouncementsPage() {
  const { isAuthorized } = useRoleCheck({
    allowedRoles: ['FLEET', 'ADMIN'],
    redirectOnUnauthorized: '/',
    redirectOnUnauthenticated: '/login'
  })

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    published: true,
    visibility: 'ALL_USERS' as 'ALL_USERS' | 'QA_AND_ABOVE'
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/announcements')

      if (!response.ok) {
        throw new Error('Failed to fetch announcements')
      }

      const data = await response.json()
      setAnnouncements(data.announcements || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const createAnnouncement = async () => {
    if (!formData.title || !formData.content) {
      alert('Please fill in all required fields')
      return
    }

    try {
      setSaving(true)
      const response = await fetch('/api/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create announcement')
      }

      // Reset form and close modal
      setFormData({
        title: '',
        content: '',
        published: true,
      })
      setShowCreateModal(false)

      // Refresh announcements
      await fetchAnnouncements()

      alert('Announcement created successfully')
    } catch (err) {
      console.error('Error creating announcement:', err)
      alert(err instanceof Error ? err.message : 'Failed to create announcement')
    } finally {
      setSaving(false)
    }
  }

  const updateAnnouncement = async () => {
    if (!selectedAnnouncement || !formData.title || !formData.content) {
      alert('Please fill in all required fields')
      return
    }

    try {
      setSaving(true)
      const response = await fetch('/api/announcements', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: selectedAnnouncement.id,
          ...formData,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update announcement')
      }

      // Reset form and close modal
      setFormData({
        title: '',
        content: '',
        published: true,
      })
      setSelectedAnnouncement(null)
      setShowEditModal(false)

      // Refresh announcements
      await fetchAnnouncements()

      alert('Announcement updated successfully')
    } catch (err) {
      console.error('Error updating announcement:', err)
      alert(err instanceof Error ? err.message : 'Failed to update announcement')
    } finally {
      setSaving(false)
    }
  }

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) {
      return
    }

    try {
      const response = await fetch(`/api/announcements?id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete announcement')
      }

      // Refresh announcements
      await fetchAnnouncements()

      alert('Announcement deleted successfully')
    } catch (err) {
      console.error('Error deleting announcement:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete announcement')
    }
  }

  const openEditModal = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement)
    setFormData({
      title: announcement.title,
      content: announcement.content,
      published: announcement.published,
      visibility: announcement.visibility
    })
    setShowEditModal(true)
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

  if (isAuthorized === null) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Checking permissions...</div>
      </div>
    )
  }

  if (loading && announcements.length === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Announcements</h1>
        <div className={styles.loading}>Loading announcements...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Announcements</h1>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Announcements</h1>
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
          Create Announcement
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No announcements yet.</p>
          <button onClick={() => setShowCreateModal(true)} className={styles.createButton}>
            Create First Announcement
          </button>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Title</th>
                <th className={styles.th}>Content</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Visibility</th>
                <th className={styles.th}>Created By</th>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((announcement) => (
                <tr key={announcement.id} className={styles.tableRow}>
                  <td className={styles.td}>
                    <span className={styles.announcementTitle}>{announcement.title}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.announcementContent}>
                      {announcement.content.length > 100
                        ? `${announcement.content.substring(0, 100)}...`
                        : announcement.content}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span
                      className={styles.statusBadge}
                      style={{
                        backgroundColor: announcement.published
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(156, 163, 175, 0.2)',
                        color: announcement.published ? '#22c55e' : '#9ca3af',
                      }}
                    >
                      {announcement.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span
                      className={styles.statusBadge}
                      style={{
                        backgroundColor: announcement.visibility === 'ALL_USERS'
                          ? 'rgba(59, 130, 246, 0.2)'
                          : 'rgba(168, 85, 247, 0.2)',
                        color: announcement.visibility === 'ALL_USERS' ? '#3b82f6' : '#a855f7',
                      }}
                    >
                      {announcement.visibility === 'ALL_USERS' ? 'All Users' : 'QA & Above'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.userEmail}>{announcement.createdBy.email}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.date}>{formatDate(announcement.createdAt)}</span>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button
                        onClick={() => openEditModal(announcement)}
                        className={styles.editButton}
                        title="Edit"
                      >
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
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteAnnouncement(announcement.id)}
                        className={styles.deleteButton}
                        title="Delete"
                      >
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
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Announcement Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create Announcement</h2>
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Title *</label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter announcement title..."
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Content *</label>
                <textarea
                  className={styles.textarea}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  placeholder="Enter announcement content..."
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Visibility</label>
                <select
                  className={styles.input}
                  value={formData.visibility}
                  onChange={(e) => setFormData({ ...formData, visibility: e.target.value as 'ALL_USERS' | 'QA_AND_ABOVE' })}
                >
                  <option value="ALL_USERS">All Users</option>
                  <option value="QA_AND_ABOVE">QA & Above (QA, Core, Fleet, Manager, Admin)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.published}
                    onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                  />
                  <span>Publish immediately</span>
                </label>
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
                onClick={createAnnouncement}
                disabled={saving || !formData.title || !formData.content}
              >
                {saving ? 'Creating...' : 'Create Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Announcement Modal */}
      {showEditModal && selectedAnnouncement && (
        <div className={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Edit Announcement</h2>
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Title *</label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter announcement title..."
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Content *</label>
                <textarea
                  className={styles.textarea}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  placeholder="Enter announcement content..."
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Visibility</label>
                <select
                  className={styles.input}
                  value={formData.visibility}
                  onChange={(e) => setFormData({ ...formData, visibility: e.target.value as 'ALL_USERS' | 'QA_AND_ABOVE' })}
                >
                  <option value="ALL_USERS">All Users</option>
                  <option value="QA_AND_ABOVE">QA & Above (QA, Core, Fleet, Manager, Admin)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.published}
                    onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                  />
                  <span>Published</span>
                </label>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => {
                  setShowEditModal(false)
                  setSelectedAnnouncement(null)
                  setFormData({
                    title: '',
                    content: '',
                    published: true,
                    visibility: 'ALL_USERS'
                  })
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={styles.submitButton}
                onClick={updateAnnouncement}
                disabled={saving || !formData.title || !formData.content}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
