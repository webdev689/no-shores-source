"""R2, where the game's generated files live: objects named by the SHA-256 of their bytes, so a published object never
changes and is cached for good. Uploads use CLOUDFLARE_API_TOKEN when it is set; in a cloud session the network adds
the token itself only where its environment holds it as a network secret, which the Default one does not. The
publishers import this; it does nothing run alone.
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


def fetch(method, url, data=None, kind='application/octet-stream', signed=False):
    """One HTTP request's answer: its status and bytes, a refusal included."""
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
    """Uploads bytes under their hash, unless R2 already serves them; gives the object's key."""
    key = f'{folder}/{hashlib.sha256(data).hexdigest()}.{extension}'
    if fetch('HEAD', PUBLIC + key)[0] == 200:
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
