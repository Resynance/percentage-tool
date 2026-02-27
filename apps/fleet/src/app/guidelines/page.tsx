'use client';

import { useState, useEffect } from 'react';
import {
    FileText,
    Upload,
    Edit2,
    Trash2,
    Download,
    X,
    Loader2,
    CheckCircle2,
    XCircle,
    Plus
} from 'lucide-react';

interface Guideline {
    id: string;
    name: string;
    environments: string[];
    uploadedBy: string;
    createdAt: string;
    updatedAt: string;
    users: {
        email: string;
    };
}

export default function GuidelinesPage() {
    const [guidelines, setGuidelines] = useState<Guideline[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [availableEnvironments, setAvailableEnvironments] = useState<string[]>([]);

    // Upload modal state
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadName, setUploadName] = useState('');
    const [uploadEnvironments, setUploadEnvironments] = useState<string[]>([]);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingGuideline, setEditingGuideline] = useState<Guideline | null>(null);
    const [editName, setEditName] = useState('');
    const [editEnvironments, setEditEnvironments] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchGuidelines();
        fetchEnvironments();
    }, []);

    const fetchEnvironments = async () => {
        try {
            const res = await fetch('/api/environments');
            if (res.ok) {
                const data = await res.json();
                setAvailableEnvironments(data.environments || []);
            }
        } catch (error) {
            console.error('Error fetching environments:', error);
        }
    };

    const fetchGuidelines = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/guidelines');
            if (res.ok) {
                const data = await res.json();
                setGuidelines(data.guidelines || []);
            }
        } catch (error) {
            console.error('Error fetching guidelines:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type !== 'application/pdf') {
                setStatus({ type: 'error', message: 'Please select a PDF file' });
                return;
            }
            setUploadFile(file);
        }
    };

    const toggleUploadEnvironment = (env: string) => {
        setUploadEnvironments(prev =>
            prev.includes(env) ? prev.filter(e => e !== env) : [...prev, env]
        );
    };

    const toggleEditEnvironment = (env: string) => {
        setEditEnvironments(prev =>
            prev.includes(env) ? prev.filter(e => e !== env) : [...prev, env]
        );
    };

    const handleUpload = async () => {
        if (!uploadName.trim() || !uploadFile) {
            setStatus({ type: 'error', message: 'Please provide a name and select a PDF file' });
            return;
        }

        setUploading(true);
        setStatus(null);

        try {
            // Convert PDF to base64
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result as string;

                const res = await fetch('/api/guidelines', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: uploadName,
                        content: base64,
                        environments: uploadEnvironments
                    })
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || 'Failed to upload');
                }

                setStatus({ type: 'success', message: 'Guideline uploaded successfully' });
                setShowUploadModal(false);
                setUploadName('');
                setUploadEnvironments([]);
                setUploadFile(null);
                fetchGuidelines();
            };
            reader.readAsDataURL(uploadFile);
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setUploading(false);
        }
    };

    const openEditModal = (guideline: Guideline) => {
        setEditingGuideline(guideline);
        setEditName(guideline.name);
        setEditEnvironments(guideline.environments || []);
        setShowEditModal(true);
    };

    const handleEdit = async () => {
        if (!editingGuideline || !editName.trim()) return;

        setSaving(true);
        setStatus(null);

        try {
            const res = await fetch(`/api/guidelines/${editingGuideline.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editName,
                    environments: editEnvironments
                })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update');
            }

            setStatus({ type: 'success', message: 'Guideline updated successfully' });
            setShowEditModal(false);
            setEditingGuideline(null);
            fetchGuidelines();
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (guideline: Guideline) => {
        if (!confirm(`Delete "${guideline.name}"? This cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/guidelines/${guideline.id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to delete');
            }

            setStatus({ type: 'success', message: 'Guideline deleted successfully' });
            fetchGuidelines();
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        }
    };

    const handleDownload = async (guideline: Guideline) => {
        try {
            const res = await fetch(`/api/guidelines/${guideline.id}`);
            if (!res.ok) throw new Error('Failed to download');

            const data = await res.json();
            const base64 = data.guideline.content;

            // Convert base64 to blob and trigger download
            const link = document.createElement('a');
            link.href = base64;
            link.download = `${guideline.name}.pdf`;
            link.click();
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
                <Loader2 className="animate-spin" size={48} color="var(--accent)" />
            </div>
        );
    }

    return (
        <div>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="premium-gradient" style={{ fontSize: '2rem', marginBottom: '8px' }}>
                        Guidelines Management
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.6)' }}>
                        Upload and manage PDF guidelines for alignment analysis
                    </p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Plus size={20} />
                    Upload Guideline
                </button>
            </header>

            {status && (
                <div className="glass-card" style={{
                    padding: '16px 24px',
                    marginBottom: '24px',
                    border: `1px solid ${status.type === 'success' ? 'var(--success)' : '#ff4d4d'}`,
                    background: `${status.type === 'success' ? 'rgba(0,255,136,0.05)' : 'rgba(255,77,77,0.05)'}`,
                    color: status.type === 'success' ? '#00ff88' : '#ff4d4d',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    {status.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                    {status.message}
                </div>
            )}

            {guidelines.length === 0 ? (
                <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
                    <FileText size={48} style={{ opacity: 0.3, marginBottom: '16px', margin: '0 auto 16px' }} />
                    <p style={{ opacity: 0.6, marginBottom: '16px' }}>No guidelines uploaded yet</p>
                    <button onClick={() => setShowUploadModal(true)} className="btn-primary">
                        Upload Your First Guideline
                    </button>
                </div>
            ) : (
                <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', opacity: 0.6, fontWeight: 600 }}>Name</th>
                                <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', opacity: 0.6, fontWeight: 600 }}>Environment</th>
                                <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', opacity: 0.6, fontWeight: 600 }}>Uploaded By</th>
                                <th style={{ padding: '16px', textAlign: 'left', fontSize: '0.85rem', opacity: 0.6, fontWeight: 600 }}>Created</th>
                                <th style={{ padding: '16px', textAlign: 'right', fontSize: '0.85rem', opacity: 0.6, fontWeight: 600 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {guidelines.map((guideline, idx) => (
                                <tr key={guideline.id} style={{ borderBottom: idx === guidelines.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <FileText size={20} color="var(--accent)" />
                                            <span style={{ fontWeight: 500 }}>{guideline.name}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        {guideline.environments && guideline.environments.length > 0 ? (
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {guideline.environments.map(env => (
                                                    <div key={env} style={{
                                                        display: 'inline-block',
                                                        padding: '4px 10px',
                                                        borderRadius: '20px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        background: 'rgba(147, 51, 234, 0.1)',
                                                        color: '#a78bfa',
                                                        border: '1px solid rgba(147, 51, 234, 0.2)'
                                                    }}>
                                                        {env}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span style={{ opacity: 0.4, fontSize: '0.85rem' }}>Default / Global</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '16px', opacity: 0.6, fontSize: '0.85rem' }}>
                                        {guideline.users.email}
                                    </td>
                                    <td style={{ padding: '16px', opacity: 0.6, fontSize: '0.85rem' }}>
                                        {new Date(guideline.createdAt).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => handleDownload(guideline)}
                                                className="btn-secondary"
                                                style={{ padding: '6px 10px' }}
                                                title="Download PDF"
                                            >
                                                <Download size={16} />
                                            </button>
                                            <button
                                                onClick={() => openEditModal(guideline)}
                                                className="btn-secondary"
                                                style={{ padding: '6px 10px' }}
                                                title="Edit"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(guideline)}
                                                className="btn-secondary"
                                                style={{ padding: '6px 10px', color: '#ff4d4d' }}
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Upload Guideline</h2>
                            <button
                                onClick={() => setShowUploadModal(false)}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Name *</label>
                                <input
                                    type="text"
                                    value={uploadName}
                                    onChange={e => setUploadName(e.target.value)}
                                    placeholder="e.g., Production Quality Guidelines v2.1"
                                    className="input-field"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                                    Environments <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span>
                                </label>
                                {availableEnvironments.length > 0 ? (
                                    <div style={{
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        background: 'rgba(0,0,0,0.2)'
                                    }}>
                                        {availableEnvironments.map(env => (
                                            <label key={env} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '8px',
                                                cursor: 'pointer',
                                                borderRadius: '4px',
                                                transition: 'background 0.2s',
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={uploadEnvironments.includes(env)}
                                                    onChange={() => toggleUploadEnvironment(env)}
                                                    style={{ marginRight: '10px', cursor: 'pointer' }}
                                                />
                                                <span>{env}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        opacity: 0.5,
                                        fontSize: '0.85rem',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px'
                                    }}>
                                        No environments available. Upload data records first.
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>PDF File *</label>
                                <div style={{
                                    border: '2px dashed rgba(255,255,255,0.2)',
                                    borderRadius: '8px',
                                    padding: '24px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => {
                                        e.preventDefault();
                                        const file = e.dataTransfer.files[0];
                                        if (file?.type === 'application/pdf') {
                                            setUploadFile(file);
                                        }
                                    }}
                                >
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                        id="pdf-upload"
                                    />
                                    <label htmlFor="pdf-upload" style={{ cursor: 'pointer' }}>
                                        <Upload size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                                        <div style={{ fontSize: '0.9rem', opacity: 0.6 }}>
                                            {uploadFile ? uploadFile.name : 'Click or drag PDF file here'}
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button
                                    onClick={() => setShowUploadModal(false)}
                                    className="btn-secondary"
                                    style={{ flex: 1, padding: '14px' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading || !uploadName.trim() || !uploadFile}
                                    className="btn-primary"
                                    style={{ flex: 1, padding: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                                >
                                    {uploading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                                    Upload
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && editingGuideline && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Edit Guideline</h2>
                            <button
                                onClick={() => setShowEditModal(false)}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="input-field"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                                    Environments <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span>
                                </label>
                                {availableEnvironments.length > 0 ? (
                                    <div style={{
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        background: 'rgba(0,0,0,0.2)'
                                    }}>
                                        {availableEnvironments.map(env => (
                                            <label key={env} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '8px',
                                                cursor: 'pointer',
                                                borderRadius: '4px',
                                                transition: 'background 0.2s',
                                            }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={editEnvironments.includes(env)}
                                                    onChange={() => toggleEditEnvironment(env)}
                                                    style={{ marginRight: '10px', cursor: 'pointer' }}
                                                />
                                                <span>{env}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        opacity: 0.5,
                                        fontSize: '0.85rem',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px'
                                    }}>
                                        No environments available
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button
                                    onClick={() => setShowEditModal(false)}
                                    className="btn-secondary"
                                    style={{ flex: 1, padding: '14px' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEdit}
                                    disabled={saving || !editName.trim()}
                                    className="btn-primary"
                                    style={{ flex: 1, padding: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                                >
                                    {saving ? <Loader2 className="animate-spin" size={20} /> : null}
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
