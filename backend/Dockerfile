FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    unar \
    && curl -fsSL https://get.docker.com | sh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install OpenGrep natively inside the worker
RUN curl -fsSL -o /usr/local/bin/opengrep https://github.com/opengrep/opengrep/releases/download/v1.23.0/opengrep_manylinux_x86 \
    && chmod +x /usr/local/bin/opengrep

WORKDIR /app
ENV PYTHONPATH=/app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create workspace directory and non-root user for security compliance
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/workspace && \
    chown -R appuser:appuser /app && \
    chmod -R 777 /app/workspace

# Expose port
EXPOSE 8000

USER appuser

# Run migrations then start the application
CMD ["sh", "-c", "PYTHONPATH=/app alembic upgrade head && PYTHONPATH=/app uvicorn main:app --host 0.0.0.0 --port 8000"]




