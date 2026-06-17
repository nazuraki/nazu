FROM python:3.12-slim

WORKDIR /app

# Install deps first for layer caching. graphiti-core pulls FalkorDB + Anthropic
# clients via the extras declared in pyproject.toml.
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY app.py ./

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
