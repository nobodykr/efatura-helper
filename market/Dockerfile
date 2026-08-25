FROM python:3.13-slim@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY market/requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt && useradd --system --uid 10001 market
COPY market /srv/market
RUN mkdir /data && chown market:market /data
USER market
CMD ["uvicorn", "market.app:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
