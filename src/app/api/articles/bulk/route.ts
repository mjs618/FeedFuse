import { requireApiSession } from '@/server/domains/auth/services/session';
import { bulkPatchArticles } from '@/server/domains/articles/repositories/articlesRepo';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    isReadLater: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one patch field must be provided',
    path: ['body'],
  });

const bodySchema = z.object({
  articleIds: z.array(numericIdSchema).min(1, 'At least one article id is required'),
  patch: patchSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeUserOperationFailedLog(pool, {
        actionKey: 'article.bulkPatch',
        source: 'app/api/articles/bulk',
        err: error,
      });
      return fail(error);
    }

    const articleIds = Array.from(new Set(parsed.data.articleIds));
    const updatedCount = await bulkPatchArticles(pool, articleIds, parsed.data.patch);

    await writeUserOperationSucceededLog(pool, {
      actionKey: 'article.bulkPatch',
      source: 'app/api/articles/bulk',
      context: { count: articleIds.length, updatedCount, patch: parsed.data.patch },
    });

    return ok({
      articleIds,
      patch: parsed.data.patch,
      updatedCount,
    });
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'article.bulkPatch',
      source: 'app/api/articles/bulk',
      err,
    });
    return fail(err);
  }
}
