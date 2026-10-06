// PM2 apps for one environment on the organization box (docs/operations/runbook.md).
// Start with HOUSING_ENV=staging|production. deploy/deploy.sh reloads only the API; the two cron
// apps are started once at setup, because PM2 runs a cron app every time it starts it.
// Plan: docs/plans/2026-10-06-0925-migrate-c6-deploy-plan.md.
const ENVIRONMENTS = {
  staging: { port: 3101 },
  production: { port: 3201 },
};

const name = process.env.HOUSING_ENV;
if (!Object.hasOwn(ENVIRONMENTS, name ?? '')) {
  throw new Error(`HOUSING_ENV must be one of ${Object.keys(ENVIRONMENTS).join(', ')}; got ${name ?? 'nothing'}`);
}
const { port } = ENVIRONMENTS[name];
const root = `${process.env.HOUSING_ROOT ?? '/srv/housing'}/${name}`;
const etc = `${process.env.HOUSING_ETC ?? '/etc/housing'}/${name}`;
// The current release, through its symlink, so a reload or a cron run uses the newest one.
const cwd = `${root}/current`;
// Node loads the runtime secrets itself, so PM2 never stores them in its dump file.
const envFile = `--env-file=${etc}/api.env`;

module.exports = {
  apps: [
    {
      name: `housing-api-${name}`,
      cwd,
      script: 'server/dist/server.js',
      node_args: [envFile],
      exec_mode: 'fork',
      // One process: the rate limits are counted in memory.
      instances: 1,
      // Values here win over api.env (Node's --env-file never overrides), so the port and the
      // loopback binding always match nginx and deploy.sh.
      env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) },
      // Longer than the server's own 10-second forced exit (server/src/server.ts).
      kill_timeout: 15_000,
      max_memory_restart: '400M',
    },
    {
      name: `housing-sweep-${name}`,
      cwd,
      script: 'server/dist/cli/files-sweep.js',
      node_args: [envFile],
      env: { NODE_ENV: 'production' },
      cron_restart: '30 3 * * *',
      autorestart: false,
    },
    {
      name: `housing-backup-${name}`,
      cwd,
      script: 'deploy/backup.sh',
      interpreter: 'bash',
      args: [name],
      cron_restart: '15 2 * * *',
      autorestart: false,
    },
  ],
};
