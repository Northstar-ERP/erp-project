"""
Redis caching utilities for the ERP system.

Provides deterministic, role-aware, and query-param-aware cache keys
with automatic invalidation support.
"""
import hashlib
import json
from functools import wraps
from typing import Any, Optional, List, Callable

from django.db.models import Model
from rest_framework.response import Response


# Default TTLs (in seconds)
MASTER_DATA_TTL = 60 * 30      # 30 minutes for master data
DYNAMIC_LIST_TTL = 60 * 5      # 5 minutes for dynamic lists
DASHBOARD_TTL = 60 * 2         # 2 minutes for dashboard aggregations
USER_PROFILE_TTL = 60 * 15     # 15 minutes for user profiles


def _get_cache():
    """Lazy cache import to avoid AppRegistryNotReady during startup."""
    from django.core.cache import cache
    return cache


def make_cache_key(*parts: str, prefix: str = None) -> str:
    """
    Build a deterministic cache key from parts.
    Uses the global KEY_PREFIX from settings (erp_v1) automatically.
    """
    key_parts = [str(p) for p in parts if p is not None]
    key = ':'.join(key_parts)
    if len(key) > 200:
        key = hashlib.sha256(key.encode()).hexdigest()[:32]
    return key


def get_model_cache_key(model: Model, action: str = 'list', **filters) -> str:
    """Generate a cache key for a model queryset."""
    model_name = model._meta.label_lower.replace('.', ':')
    filter_str = json.dumps(filters, sort_keys=True, default=str) if filters else ''
    filter_hash = hashlib.md5(filter_str.encode()).hexdigest()[:8] if filter_str else 'all'
    return make_cache_key('model', model_name, action, filter_hash)


def get_user_cache_key(user_id: str, resource: str, **filters) -> str:
    """Generate a user-scoped cache key."""
    filter_str = json.dumps(filters, sort_keys=True, default=str) if filters else ''
    filter_hash = hashlib.md5(filter_str.encode()).hexdigest()[:8] if filter_str else 'all'
    return make_cache_key('user', user_id, resource, filter_hash)


def get_role_aware_cache_key(role_names: List[str], resource: str, **filters) -> str:
    """Generate a cache key that varies by user role."""
    role_key = ','.join(sorted(role_names)) if role_names else 'anonymous'
    filter_str = json.dumps(filters, sort_keys=True, default=str) if filters else ''
    filter_hash = hashlib.md5(filter_str.encode()).hexdigest()[:8] if filter_str else 'all'
    return make_cache_key('role', role_key, resource, filter_hash)


def invalidate_model_cache(model: Model, pattern: str = None) -> int:
    """
    Invalidate all cache keys for a model.
    Note: Do not prepend 'erp_v1:' here because django-redis automatically
    applies KEY_PREFIX and VERSION to delete_pattern().
    """
    model_name = model._meta.label_lower.replace('.', ':')
    base_pattern = f"model:{model_name}:*"
    if pattern:
        base_pattern = f"model:{model_name}:{pattern}*"

    cache = _get_cache()
    try:
        return cache.delete_pattern(base_pattern)
    except AttributeError:
        return 0


def invalidate_user_cache(user_id: str, resource: str = None) -> int:
    """Invalidate cache keys for a specific user."""
    pattern = f"user:{user_id}:*"
    if resource:
        pattern = f"user:{user_id}:{resource}*"

    cache = _get_cache()
    try:
        return cache.delete_pattern(pattern)
    except AttributeError:
        return 0


def invalidate_role_cache(role_names: List[str], resource: str = None) -> int:
    """Invalidate cache keys for specific roles."""
    role_key = ','.join(sorted(role_names))
    pattern = f"role:{role_key}:*"
    if resource:
        pattern = f"role:{role_key}:{resource}*"

    cache = _get_cache()
    try:
        return cache.delete_pattern(pattern)
    except AttributeError:
        return 0


class CacheableModelMixin:
    """
    Mixin for ViewSets to add automatic caching with invalidation.
    """
    cache_ttl = MASTER_DATA_TTL
    cache_actions = ['list', 'retrieve']

    def _get_cache_key_for_action(self, action: str) -> Optional[str]:
        """Generate cache key for the current request (including pagination & query params)."""
        if action == 'list':
            params = {k: v for k, v in self.request.query_params.items()}
            return get_model_cache_key(self.queryset.model, 'list', **params)
        elif action == 'retrieve':
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            pk = self.kwargs.get(lookup_url_kwarg) or self.kwargs.get('pk')
            return get_model_cache_key(self.queryset.model, 'retrieve', pk=pk)
        return None

    def list(self, request, *args, **kwargs):
        if 'list' not in self.cache_actions:
            return super().list(request, *args, **kwargs)

        cache_key = self._get_cache_key_for_action('list')
        cache = _get_cache()
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        response = super().list(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(cache_key, response.data, self.cache_ttl)
        return response

    def retrieve(self, request, *args, **kwargs):
        if 'retrieve' not in self.cache_actions:
            return super().retrieve(request, *args, **kwargs)

        cache_key = self._get_cache_key_for_action('retrieve')
        cache = _get_cache()
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        response = super().retrieve(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(cache_key, response.data, self.cache_ttl)
        return response

    def _invalidate_model_cache(self):
        """Invalidate all cache entries for this model."""
        invalidate_model_cache(self.queryset.model)

    def perform_create(self, serializer):
        instance = super().perform_create(serializer)
        self._invalidate_model_cache()
        return instance

    def perform_update(self, serializer):
        instance = super().perform_update(serializer)
        self._invalidate_model_cache()
        return instance

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        self._invalidate_model_cache()


def cached_property_view(ttl: int = MASTER_DATA_TTL, key_func: Callable = None):
    """Decorator for caching custom @action responses."""
    def decorator(func):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            if key_func:
                cache_key = key_func(self, request, *args, **kwargs)
            else:
                user_id = request.user.id if request.user.is_authenticated else 'anon'
                cache_key = make_cache_key('action', self.__class__.__name__, func.__name__, user_id)

            cache = _get_cache()
            cached = cache.get(cache_key)
            if cached is not None:
                return Response(cached)

            response = func(self, request, *args, **kwargs)
            if response.status_code == 200:
                cache.set(cache_key, response.data, ttl)
            return response
        return wrapper
    return decorator


def cache_user_profile(user_id: str, data: dict, ttl: int = USER_PROFILE_TTL) -> None:
    key = get_user_cache_key(user_id, 'profile')
    _get_cache().set(key, data, ttl)


def get_cached_user_profile(user_id: str) -> Optional[dict]:
    key = get_user_cache_key(user_id, 'profile')
    return _get_cache().get(key)


def invalidate_user_profile(user_id: str) -> int:
    return invalidate_user_cache(user_id, 'profile')


def cache_dashboard_stats(user_id: str, role_names: List[str], data: dict, ttl: int = DASHBOARD_TTL) -> None:
    key = get_role_aware_cache_key(role_names, 'dashboard', user_id=user_id)
    _get_cache().set(key, data, ttl)


def get_cached_dashboard_stats(user_id: str, role_names: List[str]) -> Optional[dict]:
    key = get_role_aware_cache_key(role_names, 'dashboard', user_id=user_id)
    return _get_cache().get(key)


def invalidate_dashboard_stats(user_id: str = None, role_names: List[str] = None) -> int:
    if role_names:
        return invalidate_role_cache(role_names, 'dashboard')
    cache = _get_cache()
    try:
        return cache.delete_pattern("role:*:dashboard*")
    except AttributeError:
        return 0