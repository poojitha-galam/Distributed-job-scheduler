import os
import redis.asyncio as redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# Global Redis pool
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

async def get_redis():
    return redis_client
