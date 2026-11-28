"""The figures workflow's run, on one machine of the owner's: the jobs a GitHub run left undrawn drawn here, side by side,
then every job laid in and published, so a large redraw costs no Actions minutes. Run from the repository's root with
the Python that has Blender's module (Sprite Forge, "Running it"), GitHub's `gh` logged in, and CLOUDFLARE_API_TOKEN
set for the publish:

    python -I tools/forge_figures_local.py --run <figures run id> [--procs 4] [--threads 4] [--no-publish]

It draws the moves `tools/forge/figures-request.txt` asks for (its first line), the first person's flask too, and
leaves the new manifest in content/forge/renders.json for a commit."""
import argparse
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import forge_publish  # noqa: E402

FORGE = os.path.join(HERE, 'forge')
REPO = 'webdev689/no-shores-source'


def draw(job, work, threads):
    """One job as the workflow's render step draws it, into the folder its artifact would unpack to."""
    out = os.path.join(work, f"figures-{job['name']}")
    os.makedirs(out, exist_ok=True)
    env = {**os.environ, 'FORGE_LOOKS': os.path.join(out, 'forgeLooks.json'), 'FORGE_THREADS': str(threads)}
    with open(os.path.join(work, f"{job['name']}.log"), 'w') as log:
        code = subprocess.run([sys.executable, '-I', 'tools/sprite-forge/layers.py', '--set', job['set'], '--body',
                               job['body'], '--anims', job['anims'], '--out', out], cwd=FORGE, env=env, stdout=log,
                              stderr=subprocess.STDOUT).returncode
    print(f"{job['name']}: {'drawn' if code == 0 else f'FAILED ({code}), see its .log'}", flush=True)
    return code == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--run', required=True, help="the figures run whose finished jobs' artifacts are taken")
    ap.add_argument('--work', default=os.path.join(HERE, '..', 'figures-work'))
    ap.add_argument('--procs', type=int, default=max(1, (os.cpu_count() or 4) // 4), help='jobs drawn at once')
    ap.add_argument('--threads', type=int, default=4, help="each job's share of the cores")
    ap.add_argument('--no-publish', action='store_true', help='draw only')
    args = ap.parse_args()
    work = os.path.abspath(args.work)
    os.makedirs(work, exist_ok=True)
    with open(os.path.join(FORGE, 'figures-request.txt')) as file:
        moves = file.readline().strip()
    jobs = forge_publish.jobs(moves)
    if not any(name.startswith('figures-') for name in os.listdir(work)):
        subprocess.run(['gh', 'run', 'download', args.run, '-R', REPO, '-p', 'figures-*', '-D', work], check=True)
    left = [job for job in jobs if not os.path.exists(os.path.join(work, f"figures-{job['name']}", 'forgeLooks.json'))]
    print(f'{len(jobs) - len(left)} of {len(jobs)} jobs drawn already; drawing {len(left)}, {args.procs} at once',
          flush=True)
    with ThreadPoolExecutor(args.procs) as pool:
        if not all(pool.map(lambda job: draw(job, work, args.threads), left)):
            sys.exit('a job failed: run again to draw what is left')
    if args.no_publish:
        return
    pub = [sys.executable, '-I', os.path.join(HERE, 'forge_publish.py')]
    subprocess.run([*pub, 'pull'], check=True)
    folders = sorted(os.path.join(work, name) for name in os.listdir(work) if name.startswith('figures-'))
    subprocess.run([*pub, 'figures', *folders], check=True)
    subprocess.run([sys.executable, '-I', 'tools/sprite-forge/fpheldforge.py', '--spec',
                    'tools/sprite-forge/specs/FLASK.json', '--out', 'public/art/studio/forge/held', '--objects'],
                   cwd=FORGE, check=True)
    subprocess.run([*pub, 'add'], check=True)
    print('published: commit content/forge/renders.json')


if __name__ == '__main__':
    main()
