import type { FastifyReply, FastifyRequest } from 'fastify';

export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.status(status).send({
    code,
    message,
    requestId: request.id,
    ...(details === undefined ? {} : { details }),
  });
}

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}
