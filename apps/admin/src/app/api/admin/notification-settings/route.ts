import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const profile = await prisma.profile.findUnique({
      where: { id: user.id }
    });

    if (!profile || profile.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all notification settings for all admin users
    const settings = await prisma.notificationSetting.findMany({
      select: {
        id: true,
        userId: true,
        notificationType: true,
        enabled: true
      }
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Failed to fetch notification settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const profile = await prisma.profile.findUnique({
      where: { id: user.id }
    });

    if (!profile || profile.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { config } = body;

    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Get all admin users
    const admins = await prisma.profile.findMany({
      where: { role: 'ADMIN' },
      select: { id: true }
    });

    const adminIds = admins.map(a => a.id);

    // For each notification type and admin combination, upsert the setting
    const promises: Promise<any>[] = [];

    Object.entries(config).forEach(([notificationType, enabledAdminIds]) => {
      adminIds.forEach(adminId => {
        const enabled = (enabledAdminIds as string[]).includes(adminId);

        promises.push(
          prisma.notificationSetting.upsert({
            where: {
              userId_notificationType: {
                userId: adminId,
                notificationType
              }
            },
            create: {
              userId: adminId,
              notificationType,
              enabled
            },
            update: {
              enabled
            }
          })
        );
      });
    });

    await Promise.all(promises);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save notification settings:', error);
    return NextResponse.json(
      { error: 'Failed to save notification settings' },
      { status: 500 }
    );
  }
}
