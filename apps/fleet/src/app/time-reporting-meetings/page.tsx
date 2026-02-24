'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { AppSwitcher } from '@repo/ui';

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  meetingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  attendees: string[];
  meetingType: string | null;
  createdAt: string;
  createdBy: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface MeetingFormData {
  title: string;
  description: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  attendees: string;
  meetingType: string;
}

export default function TimeReportingMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [formData, setFormData] = useState<MeetingFormData>({
    title: '',
    description: '',
    meetingDate: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    attendees: '',
    meetingType: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch meetings
  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/time-reporting/meetings');
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings || []);
      }
    } catch (error) {
      console.error('Error fetching meetings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Open modal for new meeting
  const handleNewMeeting = () => {
    setEditingMeeting(null);
    setFormData({
      title: '',
      description: '',
      meetingDate: new Date().toISOString().split('T')[0],
      startTime: '',
      endTime: '',
      attendees: '',
      meetingType: '',
    });
    setShowModal(true);
    setMessage(null);
  };

  // Open modal for editing meeting
  const handleEditMeeting = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    const meetingDate = new Date(meeting.meetingDate).toISOString().split('T')[0];
    const startTime = new Date(meeting.startTime).toISOString().slice(0, 16);
    const endTime = new Date(meeting.endTime).toISOString().slice(0, 16);

    setFormData({
      title: meeting.title,
      description: meeting.description || '',
      meetingDate,
      startTime,
      endTime,
      attendees: meeting.attendees.join(', '),
      meetingType: meeting.meetingType || '',
    });
    setShowModal(true);
    setMessage(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      // Parse attendees (comma-separated emails) - optional
      const attendeesList = formData.attendees
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      const payload = {
        title: formData.title,
        description: formData.description || null,
        meetingDate: formData.meetingDate,
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString(),
        attendees: attendeesList,
        meetingType: formData.meetingType || null,
      };

      const url = editingMeeting
        ? `/api/time-reporting/meetings/${editingMeeting.id}`
        : '/api/time-reporting/meetings';
      const method = editingMeeting ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          type: 'success',
          text: editingMeeting ? 'Meeting updated successfully' : 'Meeting created successfully',
        });
        fetchMeetings();
        setTimeout(() => {
          setShowModal(false);
          setMessage(null);
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save meeting' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle delete meeting
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const response = await fetch(`/api/time-reporting/meetings/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchMeetings();
      } else {
        const data = await response.json();
        alert(`Failed to delete meeting: ${data.error}`);
      }
    } catch (error) {
      alert('Network error while deleting meeting');
    }
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

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
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
              Meeting Database
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
              Manage billable meetings for time reporting verification
            </p>
          </div>
          <button onClick={handleNewMeeting} className="btn-primary">
            + Add Meeting
          </button>
        </div>

        {/* Meetings Table */}
        <div className="glass-card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>All Meetings</h2>
            <button onClick={fetchMeetings} className="btn-secondary" disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
              Loading meetings...
            </p>
          ) : meetings.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
              No meetings yet. Click "Add Meeting" to create one.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Title</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Date</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Time</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Duration</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Attendees</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Type</th>
                    <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((meeting) => (
                    <tr key={meeting.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                      <td style={{ padding: '12px' }}>{meeting.title}</td>
                      <td style={{ padding: '12px' }}>
                        {new Date(meeting.meetingDate).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>
                        {new Date(meeting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {new Date(meeting.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '12px' }}>{meeting.durationMinutes} min</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>
                        {meeting.attendees.length > 0 ? (
                          `${meeting.attendees.length} attendee${meeting.attendees.length !== 1 ? 's' : ''}`
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>No attendees</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {meeting.meetingType ? (
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
                            fontSize: '13px'
                          }}>
                            {meeting.meetingType}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => handleEditMeeting(meeting)}
                          className="btn-secondary"
                          style={{ marginRight: '8px', padding: '6px 12px', fontSize: '14px' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(meeting.id, meeting.title)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '14px',
                            backgroundColor: 'rgba(255, 77, 77, 0.1)',
                            border: '1px solid #ff4d4d',
                            borderRadius: '6px',
                            color: '#ff4d4d',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Meeting Form Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="glass-card"
            style={{
              maxWidth: '600px',
              width: '100%',
              padding: '32px',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>
              {editingMeeting ? 'Edit Meeting' : 'Add New Meeting'}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="e.g., Wave 1 Onboarding Meeting"
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                  }}
                  placeholder="Optional meeting description"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    name="meetingDate"
                    value={formData.meetingDate}
                    onChange={handleInputChange}
                    required
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
                    Meeting Type
                  </label>
                  <input
                    type="text"
                    name="meetingType"
                    value={formData.meetingType}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                    }}
                    placeholder="e.g., Onboarding"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                    Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    name="startTime"
                    value={formData.startTime}
                    onChange={handleInputChange}
                    required
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
                    End Time *
                  </label>
                  <input
                    type="datetime-local"
                    name="endTime"
                    value={formData.endTime}
                    onChange={handleInputChange}
                    required
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

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Attendees (comma-separated emails)
                </label>
                <textarea
                  name="attendees"
                  value={formData.attendees}
                  onChange={handleInputChange}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                  }}
                  placeholder="user1@example.com, user2@example.com, user3@example.com"
                />
              </div>

              {message && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    marginBottom: '20px',
                    backgroundColor:
                      message.type === 'success' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                    border: `1px solid ${message.type === 'success' ? '#00ff88' : '#ff4d4d'}`,
                    color: message.type === 'success' ? '#00ff88' : '#ff4d4d',
                  }}
                >
                  {message.text}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingMeeting ? 'Update Meeting' : 'Create Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
