'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Filter, TrendingDown, AlertTriangle, Users, Search } from 'lucide-react'

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

export default function QAFeedbackAnalysisPage() {
    const router = useRouter()

    // State for filters
    const [startDate, setStartDate] = useState<string>('')
    const [endDate, setEndDate] = useState<string>('')
    const [environment, setEnvironment] = useState<string>('')
    const [minNegativePercent, setMinNegativePercent] = useState<number>(0)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [environments, setEnvironments] = useState<string[]>([])

    // State for data
    const [workers, setWorkers] = useState<WorkerStats[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

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

    // Fetch worker data
    const fetchData = async () => {
        if (!startDate || !endDate) return

        setIsLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams({
                startDate,
                endDate,
            })

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
    }

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

    // Handle quick date range selection
    const setQuickRange = (days: number | null) => {
        const end = new Date()
        setEndDate(end.toISOString().split('T')[0])

        if (days === null) {
            setStartDate('2020-01-01')
        } else {
            const start = new Date()
            start.setDate(start.getDate() - (days - 1))
            setStartDate(start.toISOString().split('T')[0])
        }
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
            // Extract last name (assumes "First Last" format)
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
            <div className="mb-8">
                <h1 className="page-title">
                    <span className="gradient-text">QA Feedback Analysis</span>
                </h1>
                <p className="text-[var(--text-secondary)] mt-2">
                    Analyze QA worker performance based on feedback ratings from the external rating system.
                </p>
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
                    <button
                        onClick={() => setQuickRange(7)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        Last 7 Days
                    </button>
                    <button
                        onClick={() => setQuickRange(30)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        Last 30 Days
                    </button>
                    <button
                        onClick={() => setQuickRange(90)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        Last 90 Days
                    </button>
                    <button
                        onClick={() => setQuickRange(null)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        All Time
                    </button>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={fetchData}
                        disabled={isLoading}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'var(--accent)',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.6 : 1,
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            if (!isLoading) e.currentTarget.style.opacity = '0.9'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = isLoading ? '0.6' : '1'
                        }}
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
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    >
                        Clear Filters
                    </button>
                </div>
            </div>

            {/* Summary Stats */}
            {workers.length > 0 && (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <div className="glass-card" style={{ flex: 1 }}>
                        <div className="flex items-center gap-3">
                            <Users className="w-8 h-8 text-blue-500" />
                            <div>
                                <div className="text-2xl font-bold">{totalWorkers}</div>
                                <div className="text-sm text-[var(--text-secondary)]">Total QA Workers</div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card" style={{ flex: 1 }}>
                        <div className="flex items-center gap-3">
                            <TrendingDown className="w-8 h-8 text-orange-500" />
                            <div>
                                <div className="text-2xl font-bold">{avgNegativePercent.toFixed(1)}%</div>
                                <div className="text-sm text-[var(--text-secondary)]">Avg Negative %</div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card" style={{ flex: 1 }}>
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                            <div>
                                <div className="text-2xl font-bold">{highRiskCount}</div>
                                <div className="text-sm text-[var(--text-secondary)]">High Risk (&gt;25%)</div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card" style={{ flex: 1 }}>
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
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        fontSize: '14px',
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === 1 ? 0.5 : 1,
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (currentPage !== 1) {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                                    }}
                                >
                                    First
                                </button>
                                <button
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        fontSize: '14px',
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === 1 ? 0.5 : 1,
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (currentPage !== 1) {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                                    }}
                                >
                                    Prev
                                </button>
                                <button
                                    onClick={() => setCurrentPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        fontSize: '14px',
                                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === totalPages ? 0.5 : 1,
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (currentPage !== totalPages) {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                                    }}
                                >
                                    Next
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        fontSize: '14px',
                                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === totalPages ? 0.5 : 1,
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (currentPage !== totalPages) {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                                    }}
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
                    <button onClick={fetchData} className="btn-primary">
                        Reload Data
                    </button>
                </div>
            )}
        </div>
    )
}
