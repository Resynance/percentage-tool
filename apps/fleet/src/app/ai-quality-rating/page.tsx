'use client';

import { useState, useEffect, useRef } from 'react';
import { EnvironmentFilter } from '@repo/ui/components';

interface AIQualityJob {
    id: string;
    environment: string;
    status: string;
    totalRecords: number | null;
    processedCount: number;
    errorCount: number;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
}

interface AIQualityRating {
    id: string;
    jobId: string;
    recordId: string;
    content: string;
    score: number;
    reasoning: string | null;
    createdAt: string;
}

function ScoreBadge({ score }: { score: number }) {
    const color = score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : '#ef4444';
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '28px',
            borderRadius: '6px',
            background: `${color}22`,
            border: `1px solid ${color}44`,
            color,
            fontWeight: 700,
            fontSize: '0.85rem',
            flexShrink: 0,
        }}>
            {score}
        </span>
    );
}

function ProgressBar({ processed, total }: { processed: number; total: number | null }) {
    const pct = total && total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    return (
        <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                <span>{processed} / {total ?? '?'} tasks rated</span>
                <span>{pct}%</span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: '4px',
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    transition: 'width 0.5s ease',
                }} />
            </div>
        </div>
    );
}

function RatingRow({ rating }: { rating: AIQualityRating }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div
            onClick={() => setExpanded(!expanded)}
            style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
                transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <ScoreBadge score={rating.score} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                        margin: 0,
                        fontSize: '0.875rem',
                        color: 'rgba(255,255,255,0.85)',
                        overflow: expanded ? 'visible' : 'hidden',
                        textOverflow: expanded ? 'clip' : 'ellipsis',
                        whiteSpace: expanded ? 'normal' : 'nowrap',
                        lineHeight: '1.5',
                    }}>
                        {rating.content}
                    </p>
                    {rating.reasoning && expanded && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>
                            {rating.reasoning}
                        </p>
                    )}
                    {rating.reasoning && !expanded && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>
                            {rating.reasoning}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AIQualityRaterPage() {
    const [environment, setEnvironment] = useState('');
    const [job, setJob] = useState<AIQualityJob | null>(null);
    const [ratings, setRatings] = useState<AIQualityRating[]>([]);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [customCount, setCustomCount] = useState<string>('');
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // When environment changes, load the most recent job for that environment
    useEffect(() => {
        setJob(null);
        setRatings([]);
        setError(null);
        stopPolling();

        if (!environment) return;

        fetchLatestJob();
    }, [environment]);

    // Clean up polling on unmount
    useEffect(() => {
        return () => stopPolling();
    }, []);

    function stopPolling() {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }

    function startPolling(jobId: string) {
        stopPolling();
        pollingRef.current = setInterval(async () => {
            await pollJob(jobId);
        }, 2000);
    }

    async function pollJob(jobId: string) {
        try {
            const res = await fetch(`/api/ai-quality-rating/${jobId}`);
            if (!res.ok) return;
            const data = await res.json();
            setJob(data.job);

            if (['COMPLETED', 'FAILED'].includes(data.job.status)) {
                stopPolling();
                if (data.job.status === 'COMPLETED') {
                    setRatings(data.ratings || []);
                }
            }
        } catch {
            // Ignore polling errors
        }
    }

    async function fetchLatestJob() {
        try {
            const res = await fetch(`/api/ai-quality-rating?environment=${encodeURIComponent(environment)}`);
            if (!res.ok) return;
            const data = await res.json();
            const jobs: AIQualityJob[] = data.jobs || [];
            if (jobs.length === 0) return;

            const latestJob = jobs[0];
            setJob(latestJob);

            if (['PENDING', 'PROCESSING'].includes(latestJob.status)) {
                startPolling(latestJob.id);
            } else if (latestJob.status === 'COMPLETED') {
                // Fetch full results
                const fullRes = await fetch(`/api/ai-quality-rating/${latestJob.id}`);
                if (fullRes.ok) {
                    const fullData = await fullRes.json();
                    setRatings(fullData.ratings || []);
                }
            }
        } catch (err) {
            console.error('Failed to fetch latest job:', err);
        }
    }

    async function startRating() {
        if (!environment) return;
        setStarting(true);
        setError(null);

        try {
            const res = await fetch('/api/ai-quality-rating', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ environment }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to start rating job');
                return;
            }

            // Fetch initial job state and start polling
            const jobRes = await fetch(`/api/ai-quality-rating/${data.jobId}`);
            if (jobRes.ok) {
                const jobData = await jobRes.json();
                setJob(jobData.job);
                setRatings([]);
            }

            startPolling(data.jobId);
        } catch (err: any) {
            setError(err.message || 'Failed to start rating job');
        } finally {
            setStarting(false);
        }
    }

    async function reAnalyze() {
        setJob(null);
        setRatings([]);
        await startRating();
    }

    function exportMarkdown() {
        if (!job || ratings.length === 0) return;

        const date = new Date(job.updatedAt).toISOString().split('T')[0];
        const avg = Math.round(ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length);

        const formatRating = (r: AIQualityRating, i: number) => {
            const lines = [
                `### ${i + 1}. Score: ${r.score}`,
                ``,
                `> ${r.content.replace(/\n/g, '\n> ')}`,
            ];
            if (r.reasoning) lines.push(``, `*${r.reasoning}*`);
            return lines.join('\n');
        };

        const md = [
            `# AI Quality Rating Report`,
            ``,
            `**Environment:** ${job.environment}`,
            `**Date:** ${date}`,
            `**Total rated:** ${ratings.length} tasks`,
            `**Average score:** ${avg}/100`,
            `**Errors:** ${job.errorCount}`,
            ``,
            `---`,
            ``,
            `## 🏆 Top 10% — ${topN} task${topN !== 1 ? 's' : ''}`,
            ``,
            topRatings.map(formatRating).join('\n\n---\n\n'),
            ``,
            `---`,
            ``,
            `## ⚠️ Bottom 10% — ${topN} task${topN !== 1 ? 's' : ''}`,
            ``,
            bottomRatings.map(formatRating).join('\n\n---\n\n'),
            ``,
        ].join('\n');

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quality-report-${job.environment}-${date}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Calculate top/bottom slice — custom count takes priority over 10%
    const parsedCustom = parseInt(customCount, 10);
    const topN = ratings.length > 0
        ? (parsedCustom > 0 ? Math.min(parsedCustom, ratings.length) : Math.max(1, Math.ceil(ratings.length * 0.1)))
        : 0;
    const sortedDesc = [...ratings].sort((a, b) => b.score - a.score);
    const sortedAsc = [...ratings].sort((a, b) => a.score - b.score);
    const topRatings = sortedDesc.slice(0, topN);
    const bottomRatings = sortedAsc.slice(0, topN);
    const usingCustom = parsedCustom > 0;

    const isRunning = job && ['PENDING', 'PROCESSING'].includes(job.status);
    const isComplete = job?.status === 'COMPLETED';
    const isFailed = job?.status === 'FAILED';

    return (
        <div style={{ padding: '32px', maxWidth: '900px' }}>
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 8px' }}>
                    AI Quality Rater
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '0.9rem' }}>
                    Get an AI opinion on task quality across an environment
                </p>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '32px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
                    <EnvironmentFilter
                        value={environment}
                        onChange={setEnvironment}
                        apiUrl="/api/environments"
                        label="Environment"
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.03em' }}>
                        TOP / BOTTOM
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                            type="number"
                            min={1}
                            max={ratings.length || undefined}
                            placeholder="10%"
                            value={customCount}
                            onChange={e => setCustomCount(e.target.value)}
                            style={{
                                width: '72px',
                                padding: '7px 10px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                color: 'rgba(255,255,255,0.85)',
                                fontSize: '0.875rem',
                                outline: 'none',
                            }}
                        />
                        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>
                            {usingCustom ? 'tasks' : 'default'}
                        </span>
                    </div>
                </div>

                {isComplete ? (
                    <>
                        <button
                            onClick={exportMarkdown}
                            disabled={ratings.length === 0}
                            style={{
                                flexShrink: 0,
                                padding: '8px 18px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                cursor: ratings.length === 0 ? 'not-allowed' : 'pointer',
                                background: 'rgba(99,102,241,0.2)',
                                border: '1px solid rgba(99,102,241,0.5)',
                                color: '#a5b4fc',
                                opacity: ratings.length === 0 ? 0.5 : 1,
                            }}
                        >
                            Export MD
                        </button>
                        <button
                            onClick={reAnalyze}
                            disabled={starting || !environment}
                            style={{
                                flexShrink: 0,
                                padding: '8px 18px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                                cursor: (starting || !environment) ? 'not-allowed' : 'pointer',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: 'rgba(255,255,255,0.8)',
                                opacity: (starting || !environment) ? 0.5 : 1,
                            }}
                        >
                            Re-analyze
                        </button>
                    </>
                ) : (
                    <button
                        onClick={startRating}
                        disabled={starting || isRunning || !environment}
                        style={{
                            flexShrink: 0,
                            padding: '8px 18px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: (starting || isRunning || !environment) ? 'not-allowed' : 'pointer',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none',
                            color: '#fff',
                            opacity: (starting || isRunning || !environment) ? 0.5 : 1,
                        }}
                    >
                        {starting ? 'Starting…' : 'Start Rating'}
                    </button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444',
                    marginBottom: '24px',
                    fontSize: '0.875rem',
                }}>
                    {error}
                </div>
            )}

            {/* Job progress */}
            {job && (
                <div style={{
                    padding: '20px 24px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    marginBottom: '32px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                            Job Status
                        </span>
                        <span style={{
                            padding: '3px 10px',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            background: isRunning
                                ? 'rgba(99,102,241,0.15)'
                                : isComplete
                                    ? 'rgba(34,197,94,0.15)'
                                    : 'rgba(239,68,68,0.15)',
                            color: isRunning ? '#818cf8' : isComplete ? '#22c55e' : '#ef4444',
                        }}>
                            {job.status}
                        </span>
                    </div>

                    <ProgressBar processed={job.processedCount} total={job.totalRecords} />

                    {job.errorCount > 0 && (
                        <p style={{ margin: '12px 0 0', fontSize: '0.8rem', color: 'rgba(239,68,68,0.7)' }}>
                            {job.errorCount} record{job.errorCount !== 1 ? 's' : ''} could not be rated
                        </p>
                    )}

                    {isFailed && job.errorMessage && (
                        <p style={{ margin: '12px 0 0', fontSize: '0.8rem', color: '#ef4444' }}>
                            Error: {job.errorMessage}
                        </p>
                    )}

                    {isRunning && (
                        <p style={{ margin: '12px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>
                            Processing in background…
                        </p>
                    )}
                </div>
            )}

            {/* Results */}
            {isComplete && ratings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Top 10% */}
                    <div style={{
                        borderRadius: '12px',
                        border: '1px solid rgba(34,197,94,0.2)',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '14px 20px',
                            background: 'rgba(34,197,94,0.08)',
                            borderBottom: '1px solid rgba(34,197,94,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}>
                            <span style={{ fontSize: '1rem' }}>🏆</span>
                            <span style={{ fontWeight: 700, color: '#22c55e', fontSize: '0.95rem' }}>
                                {usingCustom ? `TOP ${topN}` : 'TOP 10%'}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                                — {topN} task{topN !== 1 ? 's' : ''}
                            </span>
                        </div>
                        {topRatings.map(r => <RatingRow key={r.id} rating={r} />)}
                    </div>

                    {/* Bottom 10% */}
                    <div style={{
                        borderRadius: '12px',
                        border: '1px solid rgba(239,68,68,0.2)',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '14px 20px',
                            background: 'rgba(239,68,68,0.08)',
                            borderBottom: '1px solid rgba(239,68,68,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}>
                            <span style={{ fontSize: '1rem' }}>⚠️</span>
                            <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.95rem' }}>
                                {usingCustom ? `BOTTOM ${topN}` : 'BOTTOM 10%'}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                                — {topN} task{topN !== 1 ? 's' : ''}
                            </span>
                        </div>
                        {bottomRatings.map(r => <RatingRow key={r.id} rating={r} />)}
                    </div>
                </div>
            )}

            {isComplete && ratings.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: 'rgba(255,255,255,0.35)',
                    fontSize: '0.9rem',
                }}>
                    Job completed but no ratings were generated.
                </div>
            )}
        </div>
    );
}
