from fastapi import Request, HTTPException, Depends
from .redis import get_redis
import time

async def rate_limiter(request: Request):
    """
    Simple token bucket / rolling window rate limiter using Redis.
    Limits to 100 requests per minute per IP address.
    """
    redis = await get_redis()
    client_ip = request.client.host if request.client else "unknown"
    key = f"rate_limit:{client_ip}"
    
    # We use a simple INCR and EXPIRE for a fixed window rate limit
    current_count = await redis.incr(key)
    if current_count == 1:
        await redis.expire(key, 60)
        
    if current_count > 100:
        raise HTTPException(status_code=429, detail="Too many requests")
        
    return current_count
