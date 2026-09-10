import type { FastifyPluginAsync } from 'fastify';

const REPO = 'expertqa/Automation-Demo';
const WORKFLOW_FILE = 'playwright.yml';
const REF = 'main';

interface RunCiBody {
  testFile?: string;
  grep?: string;
  label: string;
  headed?: boolean;
}

/**
 * Triggers the Playwright GitHub Actions workflow via `workflow_dispatch`.
 * The dispatch API does not return a run id, so the caller is pointed at the
 * workflow's run list instead.
 */
export const registerCiRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.post<{ Body: RunCiBody }>('/run', async (req, reply) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return reply.code(400).send({
        error: 'GITHUB_TOKEN not configured — see README (## CI triggers) for the required PAT scopes and where to create one.',
      });
    }

    const { testFile, grep, label, headed } = req.body ?? ({} as RunCiBody);
    if (!label || typeof label !== 'string') {
      return reply.code(400).send({ error: 'label is required' });
    }
    if (testFile && grep) {
      return reply.code(400).send({ error: 'pass only one of testFile or grep, not both' });
    }

    const inputs: Record<string, string> = {};
    if (testFile) inputs.test_file = testFile;
    if (grep) inputs.grep = grep;
    if (headed) inputs.headed = 'true';

    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: REF, inputs }),
      });

      if (res.status === 204) {
        ctx.logger.info(`triggered CI run: ${label}${testFile ? ` (file: ${testFile})` : ''}${grep ? ` (grep: ${grep})` : ''}${headed ? ' [headed]' : ''}`);
        return {
          ok: true,
          actionsUrl: `https://github.com/${REPO}/actions/workflows/${WORKFLOW_FILE}`,
        };
      }

      const body = await res.text().catch(() => '');
      ctx.logger.error(`GitHub dispatch failed: ${res.status} ${body}`);
      return reply.code(502).send({ error: `GitHub API returned ${res.status}: ${body || res.statusText}` });
    } catch (err) {
      ctx.logger.error(`GitHub dispatch request failed: ${(err as Error).message}`);
      return reply.code(502).send({ error: `Could not reach GitHub: ${(err as Error).message}` });
    }
  });
};
