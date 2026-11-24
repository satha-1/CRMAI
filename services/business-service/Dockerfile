FROM python:3.12-slim AS base
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY app app

FROM base AS test
RUN pip install --no-cache-dir ".[test]"
COPY tests tests
CMD ["pytest", "-q"]

FROM base AS runtime
USER nobody
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
