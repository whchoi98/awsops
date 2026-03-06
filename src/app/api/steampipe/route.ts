import { NextRequest, NextResponse } from 'next/server';
import { batchQuery, clearCache } from '@/lib/steampipe';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bustCache = searchParams.get('bustCache') === 'true';

    const body = await request.json();
    const { queries } = body as { queries: Record<string, string> };

    if (!queries || typeof queries !== 'object') {
      return NextResponse.json(
        { error: 'Request body must contain a "queries" object' },
        { status: 400 }
      );
    }

    if (bustCache) {
      clearCache();
    }

    const results = await batchQuery(queries, bustCache);
    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
