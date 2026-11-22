"""R2, where Overlook's generated files live: objects named by the SHA-256 of their bytes, so a published object never
changes and is cached for good. Uploads use CLOUDFLARE_API_TOKEN when it is set; in a cloud session the network adds
the token itself only where its environment holds it as a network secret, which the Default one does not. The
publishers import this.

With R2_STAGE set to a folder, an upload is written there under its key instead, and read back from there, so a build
that runs others' code publishes without the token; a later job that holds it sends the folder:

    python3 -I tools/r2.py upload <folder>
"""
import hashlib
import http.client
import os
import sys
import time
import urllib.error
import urllib.request

ACCOUNT = 'a27adccb38c8e8b82fa32e5736274a94'
BUCKET = 'overlook-forge'
PUBLIC = 'https://pub-d12f498b9e8d40e7a180531f21e17c18.r2.dev/'
API = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/r2/buckets/{BUCKET}/objects/'
OCTET = 'application/octet-stream'
# What a stage may hold: the folders the staged publishers write, each with its files' kinds by their extension.
STAGED = {
    'sounds': {'mp3': 'audio/mpeg'},
    'flora': {'mesh': OCTET, 'png': 'image/png'},
    'modules': {'mesh': OCTET},
    'ships': {'mesh': OCTET},
    'sources': {'blend': OCTET},
    'wreck': {'mesh': OCTET, 'png': 'image/png'},
    'packs': {'webp': 'image/webp'},
    'index': {'json': 'application/json'},
    'tables': {'json': 'application/json'},
}


def stage_path(key):
    """Where a key waits in R2_STAGE's folder, or None when nothing is staged."""
    stage = os.environ.get('R2_STAGE')
    return os.path.join(stage, key) if stage else None


def fetch(method, url, data=None, kind='application/octet-stream', signed=False):
    """One HTTP request's answer: its status and bytes, a refusal included. A key staged is answered from the stage."""
    staged = stage_path(url[len(PUBLIC):]) if url.startswith(PUBLIC) and method in ('GET', 'HEAD') else None
    if staged and os.path.isfile(staged):
        with open(staged, 'rb') as file:
            return 200, file.read() if method == 'GET' else b''
    # Cloudflare refuses Python's own user agent, so the script names itself.
    headers = {'content-type': kind, 'user-agent': 'overlook-publish'}
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    token = os.environ.get('CLOUDFLARE_API_TOKEN')
    if signed and token:
        request.add_header('authorization', f'Bearer {token}')
    try:
        # The wait is each read's or write's, not the whole upload's: a slow line still finishes.
        with urllib.request.urlopen(request, timeout=120) as answer:
            return answer.status, answer.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except urllib.error.URLError as error:
        # No answer at all (no network, a bad host): status 0, and the reason, for the caller's refusal.
        return 0, str(error.reason).encode()
    except (OSError, http.client.HTTPException) as error:
        # A line dropped or timed out while the answer came (urlopen wraps only the sending): no answer either.
        return 0, repr(error).encode()


def put(data, folder, extension, kind):
    """Uploads bytes under their hash, or stages them with R2_STAGE, unless R2 already serves them; gives the key."""
    key = f'{folder}/{hashlib.sha256(data).hexdigest()}.{extension}'
    if fetch('HEAD', PUBLIC + key)[0] == 200:
        return key
    staged = stage_path(key)
    if staged:
        os.makedirs(os.path.dirname(staged), exist_ok=True)
        with open(staged, 'wb') as file:
            file.write(data)
        print(f'staged {key} ({len(data) / 2 ** 20:.1f} MiB)', flush=True)
        return key
    # Cloudflare answers a passing fault of its own with a 5xx, and too many uploads with a 429, each asking to try
    # again, as a dropped line answers none.
    for wait in (5, 20, 60, None):
        status, body = fetch('PUT', API + key, data, kind, signed=True)
        if status == 200 or not (status in (0, 429) or status >= 500) or wait is None:
            break
        print(f'upload of {key} answered {status}; trying again in {wait} s', flush=True)
        time.sleep(wait)
    if status != 200:
        sys.exit(f'upload of {key} refused ({status}): {body[:300]!r}')
    print(f'uploaded {key} ({len(data) / 2 ** 20:.1f} MiB)', flush=True)
    return key


def published(manifest, key):
    """An object's bytes, checked against the hash its key names: anything else is not what was published."""
    status, data = fetch('GET', manifest['base'] + key)
    if status != 200 or os.path.splitext(os.path.basename(key))[0] != hashlib.sha256(data).hexdigest():
        sys.exit(f'{key} did not come back as published ({status})')
    return data


def upload(stage):
    """Uploads a stage's files. The build that staged them ran others' code, so its folder is not trusted: unless every
    file is a key a publisher writes, `<folder>/<the SHA-256 of its bytes>.<kind>`, nothing is uploaded."""
    if os.environ.get('R2_STAGE'):
        sys.exit('an upload sends a stage to R2: run it without R2_STAGE')
    found = []
    for root, _folders, names in os.walk(stage):
        for name in names:
            path = os.path.join(root, name)
            key = os.path.relpath(path, stage)
            folder, _, file_name = key.partition('/')
            stem, _, extension = file_name.partition('.')
            kind = STAGED.get(folder, {}).get(extension)
            if os.path.islink(path) or not kind or stem != file_hash(path):
                sys.exit(f'{key} is not a key a publisher writes: nothing is uploaded')
            found.append((path, key, folder, extension, kind))
    for path, key, folder, extension, kind in sorted(found):
        with open(path, 'rb') as file:
            put(file.read(), folder, extension, kind)
        if fetch('HEAD', PUBLIC + key)[0] != 200:
            sys.exit(f'{key} was uploaded but R2 does not serve it')
    print(f'{len(found)} staged files on R2', flush=True)


def file_hash(path):
    with open(path, 'rb') as file:
        return hashlib.sha256(file.read()).hexdigest()


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] != 'upload':
        sys.exit('python3 -I tools/r2.py upload <folder>')
    upload(sys.argv[2])
