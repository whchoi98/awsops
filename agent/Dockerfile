FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev gcc && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    strands-agents \
    strands-agents-tools \
    boto3 \
    psycopg2-binary \
    "bedrock-agentcore<=0.1.5" \
    mcp \
    httpx \
    httpx-sse \
    aws-requests-auth

COPY streamable_http_sigv4.py .
COPY agent.py .

EXPOSE 8080

CMD ["python", "agent.py"]
