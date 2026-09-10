import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { AppContext } from './context';
import { registerApiRoutes } from './routes/api';
import { registerArtifactRoutes } from './routes/artifacts';
import { registerCiRoutes } from './routes/ci';

export interface BuildAppOptions {
  ctx: AppContext;
  /** Serve the built React app from this directory (app/dist). */
  staticDir?: string | null;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ? { level: process.env.QA_DASHBOARD_LOG_LEVEL ?? 'info' } : false,
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });

  app.decorate('ctx', options.ctx);

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    const e = err as { statusCode?: number; message?: string; stack?: string };
    const status = e.statusCode ?? 500;
    if (status >= 500) options.ctx.logger.error(`${req.method} ${req.url} → ${e.message ?? String(err)}`, { stack: e.stack });
    reply.status(status).send({ error: status >= 500 ? 'Internal server error' : (e.message ?? 'Error') });
  });

  await app.register(registerApiRoutes, { prefix: '/api' });
  await app.register(registerArtifactRoutes, { prefix: '/api/artifacts' });
  await app.register(registerCiRoutes, { prefix: '/api/ci' });

  const staticDir = options.staticDir;
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: staticDir, prefix: '/', index: ['index.html'], maxAge: '1h', immutable: false });
    // SPA fallback: any unknown non-API GET renders the app shell (client-side routing).
    app.setNotFoundHandler(async (req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && (req.headers.accept ?? '').includes('text/html')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  } else {
    app.get('/', async () => ({
      name: 'qa-dashboard',
      message: 'Frontend build not found. Run "npm run build" in tools/qa-dashboard or use "npm run dashboard" which builds automatically.',
    }));
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
