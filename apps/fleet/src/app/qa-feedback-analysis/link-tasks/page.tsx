'use client'

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function LinkTasksPage() {
    const router = useRouter()
    const [isLinking, setIsLinking] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const handleLink = async () => {
        setIsLinking(true)
        setError(null)
        setResult(null)

        try {
            const response = await fetch('/api/qa-feedback-analysis/link-ratings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.error || 'Failed to link ratings')
            } else {
                setResult(data.summary)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLinking(false)
        }
    }

    return (
        <div className="page-container">
            <div className="mb-8">
                <button
                    onClick={() => router.push('/qa-feedback-analysis')}
                    className="btn-secondary mb-4 inline-flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to QA Feedback Analysis
                </button>

                <h1 className="page-title">
                    <span className="gradient-text">Link Ratings to Tasks</span>
                </h1>
                <p className="text-[var(--text-secondary)] mt-2">
                    This will link existing QA feedback ratings to their corresponding tasks in the database.
                </p>
            </div>

            <div className="glass-card max-w-2xl">
                <h2 className="text-xl font-semibold mb-4">Link Existing Ratings</h2>
                <p className="text-[var(--text-secondary)] mb-6">
                    This process will:
                </p>
                <ul className="list-disc list-inside text-[var(--text-secondary)] mb-6 space-y-2">
                    <li>Find all ratings without task links</li>
                    <li>Match each rating's feedback to a feedback record</li>
                    <li>Find the parent task for each feedback</li>
                    <li>Link the rating to the task</li>
                </ul>

                <button
                    onClick={handleLink}
                    disabled={isLinking}
                    className="btn-primary"
                    style={{
                        opacity: isLinking ? 0.6 : 1,
                        cursor: isLinking ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isLinking ? 'Linking...' : 'Start Linking Process'}
                </button>

                {isLinking && (
                    <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                            <p className="text-blue-400">Processing ratings... This may take a minute.</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <p className="text-red-400 font-semibold">Error</p>
                        <p className="text-red-300 mt-1">{error}</p>
                    </div>
                )}

                {result && (
                    <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <p className="text-green-400 font-semibold mb-3">Linking Complete!</p>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[var(--text-secondary)]">Total ratings processed:</span>
                                <span className="text-white font-medium">{result.total}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--text-secondary)]">Successfully linked:</span>
                                <span className="text-green-400 font-medium">{result.linked}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--text-secondary)]">Not found:</span>
                                <span className="text-orange-400 font-medium">{result.notFound}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--text-secondary)]">Still unlinked:</span>
                                <span className="text-red-400 font-medium">{result.stillUnlinked}</span>
                            </div>
                        </div>

                        {result.errors && result.errors.length > 0 && (
                            <div className="mt-4 p-3 bg-[var(--bg-secondary)] rounded">
                                <p className="text-sm font-medium mb-2">Sample Errors:</p>
                                <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                                    {result.errors.map((err: string, i: number) => (
                                        <li key={i}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="mt-4">
                            <button
                                onClick={() => router.push('/qa-feedback-analysis')}
                                className="btn-primary"
                            >
                                Go to QA Feedback Analysis
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
