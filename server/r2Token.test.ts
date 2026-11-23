import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const folder = new URL('../.github/workflows/', import.meta.url);

/** A workflow's jobs, each as its text, its whole-line comments left out. */
function jobsOf(workflow: string): string[] {
  const jobs = workflow.replace(/^ *#.*\n/gm, '').split(/^jobs:\n/m)[1] ?? '';
  return jobs.split(/\n(?= {2}[\w-]+:\n)/);
}

test('in each workflow that uploads to R2, one job holds the Cloudflare token, and it installs and runs no one else’s code', () => {
  const workflows = readdirSync(folder).map((name) => [name, readFileSync(new URL(name, folder), 'utf8')] as const);
  const publishing = workflows.filter(([, workflow]) => workflow.includes('tools/r2.py upload'));
  assert.ok(publishing.length > 0, 'some workflow publishes to R2');
  for (const [name, workflow] of publishing) {
    const holders = jobsOf(workflow).filter((job) => job.includes('secrets.CLOUDFLARE_TOKEN'));
    assert.equal(holders.length, 1, name);
    for (const job of holders) assert.doesNotMatch(job, /pip install|npm ci|apt-get|bpy|ffmpeg|curl/, name);
  }
});
