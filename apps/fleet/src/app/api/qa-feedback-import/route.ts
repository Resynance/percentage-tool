import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'
import { NextResponse } from 'next/server'
import { parse } from 'csv-parse/sync'
import { ERROR_IDS } from '@/constants/errorIds'

export const dynamic = 'force-dynamic'

interface CSVRow {
    rating_id: string;
    feedback_id: string;
    eval_task_id?: string;
    is_helpful: string;
    is_dispute?: string;
    dispute_status?: string;
    dispute_reason?: string;
    rater_name?: string;
    rater_email: string;
    qa_name?: string;
    qa_email: string;
    rated_at: string;
    resolved_at?: string;
    resolved_by_name?: string;
    resolution_reason?: string;
}

interface ImportSummary {
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
}

// POST: Import QA feedback ratings from CSV
export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.warn('[QA Feedback Import API] Unauthorized access attempt:', {
            errorId: ERROR_IDS.AUTH_UNAUTHORIZED,
            timestamp: new Date().toISOString()
        })
        return NextResponse.json({
            error: 'Unauthorized',
            errorId: ERROR_IDS.AUTH_UNAUTHORIZED
        }, { status: 401 })
    }

    // Check if user is ADMIN (only admins can import)
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError) {
        console.error('[QA Feedback Import API] Profile query error:', {
            errorId: ERROR_IDS.DB_QUERY_FAILED,
            userId: user.id,
            error: profileError.message,
            code: profileError.code
        })
        return NextResponse.json({
            error: 'Failed to verify permissions',
            errorId: ERROR_IDS.DB_QUERY_FAILED
        }, { status: 500 })
    }

    if (!profile || profile.role !== 'ADMIN') {
        console.warn('[QA Feedback Import API] Forbidden access attempt:', {
            errorId: ERROR_IDS.AUTH_FORBIDDEN,
            userId: user.id,
            userRole: profile?.role || 'NONE'
        })
        return NextResponse.json({
            error: 'Forbidden - Admin access required',
            errorId: ERROR_IDS.AUTH_FORBIDDEN
        }, { status: 403 })
    }

    try {
        const formData = await req.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({
                error: 'No file provided',
                errorId: ERROR_IDS.INVALID_INPUT
            }, { status: 400 })
        }

        // Read file content
        const fileContent = await file.text()

        // Parse CSV
        let records: CSVRow[]
        try {
            records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            })
        } catch (parseError) {
            console.error('[QA Feedback Import API] CSV parsing error:', {
                errorId: ERROR_IDS.INVALID_INPUT,
                error: parseError instanceof Error ? parseError.message : String(parseError)
            })
            return NextResponse.json({
                error: 'Failed to parse CSV file',
                errorId: ERROR_IDS.INVALID_INPUT
            }, { status: 400 })
        }

        if (records.length === 0) {
            return NextResponse.json({
                error: 'CSV file is empty',
                errorId: ERROR_IDS.INVALID_INPUT
            }, { status: 400 })
        }

        const summary: ImportSummary = {
            imported: 0,
            updated: 0,
            skipped: 0,
            errors: []
        }

        // Process in batches of 500
        const BATCH_SIZE = 500
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE)

            for (const row of batch) {
                try {
                    // Validate required fields
                    if (!row.rating_id || !row.is_helpful || !row.rated_at || !row.rater_email || !row.qa_email) {
                        summary.errors.push(`Row ${i + batch.indexOf(row) + 2}: Missing required fields (rating_id, is_helpful, rated_at, rater_email, or qa_email)`)
                        summary.skipped++
                        continue
                    }

                    // Parse dates
                    let ratedAt: Date
                    try {
                        ratedAt = new Date(row.rated_at)
                        if (isNaN(ratedAt.getTime())) {
                            throw new Error('Invalid date')
                        }
                    } catch {
                        summary.errors.push(`Row ${i + batch.indexOf(row) + 2}: Invalid rated_at date format`)
                        summary.skipped++
                        continue
                    }

                    let resolvedAt: Date | null = null
                    if (row.resolved_at) {
                        try {
                            resolvedAt = new Date(row.resolved_at)
                            if (isNaN(resolvedAt.getTime())) {
                                resolvedAt = null
                            }
                        } catch {
                            // Skip invalid resolved_at dates
                        }
                    }

                    // Parse boolean is_helpful
                    const isHelpful = row.is_helpful.toLowerCase() === 'true' || row.is_helpful === '1'

                    // Check if eval_task_id exists in database (if provided)
                    let evalTaskId: string | null = null
                    if (row.eval_task_id) {
                        const taskExists = await prisma.dataRecord.findUnique({
                            where: { id: row.eval_task_id },
                            select: { id: true }
                        })
                        if (taskExists) {
                            evalTaskId = row.eval_task_id
                        }
                    }

                    // Check if rating already exists
                    const existing = await prisma.qAFeedbackRating.findUnique({
                        where: { ratingId: row.rating_id }
                    })

                    if (existing) {
                        // Update existing record
                        await prisma.qAFeedbackRating.update({
                            where: { ratingId: row.rating_id },
                            data: {
                                feedbackId: row.feedback_id,
                                evalTaskId: evalTaskId,
                                isHelpful,
                                isDispute: row.is_dispute?.toLowerCase() === 'true' || row.is_dispute === '1' || false,
                                disputeStatus: row.dispute_status || null,
                                disputeReason: row.dispute_reason || null,
                                raterName: row.rater_name || null,
                                raterEmail: row.rater_email,
                                qaName: row.qa_name || null,
                                qaEmail: row.qa_email,
                                ratedAt,
                                resolvedAt,
                                resolvedByName: row.resolved_by_name || null,
                                resolutionReason: row.resolution_reason || null,
                            }
                        })
                        summary.updated++
                    } else {
                        // Insert new record
                        await prisma.qAFeedbackRating.create({
                            data: {
                                ratingId: row.rating_id,
                                feedbackId: row.feedback_id,
                                evalTaskId: evalTaskId,
                                isHelpful,
                                isDispute: row.is_dispute?.toLowerCase() === 'true' || row.is_dispute === '1' || false,
                                disputeStatus: row.dispute_status || null,
                                disputeReason: row.dispute_reason || null,
                                raterName: row.rater_name || null,
                                raterEmail: row.rater_email,
                                qaName: row.qa_name || null,
                                qaEmail: row.qa_email,
                                ratedAt,
                                resolvedAt,
                                resolvedByName: row.resolved_by_name || null,
                                resolutionReason: row.resolution_reason || null,
                            }
                        })
                        summary.imported++
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error)
                    summary.errors.push(`Row ${i + batch.indexOf(row) + 2}: ${errorMsg}`)
                    summary.skipped++
                }
            }
        }

        console.log('[QA Feedback Import API] Import completed:', {
            userId: user.id,
            totalRows: records.length,
            imported: summary.imported,
            updated: summary.updated,
            skipped: summary.skipped,
            errorCount: summary.errors.length
        })

        return NextResponse.json({
            success: true,
            summary
        })
    } catch (error) {
        console.error('[QA Feedback Import API] Unexpected error:', {
            errorId: ERROR_IDS.SYSTEM_ERROR,
            userId: user?.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        })
        return NextResponse.json({
            error: 'An unexpected error occurred during import',
            errorId: ERROR_IDS.SYSTEM_ERROR
        }, { status: 500 })
    }
}
