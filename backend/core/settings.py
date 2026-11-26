import os
from pathlib import Path
from datetime import timedelta

from dotenv import load_dotenv


# Project paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from the root .env file
load_dotenv(BASE_DIR.parent / '.env')


# Security settings
SECRET_KEY = os.environ.get('SECRET_KEY')

<<<<<<< HEAD
DEBUG = True

ALLOWED_HOSTS = []

=======
# 1. DEBUG: Defaults to False in production unless explicitly set to True in .env
DEBUG = os.environ.get("DEBUG", "False").strip().lower() in ("true", "1", "yes")
>>>>>>> 0cb73558d112a0258fb6e789ee6e1e18c8c1e6f5

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
<<<<<<< HEAD

    'rest_framework',
    'rest_framework_simplejwt',
=======
    'rest_framework',
    'rest_framework_simplejwt',
    'apps.users.apps.UsersConfig',  # Must come before utils due to AUTH_USER_MODEL dependency
    'apps.utils.apps.UtilsConfig',
    'corsheaders',
    'apps.organization.apps.OrganizationConfig',
    'apps.projects.apps.ProjectsConfig',
    'apps.assets.apps.AssetsConfig',
<<<<<<< HEAD
>>>>>>> 4a9917d1d5f09542637e4b6dc3d0cc7e77c81015

    'apps.users.apps.UsersConfig',
    'apps.organization.apps.OrganizationConfig',
    'apps.projects.apps.ProjectsConfig',
    'apps.assets.apps.AssetsConfig',
=======
    'apps.analytics.apps.AnalyticsConfig',
    'apps.leave.apps.LeaveConfig',
    'apps.expense.apps.ExpenseConfig',
    'apps.attendance.apps.AttendanceConfig',
    'apps.notifications.apps.NotificationsConfig',
>>>>>>> 0cb73558d112a0258fb6e789ee6e1e18c8c1e6f5
]


# Middleware
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.AuditLoggingMiddleware',
]

<<<<<<< HEAD
=======
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
>>>>>>> 0cb73558d112a0258fb6e789ee6e1e18c8c1e6f5

ROOT_URLCONF = 'core.urls'


# Templates
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


# Database configuration: Supabase PostgreSQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB'),
        'USER': os.environ.get('POSTGRES_USER'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD'),
<<<<<<< HEAD
        'HOST': os.environ.get('POSTGRES_HOST'),
        'PORT': os.environ.get('POSTGRES_PORT'),
        'OPTIONS': {
            'sslmode': 'require',
        },
=======
        'HOST': os.environ.get('POSTGRES_HOST'), # Connects to the forwarded port from Docker
<<<<<<< HEAD
        'PORT': os.environ.get('POSTGRES_PORT'),
>>>>>>> 4a9917d1d5f09542637e4b6dc3d0cc7e77c81015
=======
        'PORT': os.environ.get('POSTGRES_PORT','5432'),
        'CONN_MAX_AGE': 60,
>>>>>>> 0cb73558d112a0258fb6e789ee6e1e18c8c1e6f5
    }
}


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': (
            'django.contrib.auth.password_validation.'
            'UserAttributeSimilarityValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation.'
            'MinimumLengthValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation.'
            'CommonPasswordValidator'
        ),
    },
    {
        'NAME': (
            'django.contrib.auth.password_validation.'
            'NumericPasswordValidator'
        ),
    },
]


<<<<<<< HEAD
# Redis cache
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
    },
}

=======
# Caching
# https://docs.djangoproject.com/en/6.1/topics/cache/

# Graceful Redis fallback - if Redis is unreachable, fall back to database
DJANGO_REDIS_IGNORE_EXCEPTIONS = True

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0"),
        "KEY_PREFIX": "erp_v1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "IGNORE_EXCEPTIONS": True,
            "CONNECTION_POOL_KWARGS": {
                "max_connections": 50,
                "retry_on_timeout": True,
            },
            "SOCKET_CONNECT_TIMEOUT": 5,
            "SOCKET_TIMEOUT": 5,
        },
    }
}

# Session caching in Redis (optional, for performance)
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"

# Internationalization
# https://docs.djangoproject.com/en/6.1/topics/i18n/
>>>>>>> 0cb73558d112a0258fb6e789ee6e1e18c8c1e6f5

# Internationalization
LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


<<<<<<< HEAD
# Static files
STATIC_URL = 'static/'
=======
# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.1/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
>>>>>>> 0cb73558d112a0258fb6e789ee6e1e18c8c1e6f5


# Email configuration
MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}


# Custom User model
AUTH_USER_MODEL = 'users.User'


# Django REST Framework
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


# JWT configuration
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'SIGNING_KEY': os.environ.get('JWT_SECRET_KEY'),
}


# Audit logging
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
            'maxBytes': 1024 * 1024 * 10,
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
