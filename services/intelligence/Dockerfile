FROM python:3.11-slim

# curl exists solely for the container healthcheck (Coolify execs
# `curl -f http://localhost:8001/health` inside the container; python:slim
# ships neither curl nor wget, which reads as "Degraded" forever).
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# tree-sitter-languages ships prebuilt wheels for linux x86_64/arm64, so no
# compiler toolchain is needed for it.
#
# Install CPU-only torch first, from PyTorch's own wheel index. Without this,
# plain `pip install sentence-transformers` pulls the default CUDA build of
# torch (~5GB, useless weight if your VPS has no GPU). The CPU wheel is
# ~200MB. If this line ever fails to resolve on your build host, drop the
# --index-url and let plain PyPI serve the default build instead — it works,
# just produces a much larger image.
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Warm the embedding model into the image so the first real request isn't
# slow (and so a cold container doesn't need network access to Hugging Face
# at runtime). Comment this out if you'd rather keep the image small and
# eat the download on first boot instead.
RUN python -c "from core.embedder import _get_model; _get_model()"

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
