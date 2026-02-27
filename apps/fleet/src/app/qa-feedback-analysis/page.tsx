'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Filter, TrendingDown, AlertTriangle, Users, Search, X, Upload, CheckCircle2, XCircle } from 'lucide-react'

interface WorkerStats {
    qaEmail: string;
    qaName: string | null;
    totalRatings: number;
    positiveRatings: number;
    negativeRatings: number;
    negativePercent: number;
    disputes: number;
    totalFeedbacks: number;
    negativePerFeedbackRatio: number;
}

interface EnvStats {
    environment: string;
    totalRatings: number;
    positiveRatings: number;
    negativeRatings: number;
    negativePercent: number;
}

type SortField = 'qaEmail' | 'totalRatings' | 'negativePercent' | 'negativePerFeedbackRatio' | 'disputes'
type SortDirection = 'asc' | 'desc'
type QuickRange = 7 | 30 | 90 | null

export default function QAFeedbackAnalysisPage() {
    const router = useRouter()

    // State for filters
    const [startDate, setStartDate] = useState<string>('')
    const [endDate, setEndDate] = useState<string>('')
    const [environment, setEnvironment] = useState<string>('')
    const [minNegativePercent, setMinNegativePercent] = useState<number>(0)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [environments, setEnvironments] = useState<string[]>([])
    const [activeRange, setActiveRange] = useState<QuickRange>(30)

    // State for data
    const [workers, setWorkers] = useState<WorkerStats[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // State for import
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<any>(null)
    const [importError, setImportError] = useState<string | null>(null)
    const [showImportModal, setShowImportModal] = useState(false)

    // State for table
    const [sortField, setSortField] = useState<SortField>('negativePercent')
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
    const [currentPage, setCurrentPage] = useState(1)
    const [expandedWorker, setExpandedWorker] = useState<string | null>(null)
    const [workerEnvStats, setWorkerEnvStats] = useState<Map<string, EnvStats[]>>(new Map())

    const ITEMS_PER_PAGE = 25

    // Set default date range (last 30 days)
    useEffect(() => {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - 29)

        setEndDate(end.toISOString().split('T')[0])
        setStartDate(start.toISOString().split('T')[0])
    }, [])

    // Fetch available environments
    useEffect(() => {
        fetch('/api/admin/records')
            .then(res => res.json())
            .then(data => {
                if (data.records) {
                    const envSet = new Set<string>()
                    data.records.forEach((record: any) => {
                        const env = record.metadata?.environment_name
                        if (env) envSet.add(env)
                    })
                    setEnvironments(Array.from(envSet).sort())
                }
            })
            .catch(err => console.error('Failed to fetch environments:', err))
    }, [])

    // Auto-fetch data on initial load once dates are set
    useEffect(() => {
        if (startDate && endDate && workers.length === 0 && !isLoading) {
            fetchData()
        }
    }, [startDate, endDate])

    // Handle CSV import
    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setImporting(true)
        setImportError(null)
        setImportResult(null)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/qa-feedback-import', {
                method: 'POST',
                body: formData
            })

            const result = await response.json()

            if (!response.ok) {
                setImportError(result.error || 'Import failed')
            } else {
                setImportResult(result.summary)
                // Refresh data after successful import
                if (startDate && endDate) {
                    fetchData()
                }
            }
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Import failed')
        } finally {
            setImporting(false)
            // Reset file input
            e.target.value = ''
        }
    }

    // Fetch worker data
    const fetchData = useCallback(async (overrideStart?: string, overrideEnd?: string) => {
        const s = overrideStart || startDate
        const e = overrideEnd || endDate
        if (!s || !e) return

        setIsLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams({ startDate: s, endDate: e })

            if (environment) params.set('environment', environment)
            if (minNegativePercent > 0) params.set('minNegativePercent', minNegativePercent.toString())

            const response = await fetch(`/api/qa-feedback-analysis?${params}`)
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch data')
            }

            setWorkers(data.workers || [])
            setCurrentPage(1)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }, [startDate, endDate, environment, minNegativePercent])

    // Fetch environment stats for a worker when expanded
    const fetchWorkerEnvStats = async (qaEmail: string) => {
        if (workerEnvStats.has(qaEmail)) return

        try {
            const params = new URLSearchParams({ qaEmail })
            if (startDate) params.set('startDate', startDate)
            if (endDate) params.set('endDate', endDate)

            const response = await fetch(`/api/qa-feedback-analysis/worker-details?${params}`)
            const data = await response.json()

            if (response.ok && data.ratingsByEnvironment) {
                setWorkerEnvStats(new Map(workerEnvStats).set(qaEmail, data.ratingsByEnvironment))
            }
        } catch (err) {
            console.error('Failed to fetch worker environment stats:', err)
        }
    }

    // Navigate to worker details page
    const openWorkerDetails = (qaEmail: string) => {
        const params = new URLSearchParams()
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)
        if (environment) params.set('environment', environment)

        const queryString = params.toString()
        const url = `/qa-feedback-analysis/worker/${encodeURIComponent(qaEmail)}${queryString ? `?${queryString}` : ''}`
        router.push(url)
    }

    // Handle quick date range selection — auto-fetches
    const setQuickRange = (days: QuickRange) => {
        setActiveRange(days)
        const end = new Date()
        const newEnd = end.toISOString().split('T')[0]
        setEndDate(newEnd)

        let newStart: string
        if (days === null) {
            newStart = '2020-01-01'
        } else {
            const start = new Date()
            start.setDate(start.getDate() - (days - 1))
            newStart = start.toISOString().split('T')[0]
        }
        setStartDate(newStart)
        fetchData(newStart, newEnd)
    }

    // Handle sorting
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDirection('desc')
        }
    }

    // Helper function to extract last name
    const getLastName = (worker: WorkerStats): string => {
        if (worker.qaName) {
            const nameParts = worker.qaName.trim().split(/\s+/)
            return nameParts[nameParts.length - 1].toLowerCase()
        }
        return worker.qaEmail.toLowerCase()
    }

    // Filter workers by search query
    const filteredWorkers = workers.filter(worker => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        const name = (worker.qaName || '').toLowerCase()
        const email = worker.qaEmail.toLowerCase()
        return name.includes(query) || email.includes(query)
    })

    // Sort workers
    const sortedWorkers = [...filteredWorkers].sort((a, b) => {
        let aVal = a[sortField]
        let bVal = b[sortField]

        if (sortField === 'qaEmail') {
            // Sort by last name
            const aLastName = getLastName(a)
            const bLastName = getLastName(b)
            return sortDirection === 'asc'
                ? aLastName.localeCompare(bLastName)
                : bLastName.localeCompare(aLastName)
        }

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal)
        }

        return sortDirection === 'asc'
            ? (aVal as number) - (bVal as number)
            : (bVal as number) - (aVal as number)
    })

    // Paginate
    const totalPages = Math.ceil(sortedWorkers.length / ITEMS_PER_PAGE)
    const paginatedWorkers = sortedWorkers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    )

    // Calculate summary stats (based on filtered workers)
    const totalWorkers = filteredWorkers.length
    const avgNegativePercent = filteredWorkers.length > 0
        ? filteredWorkers.reduce((sum, w) => sum + w.negativePercent, 0) / filteredWorkers.length
        : 0
    const highRiskCount = filteredWorkers.filter(w => w.negativePercent > 25).length
    const totalDisputes = filteredWorkers.reduce((sum, w) => sum + w.disputes, 0)

    // Handle expand/collapse
    const toggleExpand = async (qaEmail: string) => {
        if (expandedWorker === qaEmail) {
            setExpandedWorker(null)
        } else {
            setExpandedWorker(qaEmail)
            await fetchWorkerEnvStats(qaEmail)
        }
    }

    return (
        <div className="page-container">
            {/* Header */}
            <div className="mb-8 flex items-start justify-between">
                <div>
                    <h1 className="page-title">
                        <span className="gradient-text">QA Feedback Analysis</span>
                    </h1>
                    <p className="text-[var(--text-secondary)] mt-2">
                        Analyze QA worker performance based on feedback ratings from the external rating system.
                    </p>
                </div>
                <button
                    onClick={() => setShowImportModal(true)}
                    className="btn-primary inline-flex items-center gap-2"
                >
                    <Upload className="w-4 h-4" />
                    Import CSV
                </button>
            </div>

            {/* Filters */}
            <div className="glass-card mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="w-5 h-5 text-[var(--accent)]" />
                    <h2 className="text-xl font-semibold">Filters</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Environment</label>
                        <select
                            value={environment}
                            onChange={(e) => setEnvironment(e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg"
                        >
                            <option value="">All Environments</option>
                            {environments.map(env => (
                                <option key={env} value={env}>{env}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Min Negative % ({minNegativePercent}%)
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={minNegativePercent}
                            onChange={(e) => setMinNegativePercent(parseInt(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Search Input */}
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Search by Name or Email</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search workers..."
                            className="w-full pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)] hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                    {([7, 30, 90, null] as QuickRange[]).map((days) => (
                        <button
                            key={days ?? 'all'}
                            onClick={() => setQuickRange(days)}
                            className={activeRange === days ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                        >
                            {days === null ? 'All Time' : `Last ${days} Days`}
                        </button>
                    ))}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => fetchData()}
                        disabled={isLoading}
                        className="btn-primary"
                        style={{ opacity: isLoading ? 0.6 : undefined, cursor: isLoading ? 'not-allowed' : undefined }}
                    >
                        {isLoading ? 'Loading...' : 'Apply Filters'}
                    </button>
                    <button
                        onClick={() => {
                            setEnvironment('')
                            setMinNegativePercent(0)
                            setSearchQuery('')
                            setQuickRange(30)
                        }}
                        className="btn-secondary"
                    >
                        Clear Filters
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {isLoading && workers.length === 0 && (
                <div className="glass-card text-center py-12">
                    <div className="animate-spin h-8 w-8 border-4 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-[var(--text-secondary)]">Loading worker data...</p>
                </div>
            )}

            {/* Summary Stats */}
            {workers.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <div className="glass-card">
                        <div className="flex items-center gap-3">
                            <Users className="w-8 h-8 text-blue-500" />
                            <div>
                                <div className="text-2xl font-bold">{totalWorkers}</div>
                                <div className="text-sm text-[var(--text-secondary)]">Total QA Workers</div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="flex items-center gap-3">
                            <TrendingDown className="w-8 h-8 text-orange-500" />
                            <div>
                                <div className="text-2xl font-bold">{avgNegativePercent.toFixed(1)}%</div>
                                <div className="text-sm text-[var(--text-secondary)]">Avg Negative %</div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                            <div>
                                <div className="text-2xl font-bold">{highRiskCount}</div>
                                <div className="text-sm text-[var(--text-secondary)]">High Risk (&gt;25%)</div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="w-8 h-8 text-yellow-500" />
                            <div>
                                <div className="text-2xl font-bold">{totalDisputes}</div>
                                <div className="text-sm text-[var(--text-secondary)]">Total Disputes</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="glass-card border-2 border-red-500/30 bg-red-500/5 mb-6">
                    <p className="text-red-500">{error}</p>
                </div>
            )}

            {/* Workers Table */}
            {workers.length > 0 && (
                <div className="glass-card">
                    <h2 className="text-xl font-semibold mb-4">QA Workers ({sortedWorkers.length})</h2>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="text-left py-3 px-4 cursor-pointer hover:bg-[var(--bg-secondary)] border-r border-[var(--border)]" onClick={() => handleSort('qaEmail')}>
                                        Name {sortField === 'qaEmail' && (sortDirection === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="text-left py-3 px-4 border-r border-[var(--border)]">
                                        Email
                                    </th>
                                    <th className="text-right py-3 px-4 cursor-pointer hover:bg-[var(--bg-secondary)] border-r border-[var(--border)]" onClick={() => handleSort('totalRatings')}>
                                        Total Ratings {sortField === 'totalRatings' && (sortDirection === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="text-right py-3 px-4 cursor-pointer hover:bg-[var(--bg-secondary)] border-r border-[var(--border)]" onClick={() => handleSort('negativePercent')}>
                                        Negative % {sortField === 'negativePercent' && (sortDirection === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="text-right py-3 px-4 cursor-pointer hover:bg-[var(--bg-secondary)] border-r border-[var(--border)]" onClick={() => handleSort('negativePerFeedbackRatio')}>
                                        Neg/Feedback {sortField === 'negativePerFeedbackRatio' && (sortDirection === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="text-right py-3 px-4 cursor-pointer hover:bg-[var(--bg-secondary)] border-r border-[var(--border)]" onClick={() => handleSort('disputes')}>
                                        Disputes {sortField === 'disputes' && (sortDirection === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="text-right py-3 px-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedWorkers.map((worker) => (
                                    <React.Fragment key={worker.qaEmail}>
                                        <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-secondary)]">
                                            <td className="py-3 px-4 border-r border-[var(--border)]">
                                                <div className="font-medium">{worker.qaName || 'N/A'}</div>
                                            </td>
                                            <td className="py-3 px-4 border-r border-[var(--border)]">
                                                <div className="text-sm">{worker.qaEmail}</div>
                                            </td>
                                            <td className="text-right py-3 px-4 border-r border-[var(--border)]">
                                                {worker.totalRatings}
                                                <span className="text-sm text-[var(--text-secondary)] ml-2">
                                                    ({worker.totalFeedbacks} feedbacks)
                                                </span>
                                            </td>
                                            <td className="text-right py-3 px-4 border-r border-[var(--border)]">
                                                <span className={worker.negativePercent > 25 ? 'text-red-500 font-bold' : worker.negativePercent > 15 ? 'text-orange-500' : 'text-green-500'}>
                                                    {worker.negativePercent.toFixed(1)}%
                                                </span>
                                                <div className="text-sm text-[var(--text-secondary)]">
                                                    {worker.negativeRatings}/{worker.totalRatings}
                                                </div>
                                            </td>
                                            <td className="text-right py-3 px-4 border-r border-[var(--border)]">
                                                {worker.negativePerFeedbackRatio.toFixed(3)}
                                            </td>
                                            <td className="text-right py-3 px-4 border-r border-[var(--border)]">
                                                {worker.disputes > 0 ? (
                                                    <span className="text-yellow-500">{worker.disputes}</span>
                                                ) : (
                                                    <span className="text-[var(--text-secondary)]">0</span>
                                                )}
                                            </td>
                                            <td className="text-right py-3 px-4">
                                                <button
                                                    onClick={() => toggleExpand(worker.qaEmail)}
                                                    className="btn-secondary text-sm mr-2"
                                                >
                                                    {expandedWorker === worker.qaEmail ? (
                                                        <ChevronUp className="w-4 h-4 inline" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 inline" />
                                                    )}
                                                </button>
                                                <button onClick={() => openWorkerDetails(worker.qaEmail)} className="btn-primary text-sm">
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Expandable Environment Breakdown */}
                                        {expandedWorker === worker.qaEmail && workerEnvStats.has(worker.qaEmail) && (
                                            <tr>
                                                <td colSpan={7} className="bg-[var(--bg-secondary)] p-4">
                                                    <h4 className="font-semibold mb-3">Environment Breakdown</h4>
                                                    <div className="space-y-2">
                                                        {workerEnvStats.get(worker.qaEmail)!.map((envStat) => (
                                                            <div key={envStat.environment} className="flex items-center gap-4">
                                                                <div className="w-32 text-sm">{envStat.environment}</div>
                                                                <div className="flex-1 bg-[var(--bg-primary)] rounded-full h-6 overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-green-500"
                                                                        style={{ width: `${(envStat.positiveRatings / envStat.totalRatings) * 100}%` }}
                                                                    />
                                                                </div>
                                                                <div className="text-sm">
                                                                    <span className="text-red-500">{envStat.negativePercent.toFixed(1)}%</span>
                                                                    <span className="text-[var(--text-secondary)] ml-2">
                                                                        ({envStat.negativeRatings}/{envStat.totalRatings})
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border)]">
                            <div className="text-sm text-[var(--text-secondary)]">
                                Page {currentPage} of {totalPages} ({sortedWorkers.length} workers)
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="btn-secondary text-sm"
                                    style={{ opacity: currentPage === 1 ? 0.5 : undefined, cursor: currentPage === 1 ? 'not-allowed' : undefined }}
                                >
                                    First
                                </button>
                                <button
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="btn-secondary text-sm"
                                    style={{ opacity: currentPage === 1 ? 0.5 : undefined, cursor: currentPage === 1 ? 'not-allowed' : undefined }}
                                >
                                    Prev
                                </button>
                                <button
                                    onClick={() => setCurrentPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className="btn-secondary text-sm"
                                    style={{ opacity: currentPage === totalPages ? 0.5 : undefined, cursor: currentPage === totalPages ? 'not-allowed' : undefined }}
                                >
                                    Next
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    className="btn-secondary text-sm"
                                    style={{ opacity: currentPage === totalPages ? 0.5 : undefined, cursor: currentPage === totalPages ? 'not-allowed' : undefined }}
                                >
                                    Last
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Empty State */}
            {!isLoading && workers.length === 0 && startDate && endDate && (
                <div className="glass-card text-center py-12">
                    <p className="text-[var(--text-secondary)] mb-4">
                        No QA workers found with the selected filters.
                    </p>
                    <button onClick={() => fetchData()} className="btn-primary">
                        Reload Data
                    </button>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div
                    onClick={() => setShowImportModal(false)}
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
                        padding: '2rem'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: 'rgba(10, 10, 15, 0.95)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            maxWidth: '600px',
                            width: '100%',
                            maxHeight: '80vh',
                            overflow: 'auto',
                            padding: '2rem',
                            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: '1.5rem'
                        }}>
                            <div>
                                <h2 style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 600,
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    margin: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <Upload className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                                    Import QA Feedback Ratings
                                </h2>
                                <p style={{
                                    fontSize: '0.875rem',
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    marginTop: '0.5rem'
                                }}>
                                    Upload a CSV file containing QA feedback ratings
                                </p>
                            </div>
                            <button
                                onClick={() => setShowImportModal(false)}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '6px',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    cursor: 'pointer',
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 500
                                }}
                            >
                                Close
                            </button>
                        </div>

                        {/* Required Columns Info */}
                        <div style={{
                            padding: '1rem',
                            backgroundColor: 'rgba(100, 200, 255, 0.1)',
                            borderRadius: '8px',
                            border: '1px solid rgba(100, 200, 255, 0.3)',
                            marginBottom: '1.5rem'
                        }}>
                            <p style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'rgba(100, 200, 255, 0.9)',
                                marginBottom: '0.5rem'
                            }}>
                                Required Columns:
                            </p>
                            <p style={{
                                fontSize: '0.8rem',
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontFamily: 'monospace',
                                lineHeight: '1.6'
                            }}>
                                rating_id, feedback_id, is_helpful, rated_at, rater_email, qa_email
                            </p>
                        </div>

                        {/* Upload Button */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="btn-primary cursor-pointer inline-flex items-center gap-2"
                                style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}>
                                <Upload className="w-5 h-5" />
                                <span style={{ fontSize: '1rem' }}>
                                    {importing ? 'Importing...' : 'Select CSV File'}
                                </span>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleImport}
                                    disabled={importing}
                                    className="hidden"
                                />
                            </label>

                            {importing && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    marginTop: '1rem',
                                    color: 'var(--accent)'
                                }}>
                                    <div className="animate-spin h-5 w-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
                                    <span style={{ fontSize: '0.875rem' }}>Processing...</span>
                                </div>
                            )}
                        </div>

                        {/* Import Error */}
                        {importError && (
                            <div style={{
                                padding: '1rem',
                                backgroundColor: 'rgba(255, 100, 100, 0.1)',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 100, 100, 0.3)',
                                display: 'flex',
                                alignItems: 'start',
                                gap: '0.75rem',
                                marginBottom: '1.5rem'
                            }}>
                                <XCircle className="w-5 h-5" style={{ color: 'rgba(255, 100, 100, 0.9)', flexShrink: 0, marginTop: '0.125rem' }} />
                                <div>
                                    <p style={{
                                        color: 'rgba(255, 100, 100, 0.9)',
                                        fontWeight: 600,
                                        fontSize: '0.875rem',
                                        marginBottom: '0.25rem'
                                    }}>
                                        Import Failed
                                    </p>
                                    <p style={{
                                        color: 'rgba(255, 255, 255, 0.7)',
                                        fontSize: '0.8rem'
                                    }}>
                                        {importError}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Import Success */}
                        {importResult && (
                            <div style={{
                                padding: '1.5rem',
                                backgroundColor: 'rgba(100, 255, 100, 0.1)',
                                borderRadius: '8px',
                                border: '1px solid rgba(100, 255, 100, 0.3)'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'start',
                                    gap: '0.75rem',
                                    marginBottom: '1rem'
                                }}>
                                    <CheckCircle2 className="w-5 h-5" style={{ color: 'rgba(100, 255, 100, 0.9)', flexShrink: 0, marginTop: '0.125rem' }} />
                                    <div>
                                        <p style={{
                                            color: 'rgba(100, 255, 100, 0.9)',
                                            fontWeight: 600,
                                            fontSize: '0.875rem'
                                        }}>
                                            Import Complete!
                                        </p>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '1rem',
                                    fontSize: '0.875rem'
                                }}>
                                    <div>
                                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Imported:</span>
                                        <span style={{ color: 'rgba(100, 255, 100, 0.9)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                            {importResult.imported}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Updated:</span>
                                        <span style={{ color: 'rgba(100, 200, 255, 0.9)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                            {importResult.updated}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Tasks Created:</span>
                                        <span style={{ color: 'rgba(150, 255, 150, 0.9)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                            {importResult.tasksCreated || 0}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Skipped:</span>
                                        <span style={{ color: 'rgba(255, 200, 100, 0.9)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                            {importResult.skipped}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Errors:</span>
                                        <span style={{ color: 'rgba(255, 100, 100, 0.9)', fontWeight: 600, marginLeft: '0.5rem' }}>
                                            {importResult.errors?.length || 0}
                                        </span>
                                    </div>
                                </div>

                                {importResult.errors && importResult.errors.length > 0 && (
                                    <details style={{ marginTop: '1rem' }}>
                                        <summary style={{
                                            cursor: 'pointer',
                                            fontSize: '0.875rem',
                                            fontWeight: 500,
                                            color: 'rgba(255, 255, 255, 0.7)',
                                            userSelect: 'none'
                                        }}>
                                            View Errors ({importResult.errors.length})
                                        </summary>
                                        <div style={{
                                            marginTop: '0.75rem',
                                            padding: '0.75rem',
                                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                            borderRadius: '6px',
                                            maxHeight: '200px',
                                            overflowY: 'auto'
                                        }}>
                                            {importResult.errors.slice(0, 10).map((err: string, i: number) => (
                                                <div key={i} style={{
                                                    fontSize: '0.75rem',
                                                    color: 'rgba(255, 255, 255, 0.6)',
                                                    paddingTop: '0.25rem',
                                                    paddingBottom: '0.25rem'
                                                }}>
                                                    {err}
                                                </div>
                                            ))}
                                            {importResult.errors.length > 10 && (
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: 'rgba(255, 255, 255, 0.6)',
                                                    paddingTop: '0.25rem',
                                                    paddingBottom: '0.25rem',
                                                    fontStyle: 'italic'
                                                }}>
                                                    ... and {importResult.errors.length - 10} more
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
