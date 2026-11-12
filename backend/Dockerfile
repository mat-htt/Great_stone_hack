FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data MODELS_DIR=/app/models PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --retries 10 --timeout 60 -r requirements.txt
COPY app ./app
COPY tests ./tests
COPY scripts ./scripts
# Нейросети (YuNet, FSRCNN, U²-Net-p): берём локальные копии, недостающие докачиваем
COPY models ./models
RUN python scripts/download_models.py /app/models
RUN useradd -m picpac && mkdir -p /data && chown -R picpac /data /app
USER picpac
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=4s --start-period=90s CMD curl -fs http://localhost:8000/api/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
