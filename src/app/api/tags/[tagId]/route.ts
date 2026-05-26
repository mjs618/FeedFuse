import { z } from 'zod';
import { TAG_COLOR_PRESETS } from '@/lib/reader/tagColors';
import { requireApiSession } from '@/server/domains/auth/services/session';
import {
  deleteArticleTag,
  TAG_NAME_MAX_LENGTH,
  updateArticleTag,
} from '@/server/domains/articles/repositories/articleTagsRepo';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';
import { ConflictError, NotFoundError, ValidationError } from '@/server/infra/http/errors';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  tagId: z.string().uuid(),
});

const patchBodySchema = z
  .object({
    name: z
      .string()
      .transform((value) => value.trim().replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(1, 'Tag name is required')
          .max(TAG_NAME_MAX_LENGTH, 'Tag name is too long'),
      )
      .optional(),
    color: z.enum(TAG_COLOR_PRESETS).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
  });

const patchOperationSource = 'app/api/tags/[tagId]';
const deleteOperationSource = 'app/api/tags/[tagId]';

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

async function writeTagUpdateFailure(err: unknown, context?: Record<string, unknown>) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'tag.update',
    source: patchOperationSource,
    err,
    context,
  });
}

async function writeTagDeleteFailure(err: unknown, context?: Record<string, unknown>) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'tag.delete',
    source: deleteOperationSource,
    err,
    context,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ tagId: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(params.error));
      await writeTagUpdateFailure(error);
      return fail(error);
    }

    const json = await request.json().catch(() => null);
    const body = patchBodySchema.safeParse(json);
    if (!body.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(body.error));
      await writeTagUpdateFailure(error, { tagId: params.data.tagId });
      return fail(error);
    }

    const pool = getPool();
    const tag = await updateArticleTag(pool, params.data.tagId, body.data);
    if (!tag) {
      const error = new NotFoundError('Tag not found');
      await writeTagUpdateFailure(error, { tagId: params.data.tagId });
      return fail(error);
    }

    await writeUserOperationSucceededLog(pool, {
      actionKey: 'tag.update',
      source: patchOperationSource,
      context: { tagId: tag.id, name: tag.name },
    });

    return ok({ tag });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const error = new ConflictError('Tag already exists', { name: 'duplicate' });
      await writeTagUpdateFailure(error);
      return fail(error);
    }

    await writeTagUpdateFailure(err);
    return fail(err);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ tagId: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(params.error));
      await writeTagDeleteFailure(error);
      return fail(error);
    }

    const pool = getPool();
    const result = await deleteArticleTag(pool, params.data.tagId);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'tag.delete',
      source: deleteOperationSource,
      context: {
        tagId: params.data.tagId,
        affectedArticleCount: result.affectedArticleCount,
      },
    });

    return ok(result);
  } catch (err) {
    await writeTagDeleteFailure(err);
    return fail(err);
  }
}
