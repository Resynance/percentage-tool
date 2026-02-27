/**
 * DEPRECATED: Projects have been removed in favour of environment-based organisation.
 * This route returns 410 Gone for all methods.
 */
import { NextResponse } from 'next/server';

const gone = () => NextResponse.json(
    { error: 'Projects have been removed. Use environment-based filtering instead.' },
    { status: 410 }
);

export async function GET() { return gone(); }
export async function POST() { return gone(); }
export async function DELETE() { return gone(); }
export async function PATCH() { return gone(); }
