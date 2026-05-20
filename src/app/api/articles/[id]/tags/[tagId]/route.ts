import { detachArticleTag } from '@/server/domains/articles/repositories/articleTagsRepo';
import { requireApiSession } from '@/server/domains/auth/services/session';
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

const paramsSchema = z.object({
  id: numericIdSchema,
  tagId: z.string().uuid(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; tagId: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();

  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(params.error)));
    }

    const result = await detachArticleTag(pool, params.data.id, params.data.tagId);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'articleTag.remove',
      source: 'app/api/articles/[id]/tags/[tagId]',
      context: { articleId: params.data.id, tagId: params.data.tagId },
    });

    return ok(result);
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'articleTag.remove',
      source: 'app/api/articles/[id]/tags/[tagId]',
      err,
    });
    return fail(err);
  }
}
