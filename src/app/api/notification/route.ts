import { NextRequest, NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/app-config';
import {
  syncMailingList,
  listSubscriptions,
  ensureTopic,
  publishNotification,
} from '@/lib/sns-notification';

// GET: list subscriptions + notification settings
// 구독 목록 + 알림 설정 조회
export async function GET() {
  const config = getConfig();
  let subscriptions: Array<{ email: string; arn: string; status: string }> = [];

  if (config.snsTopicArn) {
    try {
      subscriptions = await listSubscriptions();
    } catch {
      // SNS not available
    }
  }

  return NextResponse.json({
    enabled: config.notificationEnabled || false,
    emails: config.notificationEmails || [],
    topicArn: config.snsTopicArn || null,
    subscriptions,
  });
}

// POST: manage mailing list and notification settings
// 메일링 리스트 및 알림 설정 관리
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'sync-emails') {
    // Sync mailing list: add/remove subscriptions
    // 메일링 리스트 동기화: 구독 추가/제거
    const { emails } = body as { emails: string[]; action: string };
    if (!Array.isArray(emails)) {
      return NextResponse.json({ error: 'emails must be an array' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = emails.filter(e => emailRegex.test(e.trim()));
    if (valid.length === 0 && emails.length > 0) {
      return NextResponse.json({ error: 'No valid email addresses' }, { status: 400 });
    }

    try {
      await ensureTopic();
      const result = await syncMailingList(valid);
      return NextResponse.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SNS error';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === 'toggle') {
    // Toggle notification on/off
    // 알림 활성화/비활성화 토글
    const { enabled } = body as { enabled: boolean; action: string };
    await saveConfig({ notificationEnabled: !!enabled });
    return NextResponse.json({ enabled: !!enabled });
  }

  if (action === 'test') {
    // Send test notification
    // 테스트 알림 발송
    try {
      await ensureTopic();
      const sent = await publishNotification(
        '[AWSops] Test Notification',
        'This is a test notification from AWSops.\nAWSops에서 보낸 테스트 알림입니다.\n\n정상적으로 수신되었다면 알림 설정이 올바르게 구성된 것입니다.'
      );
      return NextResponse.json({ sent });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SNS error';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
