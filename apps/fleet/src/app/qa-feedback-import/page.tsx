'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react'

interface ImportSummary {
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
}

export default function QAFeedbackImportPage() {
    const [file, setFile] = useState<File | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [summary, setSummary] = useState<ImportSummary | null>(null)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile && droppedFile.type === 'text/csv') {
            setFile(droppedFile)
            setError(null)
            setSummary(null)
        } else {
            setError('Please drop a CSV file')
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            setFile(selectedFile)
            setError(null)
            setSummary(null)
        }
    }

    const handleUpload = async () => {
        if (!file) return

        setIsUploading(true)
        setError(null)
        setSummary(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/qa-feedback-import', {
                method: 'POST',
                body: formData,
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Import failed')
            }

            setSummary(data.summary)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred during import')
        } finally {
            setIsUploading(false)
        }
    }

    const handleReset = () => {
        setFile(null)
        setSummary(null)
        setError(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    return (
        <div className="page-container">
            {/* Header */}
            <div className="mb-8">
                <h1 className="page-title">
                    <span className="gradient-text">QA Feedback Import</span>
                </h1>
                <p className="text-[var(--text-secondary)] mt-2">
                    Import QA worker feedback ratings from CSV files. This data is used for performance analysis and quality monitoring.
                </p>
            </div>

            {/* Upload Section */}
            <div className="glass-card mb-6">
                <h2 className="text-xl font-semibold mb-4">Upload CSV File</h2>

                {/* Drag and Drop Zone */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        border-2 border-dashed rounded-lg p-8 text-center transition-all
                        ${isDragging
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                        }
                        ${file ? 'bg-[var(--accent)]/5' : ''}
                    `}
                >
                    {!file ? (
                        <div>
                            <Upload className="w-12 h-12 mx-auto mb-4 text-[var(--text-secondary)]" />
                            <p className="text-lg mb-2">Drop CSV file here or click to browse</p>
                            <p className="text-sm text-[var(--text-secondary)]">
                                Accepts .csv files with QA feedback rating data
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="btn-primary mt-4"
                            >
                                Select File
                            </button>
                        </div>
                    ) : (
                        <div>
                            <FileText className="w-12 h-12 mx-auto mb-4 text-[var(--accent)]" />
                            <p className="text-lg font-medium mb-1">{file.name}</p>
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                {(file.size / 1024).toFixed(2)} KB
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={handleUpload}
                                    disabled={isUploading}
                                    className="btn-primary"
                                >
                                    {isUploading ? 'Importing...' : 'Import Data'}
                                </button>
                                <button
                                    onClick={handleReset}
                                    disabled={isUploading}
                                    className="btn-secondary"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Progress Indicator */}
                {isUploading && (
                    <div className="mt-4">
                        <div className="flex items-center gap-3">
                            <div className="animate-spin h-5 w-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
                            <span className="text-[var(--text-secondary)]">Processing CSV file...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="glass-card border-2 border-red-500/30 bg-red-500/5 mb-6">
                    <div className="flex items-start gap-3">
                        <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-red-500 mb-1">Import Failed</h3>
                            <p className="text-[var(--text-secondary)]">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Summary */}
            {summary && (
                <div className="glass-card border-2 border-green-500/30 bg-green-500/5">
                    <div className="flex items-start gap-3 mb-6">
                        <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-green-500 mb-1">Import Completed</h3>
                            <p className="text-[var(--text-secondary)]">
                                The CSV file has been processed successfully.
                            </p>
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-[var(--bg-secondary)] p-4 rounded-lg">
                            <div className="text-2xl font-bold text-green-500 mb-1">
                                {summary.imported}
                            </div>
                            <div className="text-sm text-[var(--text-secondary)]">
                                New Records Imported
                            </div>
                        </div>
                        <div className="bg-[var(--bg-secondary)] p-4 rounded-lg">
                            <div className="text-2xl font-bold text-blue-500 mb-1">
                                {summary.updated}
                            </div>
                            <div className="text-sm text-[var(--text-secondary)]">
                                Records Updated
                            </div>
                        </div>
                        <div className="bg-[var(--bg-secondary)] p-4 rounded-lg">
                            <div className="text-2xl font-bold text-orange-500 mb-1">
                                {summary.skipped}
                            </div>
                            <div className="text-sm text-[var(--text-secondary)]">
                                Records Skipped
                            </div>
                        </div>
                    </div>

                    {/* Error Details */}
                    {summary.errors.length > 0 && (
                        <div className="border-t border-[var(--border)] pt-4">
                            <div className="flex items-start gap-3 mb-3">
                                <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                                <h4 className="font-semibold text-orange-500">
                                    Skipped Rows ({summary.errors.length})
                                </h4>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                                    {summary.errors.map((error, index) => (
                                        <li key={index} className="pl-4">
                                            • {error}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Instructions */}
            <div className="glass-card mt-6">
                <h3 className="font-semibold mb-3">CSV Format Requirements</h3>
                <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                    <li>• <strong>rating_id</strong> (required): Unique identifier for the rating</li>
                    <li>• <strong>feedback_id</strong> (required): ID of the feedback being rated</li>
                    <li>• <strong>is_helpful</strong> (required): true/false or 1/0 - Whether feedback was helpful</li>
                    <li>• <strong>rated_at</strong> (required): Date when rating was given (ISO 8601 format)</li>
                    <li>• <strong>rater_email</strong> (required): Email of person who gave the rating</li>
                    <li>• <strong>qa_email</strong> (required): Email of QA worker who provided the feedback</li>
                    <li>• <strong>eval_task_id</strong> (optional): Link to task in data_records table</li>
                    <li>• <strong>is_dispute</strong> (optional): true/false - Whether rating was disputed</li>
                    <li>• <strong>dispute_status</strong> (optional): Status of dispute resolution</li>
                    <li>• <strong>dispute_reason</strong> (optional): Reason for dispute</li>
                    <li>• <strong>rater_name</strong> (optional): Name of rater</li>
                    <li>• <strong>qa_name</strong> (optional): Name of QA worker</li>
                    <li>• <strong>resolved_at</strong> (optional): Date when dispute was resolved</li>
                    <li>• <strong>resolved_by_name</strong> (optional): Who resolved the dispute</li>
                    <li>• <strong>resolution_reason</strong> (optional): Reason for resolution</li>
                </ul>
                <p className="text-sm text-[var(--text-secondary)] mt-4">
                    <strong>Note:</strong> Duplicate rating_id values will update existing records instead of creating new ones.
                </p>
            </div>
        </div>
    )
}
