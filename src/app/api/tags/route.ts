import { listTagsWithVisibleArticleCounts } from '@/server/domains/articles/repositories/articleTagsRepo';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const tags = await listTagsWithVisibleArticleCounts(getPool());
    return ok({ tags });
  } catch (err) {
    return fail(err);
  }
}
