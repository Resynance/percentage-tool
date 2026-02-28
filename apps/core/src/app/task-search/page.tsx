'use client';

import { useState } from 'react';
import { Search, Loader2, Bot, ChevronDown, ChevronUp, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react';

interface TaskResult {
    id: string;
    content: string;
    environment: string;
    createdByName: string | null;
    createdByEmail: string | null;
    createdAt: string;
}

type Verdict = 'AI_GENERATED' | 'TEMPLATED' | 'AUTHENTIC';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

interface AICheckResult {
    verdict: Verdict;
    confidence: Confidence;
    reasoning: string;
    indicators: string[];
}

interface TaskCardState {
    expanded: boolean;
    checking: boolean;
    aiResult: AICheckResult | null;
    aiError: string | null;
    aiExpanded: boolean;
}

const verdictConfig: Record<Verdict, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
    AUTHENTIC: {
        label: 'Authentic',
        color: '#4ade80',
        bg: 'rgba(74, 222, 128, 0.1)',
        icon: CheckCircle,
    },
    TEMPLATED: {
        label: 'Templated',
        color: '#facc15',
        bg: 'rgba(250, 204, 21, 0.1)',
        icon: AlertCircle,
    },
    AI_GENERATED: {
        label: 'AI Generated',
        color: '#f87171',
        bg: 'rgba(248, 113, 113, 0.1)',
        icon: ShieldAlert,
    },
};

const confidenceColor: Record<Confidence, string> = {
    HIGH: 'rgba(74, 222, 128, 0.7)',
    MEDIUM: 'rgba(250, 204, 21, 0.7)',
    LOW: 'rgba(156, 163, 175, 0.7)',
};

export default function TaskSearchPage() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<TaskResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cardStates, setCardStates] = useState<Record<string, TaskCardState>>({});

    const search = async (q: string) => {
        if (!q.trim()) return;
        setLoading(true);
        setError(null);
        setResults(null);
        setCardStates({});
        try {
            const res = await fetch(`/api/task-search?q=${encodeURIComponent(q.trim())}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Search failed');
            setResults(data.tasks);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') search(query);
    };

    const getCardState = (id: string): TaskCardState =>
        cardStates[id] ?? { expanded: false, checking: false, aiResult: null, aiError: null, aiExpanded: true };

    const updateCard = (id: string, patch: Partial<TaskCardState>) => {
        setCardStates(prev => ({
            ...prev,
            [id]: { ...getCardState(id), ...patch },
        }));
    };

    const runAICheck = async (task: TaskResult) => {
        updateCard(task.id, { checking: true, aiError: null, aiResult: null });
        try {
            const res = await fetch('/api/task-search/ai-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: task.content }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'AI check failed');
            updateCard(task.id, { aiResult: data, checking: false, aiExpanded: true });
        } catch (e: any) {
            updateCard(task.id, { aiError: e.message, checking: false });
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div style={{ padding: '32px', maxWidth: '900px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <h1 className="premium-gradient" style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '8px' }}>
                    Task Search
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                    Search tasks by creator name, email, or exact task ID. Run an AI check to detect AI-generated or templated content.
                </p>
            </div>

            {/* Search bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '32px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={16} style={{
                        position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                        color: 'rgba(255,255,255,0.35)', pointerEvents: 'none',
                    }} />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search by name, email, or task ID…"
                        style={{
                            width: '100%',
                            paddingLeft: '42px',
                            paddingRight: '16px',
                            paddingTop: '12px',
                            paddingBottom: '12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '10px',
                            color: 'white',
                            fontSize: '0.95rem',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>
                <button
                    onClick={() => search(query)}
                    disabled={loading || !query.trim()}
                    style={{
                        padding: '12px 24px',
                        borderRadius: '10px',
                        background: loading || !query.trim() ? 'rgba(255,255,255,0.05)' : 'rgba(99,102,241,0.8)',
                        color: loading || !query.trim() ? 'rgba(255,255,255,0.3)' : 'white',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                        border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.2s',
                    }}
                >
                    {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
                    Search
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    padding: '14px 16px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '10px',
                    color: '#fca5a5',
                    marginBottom: '24px',
                    fontSize: '0.9rem',
                }}>
                    {error}
                </div>
            )}

            {/* Empty state */}
            {results !== null && results.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: '0.95rem',
                }}>
                    No tasks found for "{query}"
                </div>
            )}

            {/* Results */}
            {results && results.length > 0 && (
                <div>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginBottom: '16px' }}>
                        {results.length} result{results.length !== 1 ? 's' : ''} found
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {results.map(task => {
                            const state = getCardState(task.id);
                            const isLong = task.content.length > 300;
                            const displayContent = isLong && !state.expanded
                                ? task.content.slice(0, 300) + '…'
                                : task.content;

                            return (
                                <div key={task.id} className="glass-card" style={{ padding: '20px' }}>
                                    {/* Card header */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontFamily: 'monospace',
                                                color: 'rgba(255,255,255,0.35)',
                                                background: 'rgba(255,255,255,0.06)',
                                                padding: '3px 8px',
                                                borderRadius: '5px',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}>
                                                {task.id}
                                            </span>
                                            {task.environment && (
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    color: 'rgba(99,102,241,0.9)',
                                                    background: 'rgba(99,102,241,0.12)',
                                                    padding: '3px 8px',
                                                    borderRadius: '5px',
                                                    border: '1px solid rgba(99,102,241,0.25)',
                                                }}>
                                                    {task.environment}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => runAICheck(task)}
                                            disabled={state.checking}
                                            style={{
                                                flexShrink: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '7px 14px',
                                                borderRadius: '8px',
                                                background: state.checking ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.15)',
                                                border: '1px solid rgba(139,92,246,0.3)',
                                                color: state.checking ? 'rgba(255,255,255,0.3)' : 'rgba(167,139,250,1)',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                cursor: state.checking ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {state.checking
                                                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                                : <Bot size={14} />
                                            }
                                            {state.checking ? 'Checking…' : 'AI Check'}
                                        </button>
                                    </div>

                                    {/* Creator info */}
                                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                        {task.createdByName && (
                                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                                                {task.createdByName}
                                            </span>
                                        )}
                                        {task.createdByEmail && (
                                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                                                {task.createdByEmail}
                                            </span>
                                        )}
                                        <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>
                                            {formatDate(task.createdAt)}
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <p style={{
                                        fontSize: '0.88rem',
                                        color: 'rgba(255,255,255,0.75)',
                                        lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap',
                                        margin: 0,
                                    }}>
                                        {displayContent}
                                    </p>
                                    {isLong && (
                                        <button
                                            onClick={() => updateCard(task.id, { expanded: !state.expanded })}
                                            style={{
                                                marginTop: '8px',
                                                background: 'none',
                                                border: 'none',
                                                color: 'rgba(99,102,241,0.8)',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                padding: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                            }}
                                        >
                                            {state.expanded
                                                ? <><ChevronUp size={13} /> Show less</>
                                                : <><ChevronDown size={13} /> Show more</>
                                            }
                                        </button>
                                    )}

                                    {/* AI check error */}
                                    {state.aiError && (
                                        <div style={{
                                            marginTop: '14px',
                                            padding: '10px 14px',
                                            background: 'rgba(239,68,68,0.08)',
                                            border: '1px solid rgba(239,68,68,0.25)',
                                            borderRadius: '8px',
                                            color: '#fca5a5',
                                            fontSize: '0.82rem',
                                        }}>
                                            AI check failed: {state.aiError}
                                        </div>
                                    )}

                                    {/* AI check result */}
                                    {state.aiResult && (() => {
                                        const cfg = verdictConfig[state.aiResult.verdict];
                                        const Icon = cfg.icon;
                                        return (
                                            <div style={{
                                                marginTop: '14px',
                                                padding: '14px 16px',
                                                background: cfg.bg,
                                                border: `1px solid ${cfg.color}40`,
                                                borderRadius: '10px',
                                            }}>
                                                {/* Result header */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: state.aiExpanded ? '12px' : 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <Icon size={16} color={cfg.color} />
                                                        <span style={{ color: cfg.color, fontWeight: 700, fontSize: '0.88rem' }}>
                                                            {cfg.label}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            color: confidenceColor[state.aiResult.confidence],
                                                            background: 'rgba(255,255,255,0.06)',
                                                            padding: '2px 7px',
                                                            borderRadius: '4px',
                                                            fontWeight: 600,
                                                        }}>
                                                            {state.aiResult.confidence} CONFIDENCE
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => updateCard(task.id, { aiExpanded: !state.aiExpanded })}
                                                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '2px' }}
                                                    >
                                                        {state.aiExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                    </button>
                                                </div>

                                                {state.aiExpanded && (
                                                    <>
                                                        {/* Reasoning */}
                                                        {state.aiResult.reasoning && (
                                                            <p style={{
                                                                fontSize: '0.83rem',
                                                                color: 'rgba(255,255,255,0.65)',
                                                                lineHeight: 1.55,
                                                                margin: '0 0 10px 0',
                                                            }}>
                                                                {state.aiResult.reasoning}
                                                            </p>
                                                        )}

                                                        {/* Indicators */}
                                                        {state.aiResult.indicators.length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                {state.aiResult.indicators.map((ind, i) => (
                                                                    <span key={i} style={{
                                                                        fontSize: '0.75rem',
                                                                        color: 'rgba(255,255,255,0.5)',
                                                                        background: 'rgba(255,255,255,0.06)',
                                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                                        padding: '3px 9px',
                                                                        borderRadius: '4px',
                                                                    }}>
                                                                        {ind}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
