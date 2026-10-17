FROM python:3.12-slim

WORKDIR /app

# Create a non-root user so the container does not run as root.
RUN useradd --create-home --uid 1000 appuser

# Directory for model artifacts (a named volume is mounted here in deployment).
RUN mkdir -p /models && chown appuser:appuser /models

# OpenMP runtime needed by LightGBM's native library.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
