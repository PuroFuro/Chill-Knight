# Production image for the Chill Knight backend (FastAPI + authoritative game
# loop over WebSockets). Works on any container host: Render, Railway, Fly.io,
# a VPS, etc.

FROM python:3.12-slim

# No .pyc files; unbuffered stdout/stderr so logs stream live to the host.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code.
COPY app ./app

# The host injects $PORT; default to 8000 for plain `docker run`.
ENV PORT=8000
EXPOSE 8000

# Exactly ONE Uvicorn process. Do not add --workers > 1 and do not run more than
# one instance/replica of this service: the game loop and every live World live
# in this process's memory, so multiple workers would create split-brain worlds
# (players on different processes would never see each other).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
