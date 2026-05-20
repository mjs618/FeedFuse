import { attachArticleTag, TAG_NAME_MAX_LENGTH } from '@/server/domains/articles/repositories/articleTagsRepo';
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

const paramsSchema = z.object({ id: numericIdSchema });
const bodySchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(1, 'Tag name is required')
        .max(TAG_NAME_MAX_LENGTH, 'Tag name is too long'),
    ),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  const pool = getPool();

  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(params.error)));
    }

    const json = await request.json().catch(() => null);
    const body = bodySchema.safeParse(json);
    if (!body.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(body.error));
      await writeUserOperationFailedLog(pool, {
        actionKey: 'articleTag.add',
        source: 'app/api/articles/[id]/tags',
        err: error,
      });
      return fail(error);
    }

    const tag = await attachArticleTag(pool, params.data.id, body.data.name);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'articleTag.add',
      source: 'app/api/articles/[id]/tags',
      context: { articleId: params.data.id, tagId: tag.id, name: tag.name },
    });

    return ok({ tag });
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'articleTag.add',
      source: 'app/api/articles/[id]/tags',
      err,
    });
    return fail(err);
  }
}
