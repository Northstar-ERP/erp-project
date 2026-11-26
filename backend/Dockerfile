# Python base image
FROM python:3.13-slim

# Prevent Python from creating bytecode files
ENV PYTHONDONTWRITEBYTECODE=1

# Show Python logs immediately
ENV PYTHONUNBUFFERED=1

# Virtual environment location
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV UV_PROJECT_ENVIRONMENT=/opt/venv

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Create virtual environment
RUN uv venv $VIRTUAL_ENV

# Copy dependency files first for Docker layer caching
COPY pyproject.toml uv.lock ./

# Install locked production dependencies
RUN uv sync --frozen --no-dev --no-install-project

# Copy Django application
COPY . .

# Create a non-root user
RUN groupadd --system django \
    && useradd --system --gid django --home-dir /app --no-create-home django \
    && mkdir -p /app/staticfiles /app/media \
    && chown -R django:django /app
# Switch to non-root user
USER django

# Expose Django application port internally
EXPOSE 8000

# Start Django with Gunicorn
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--access-logfile", "-", "--error-logfile", "-"]
