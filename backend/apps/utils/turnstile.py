import json
import logging
import urllib.request
from urllib.error import URLError

from django.conf import settings

logger = logging.getLogger(__name__)

VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'


def verify_turnstile_token(token, remote_ip=None):
    """Verify a Cloudflare Turnstile response token server-side.

    Returns True when verification is disabled (no secret configured) so local
    dev without Turnstile keys isn't locked out, matching the Redis-fallback
    pattern used elsewhere in this project.
    """
    if not settings.TURNSTILE_SECRET_KEY:
        return True
    if not token:
        return False

    payload = {
        'secret': settings.TURNSTILE_SECRET_KEY,
        'response': token,
    }
    if remote_ip:
        payload['remoteip'] = remote_ip

    request = urllib.request.Request(
        VERIFY_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            result = json.loads(response.read().decode('utf-8'))
    except (URLError, ValueError, TimeoutError):
        logger.exception('Turnstile verification request failed')
        return False

    return bool(result.get('success'))
