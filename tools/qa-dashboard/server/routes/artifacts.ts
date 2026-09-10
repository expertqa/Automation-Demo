import fs from 'node:fs';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { getArtifact } from '../services/tests';
import type { TraceOpenResponse } from '../../shared/api';

/**
 * Artifact streaming. Files are located ONLY through database rows; the store
 * verifies the resolved path stays inside the artifact root.
 */
export const registerArtifactRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  const send = async (idParam: string, req: { headers: Record<string, string | string[] | undefined>; method: string }, reply: FastifyReply, download: boolean) => {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'invalid artifact id' });
    const artifact = getArtifact(ctx, id);
    if (!artifact) return reply.code(404).send({ error: 'artifact not found' });
    let abs: string;
    try {
      abs = ctx.store.resolve(artifact.relativePath);
    } catch {
      return reply.code(400).send({ error: 'invalid artifact path' });
    }
    if (!fs.existsSync(abs)) return reply.code(404).send({ error: 'artifact file is missing on disk' });
    const stat = fs.statSync(abs);
    const fileName = artifact.relativePath.split('/').pop() ?? 'artifact';

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    // Allow the hosted Playwright trace viewer (trace.playwright.dev) to fetch traces from this local server.
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Content-Type', artifact.contentType || 'application/octet-stream');
    reply.header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);

    const range = req.headers.range;
    if (typeof range === 'string' && /^bytes=\d*-\d*$/.test(range)) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      const start = startStr ? Number(startStr) : 0;
      const end = endStr ? Math.min(Number(endStr), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        reply.header('Content-Range', `bytes */${stat.size}`);
        return reply.code(416).send();
      }
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      reply.header('Content-Length', end - start + 1);
      if (req.method === 'HEAD') return reply.send();
      return reply.send(fs.createReadStream(abs, { start, end }));
    }
    reply.header('Content-Length', stat.size);
    if (req.method === 'HEAD') return reply.send();
    return reply.send(fs.createReadStream(abs));
  };

  // Fastify registers HEAD handlers for GET routes automatically (exposeHeadRoutes).
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => send(req.params.id, req, reply, false));
  app.get<{ Params: { id: string } }>('/:id/download', async (req, reply) => send(req.params.id, req, reply, true));
  app.get<{ Params: { id: string; name: string } }>('/:id/:name', async (req, reply) => send(req.params.id, req, reply, false));
  app.options('/*', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Range');
    return reply.code(204).send();
  });

  /** Launch the official Playwright Trace Viewer for a stored trace artifact. */
  app.post<{ Params: { id: string } }>('/:id/open-trace', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'invalid artifact id' });
    const artifact = getArtifact(ctx, id);
    if (!artifact) return reply.code(404).send({ error: 'artifact not found' });
    if (artifact.kind !== 'trace') return reply.code(400).send({ error: 'artifact is not a trace' });
    const result = await ctx.trace.open(artifact.relativePath);
    const body: TraceOpenResponse = { ok: result.ok, mode: 'launched', message: result.message };
    return reply.code(result.ok ? 200 : 503).send(body);
  });
};
