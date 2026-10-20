"""Redis-backed job queue and simple rate counters."""

import json
import time

import redis

from app.config import REDIS_URL

QUEUE = "tasks:queue"

_client: redis.Redis | None = None


def client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _client


def enqueue(job: dict) -> None:
    """Add a job to the queue; a worker picks it up in the background."""
    client().rpush(QUEUE, json.dumps(job))


def dequeue(timeout: int = 5) -> dict | None:
    """Pop the oldest job, or None when the queue is empty."""
    item = client().blpop(QUEUE, timeout=timeout)
    if item is None:
        return None
    return json.loads(item[1])


def incr_window_counter(name: str, window_seconds: int) -> int:
    """Count events per sliding window (used for rate caps like N requests/hour)."""
    key = f"tasks:counter:{name}:{int(time.time()) // window_seconds}"
    pipe = client().pipeline()
    pipe.incr(key)
    pipe.expire(key, window_seconds)
    results = pipe.execute()
    return int(results[0])


def window_counter_total(name: str, hours: int) -> int:
    """Sum of the per-hour counters over the last `hours` hour buckets."""
    current = int(time.time()) // 3600
    keys = [f"tasks:counter:{name}:{current - i}" for i in range(hours)]
    values = client().mget(keys)
    return sum(int(value or 0) for value in values)
