import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from the root .env file
env_path = BASE_DIR.parent / '.env'

load_dotenv(env_path)
# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('SECRET_KEY')

# 1. DEBUG: Defaults to False in production unless explicitly set to True in .env
DEBUG = os.environ.get("DEBUG", "False").strip().lower() in ("true", "1", "yes")

# 2. ALLOWED_HOSTS: Split comma-separated domains from .env
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]
# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'apps.users.apps.UsersConfig',  # Must come before utils due to AUTH_USER_MODEL dependency
    'apps.utils.apps.UtilsConfig',
    'corsheaders',
    'apps.organization.apps.OrganizationConfig',
    'apps.projects.apps.ProjectsConfig',
    'apps.assets.apps.AssetsConfig',
    'apps.analytics.apps.AnalyticsConfig',
    'apps.leave.apps.LeaveConfig',
    'apps.expense.apps.ExpenseConfig',
    'apps.attendance.apps.AttendanceConfig',
    'apps.notifications.apps.NotificationsConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.AuditLoggingMiddleware',  # Custom middleware for audit logging
]

CORS_ALLOW_CREDENTIALS = True

# 3. CORS_ALLOWED_ORIGINS: Split comma-separated frontend origins from .env
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    ).split(",")
]

# Optional: Keep CSRF_TRUSTED_ORIGINS in sync with CORS for cookie/session requests
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    ).split(",")
    if origin.strip()
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.1/ref/settings/#databases

# Use an in-memory database only for `manage.py test` (not for any argument
# that merely contains the word "test", e.g. `loaddata test_data.json`).
RUNNING_TESTS = len(sys.argv) > 1 and sys.argv[1] == 'test'

if RUNNING_TESTS:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }
    # Shared list caching needs Redis (pattern invalidation); off in tests.
    MODEL_CACHE_ENABLED = False
else:
    database_url = os.environ.get('DATABASE_URL', '').strip()
    if database_url:
        from urllib.parse import urlparse
        parsed = urlparse(database_url)
        db_port = str(parsed.port or os.environ.get('POSTGRES_PORT') or '5432')
        db_name = parsed.path.lstrip('/') or os.environ.get('POSTGRES_DB', '')
        db_user = parsed.username or os.environ.get('POSTGRES_USER', '')
        db_password = parsed.password or os.environ.get('POSTGRES_PASSWORD', '')
        db_host = parsed.hostname or os.environ.get('POSTGRES_HOST', '')
    else:
        db_port = str(os.environ.get('POSTGRES_PORT') or '5432')
        db_name = os.environ.get('POSTGRES_DB', '')
        db_user = os.environ.get('POSTGRES_USER', '')
        db_password = os.environ.get('POSTGRES_PASSWORD', '')
        db_host = os.environ.get('POSTGRES_HOST', '')

    # Supabase pooler (pooler.supabase.com) requires port 6543 (transaction mode) for web concurrency.
    # Port 5432 is session mode with max 15 clients (causing EMAXCONNSESSION).
    if db_host and 'pooler.supabase.com' in db_host and db_port in ('5432', ''):
        db_port = '6543'

    is_pooler = db_port == '6543' or bool(db_host and 'pooler.supabase.com' in db_host)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': db_name,
            'USER': db_user,
            'PASSWORD': db_password,
            'HOST': db_host,
            'PORT': db_port,
            'CONN_MAX_AGE': 0 if is_pooler else 60,
            'DISABLE_SERVER_SIDE_CURSORS': is_pooler,
            'OPTIONS': {
                'sslmode': 'require',
            },
        }
    }

    # Redis is used for caching, throttling and sessions when it is reachable.
    # If it is not (e.g. not running locally, or not deployed), every cache call
    # would block on a connection timeout (~4s each on Windows), so fall back to
    # an in-process cache and database sessions instead.
    REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0").strip()

    def _redis_reachable(url):
        import socket
        from urllib.parse import urlparse
        parsed = urlparse(url)
        try:
            socket.create_connection(
                (parsed.hostname or "127.0.0.1", parsed.port or 6379), timeout=0.5
            ).close()
            return True
        except OSError:
            return False

    USE_REDIS = bool(REDIS_URL) and _redis_reachable(REDIS_URL)

    if USE_REDIS:
        DJANGO_REDIS_IGNORE_EXCEPTIONS = True
        CACHES = {
            "default": {
                "BACKEND": "django_redis.cache.RedisCache",
                "LOCATION": REDIS_URL,
                "KEY_PREFIX": "erp_v1",
                "OPTIONS": {
                    "CLIENT_CLASS": "django_redis.client.DefaultClient",
                    "IGNORE_EXCEPTIONS": True,
                    "CONNECTION_POOL_KWARGS": {
                        "max_connections": 50,
                        "retry_on_timeout": True,
                    },
                    "SOCKET_CONNECT_TIMEOUT": 1,
                    "SOCKET_TIMEOUT": 1,
                },
            }
        }
        SESSION_ENGINE = "django.contrib.sessions.backends.cache"
        SESSION_CACHE_ALIAS = "default"
        MODEL_CACHE_ENABLED = True
    else:
        import logging
        logging.getLogger(__name__).warning(
            "Redis at %s is unreachable; using in-process cache and database sessions.",
            REDIS_URL,
        )
        CACHES = {
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "KEY_PREFIX": "erp_v1",
            }
        }
        # Per-process caches cannot be invalidated across workers, so shared
        # list caching is disabled rather than risk serving stale data.
        MODEL_CACHE_ENABLED = False

# Password validation
# https://docs.djangoproject.com/en/6.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]



# Internationalization
# https://docs.djangoproject.com/en/6.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Kolkata'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.1/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'


# Email / Mailers Configuration (Django 6.1 MAILERS setting)
# https://docs.djangoproject.com/en/6.1/topics/email/#topic-email-configuration

MAILERS = {
    'default': {
        'BACKEND': (
            'django.core.mail.backends.smtp.EmailBackend'
            if os.environ.get('EMAIL_HOST')
            else 'django.core.mail.backends.console.EmailBackend'
        ),
        'OPTIONS': {
            'host': os.environ.get('EMAIL_HOST', 'localhost'),
            'port': int(os.environ.get('EMAIL_PORT', 587)),
            'username': os.environ.get('EMAIL_HOST_USER', ''),
            'password': os.environ.get('EMAIL_HOST_PASSWORD', ''),
            'use_tls': os.environ.get('EMAIL_USE_TLS', 'True').lower() in ['true', '1', 't', 'yes'],
            'use_ssl': os.environ.get('EMAIL_USE_SSL', 'False').lower() in ['true', '1', 't', 'yes'],
        },
    },
}
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Northstar ERP <noreply@northstar-erp.example>')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

AUTH_USER_MODEL = 'users.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'apps.utils.throttling.WriteBurstThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/minute',
        'user': '120/minute',
        'login': '5/minute',
        'write_burst': '30/minute',
    },
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'SIGNING_KEY': os.environ.get('JWT_SECRET_KEY') or SECRET_KEY,
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'audit': {
            'format': '%(asctime)s %(message)s',
            'datefmt': '%Y-%m-%dT%H:%M:%S',
        },
    },
    'handlers': {
        'audit_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': 'audit.log',
            'maxBytes': 1024 * 1024 * 10,  # 10 MB
            'backupCount': 10,
            'formatter': 'audit',
        },
    },
    'loggers': {
        'audit': {
            'handlers': ['audit_file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
