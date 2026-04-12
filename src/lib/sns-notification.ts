import {
  SNSClient,
  CreateTopicCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  PublishCommand,
  ListSubscriptionsByTopicCommand,
} from '@aws-sdk/client-sns';
import { getConfig, saveConfig } from '@/lib/app-config';

const REGION = 'ap-northeast-2';
const TOPIC_NAME = 'awsops-notifications';

let snsClient: SNSClient | null = null;

function getClient(): SNSClient {
  if (!snsClient) snsClient = new SNSClient({ region: REGION });
  return snsClient;
}

// Ensure SNS topic exists; create if missing, save ARN to config
// SNS 토픽 존재 확인, 없으면 생성 후 config에 ARN 저장
export async function ensureTopic(): Promise<string> {
  const config = getConfig();
  if (config.snsTopicArn) return config.snsTopicArn;

  const client = getClient();
  const resp = await client.send(new CreateTopicCommand({ Name: TOPIC_NAME }));
  const arn = resp.TopicArn!;
  await saveConfig({ snsTopicArn: arn });
  console.log(`[SNS] Created topic: ${arn}`);
  return arn;
}

// Subscribe an email to the topic
// 이메일을 토픽에 구독 추가
export async function subscribeEmail(email: string): Promise<string | null> {
  const topicArn = await ensureTopic();
  const client = getClient();
  const resp = await client.send(new SubscribeCommand({
    TopicArn: topicArn,
    Protocol: 'email',
    Endpoint: email,
  }));
  console.log(`[SNS] Subscribed ${email} → ${resp.SubscriptionArn}`);
  return resp.SubscriptionArn || null;
}

// Unsubscribe by subscription ARN
// 구독 ARN으로 구독 해제
export async function unsubscribeByArn(subscriptionArn: string): Promise<void> {
  const client = getClient();
  await client.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
  console.log(`[SNS] Unsubscribed: ${subscriptionArn}`);
}

// List current subscriptions for the topic
// 토픽의 현재 구독 목록 조회
export async function listSubscriptions(): Promise<Array<{ email: string; arn: string; status: string }>> {
  const config = getConfig();
  if (!config.snsTopicArn) return [];

  const client = getClient();
  const resp = await client.send(new ListSubscriptionsByTopicCommand({
    TopicArn: config.snsTopicArn,
  }));

  return (resp.Subscriptions || [])
    .filter(s => s.Protocol === 'email')
    .map(s => ({
      email: s.Endpoint || '',
      arn: s.SubscriptionArn || '',
      status: s.SubscriptionArn === 'PendingConfirmation' ? 'pending' : 'confirmed',
    }));
}

// Sync mailing list: add missing emails, remove extras
// 메일링 리스트 동기화: 누락된 이메일 추가, 불필요한 이메일 제거
export async function syncMailingList(emails: string[]): Promise<{ added: string[]; removed: string[]; existing: string[] }> {
  const current = await listSubscriptions();
  const currentEmails = new Set(current.map(s => s.email.toLowerCase()));
  const targetEmails = new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean));

  const added: string[] = [];
  const removed: string[] = [];
  const existing: string[] = [];

  // Subscribe new emails
  for (const email of Array.from(targetEmails)) {
    if (!currentEmails.has(email)) {
      await subscribeEmail(email);
      added.push(email);
    } else {
      existing.push(email);
    }
  }

  // Unsubscribe removed emails
  for (const sub of current) {
    if (!targetEmails.has(sub.email.toLowerCase()) && sub.arn !== 'PendingConfirmation') {
      try {
        await unsubscribeByArn(sub.arn);
        removed.push(sub.email);
      } catch {
        // Pending subscriptions can't be unsubscribed
      }
    }
  }

  // Save to config
  await saveConfig({ notificationEmails: emails });

  return { added, removed, existing };
}

// Publish notification message to the topic
// 토픽에 알림 메시지 발행
export async function publishNotification(
  subject: string,
  message: string
): Promise<boolean> {
  const config = getConfig();
  if (!config.snsTopicArn || !config.notificationEnabled) return false;

  try {
    const client = getClient();
    await client.send(new PublishCommand({
      TopicArn: config.snsTopicArn,
      Subject: subject.slice(0, 100), // SNS subject max 100 chars
      Message: message,
    }));
    console.log(`[SNS] Published: ${subject}`);
    return true;
  } catch (err) {
    console.error('[SNS] Publish failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// Send report completion notification
// 리포트 완료 알림 발송
export async function notifyReportCompleted(opts: {
  reportId: string;
  accountAlias?: string;
  executiveSummary?: string;
  pillarScores?: Record<string, string>;
  downloadUrlDocx?: string;
  downloadUrlMd?: string;
}): Promise<boolean> {
  const { reportId, accountAlias, executiveSummary, pillarScores, downloadUrlDocx, downloadUrlMd } = opts;
  const account = accountAlias || 'Default';
  const subject = `[AWSops] 종합진단 리포트 완료 — ${account}`;

  const lines: string[] = [
    `AWSops 종합진단 리포트가 완료되었습니다.`,
    ``,
    `Account: ${account}`,
    `Report ID: ${reportId}`,
    `Generated: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    ``,
  ];

  if (executiveSummary) {
    lines.push(`── Executive Summary ──`);
    lines.push(executiveSummary.slice(0, 500));
    lines.push(``);
  }

  if (pillarScores && Object.keys(pillarScores).length > 0) {
    lines.push(`── Well-Architected Pillar Scores ──`);
    for (const [pillar, score] of Object.entries(pillarScores)) {
      lines.push(`  ${pillar}: ${score}`);
    }
    lines.push(``);
  }

  if (downloadUrlDocx) {
    lines.push(`Download DOCX: ${downloadUrlDocx}`);
  }
  if (downloadUrlMd) {
    lines.push(`Download MD: ${downloadUrlMd}`);
  }
  lines.push(``);
  lines.push(`※ 다운로드 링크는 1시간 유효합니다.`);
  lines.push(`※ AWSops 대시보드에서 이전 리포트를 확인할 수 있습니다.`);

  return publishNotification(subject, lines.join('\n'));
}

// Send benchmark completion notification
// 벤치마크 완료 알림 발송
export async function notifyBenchmarkCompleted(opts: {
  benchmark: string;
  accountAlias?: string;
  totalControls?: number;
  alarmCount?: number;
  okCount?: number;
}): Promise<boolean> {
  const { benchmark, accountAlias, totalControls, alarmCount, okCount } = opts;
  const account = accountAlias || 'Default';
  const subject = `[AWSops] CIS Benchmark 완료 — ${benchmark}`;

  const lines: string[] = [
    `CIS Benchmark 실행이 완료되었습니다.`,
    ``,
    `Benchmark: ${benchmark}`,
    `Account: ${account}`,
    `Completed: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    ``,
  ];

  if (totalControls !== undefined) {
    lines.push(`── Results ──`);
    lines.push(`  Total Controls: ${totalControls}`);
    if (okCount !== undefined) lines.push(`  ✅ OK: ${okCount}`);
    if (alarmCount !== undefined) lines.push(`  🚨 ALARM: ${alarmCount}`);
    lines.push(``);
  }

  lines.push(`AWSops 대시보드의 Compliance 페이지에서 상세 결과를 확인할 수 있습니다.`);

  return publishNotification(subject, lines.join('\n'));
}
