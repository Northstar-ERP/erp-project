from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    Strict rate limiting for login/token endpoints to prevent credential stuffing
    and brute-force attacks.
    Scope: 'login' -> mapped to DEFAULT_THROTTLE_RATES['login'] (5/minute)
    """
    scope = 'login'

    def get_cache_key(self, request, view):
        # Only throttle POST requests on login/token views
        if request.method != 'POST':
            return None

        ident = self.get_ident(request)
        username = ''
        if isinstance(request.data, dict):
            username = str(request.data.get('username', '')).strip().lower()

        return f"throttle_{self.scope}_{ident}_{username}"


class WriteBurstThrottle(SimpleRateThrottle):
    """
    Rate limiting for sensitive write operations (POST/PUT/PATCH/DELETE).
    Scope: 'write_burst' -> mapped to DEFAULT_THROTTLE_RATES['write_burst'] (30/minute)
    """
    scope = 'write_burst'

    def get_cache_key(self, request, view):
        # Only throttle mutating requests, never GET/HEAD/OPTIONS
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return None

        if request.user and request.user.is_authenticated:
            ident = f"user_{request.user.pk}"
        else:
            ident = f"ip_{self.get_ident(request)}"

        view_name = view.__class__.__name__.lower()
        return f"throttle_{self.scope}_{view_name}_{ident}"