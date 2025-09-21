class RateLimiter {
  constructor(options = {}) {
    this.options = {
      windowMs: options.windowMs || 60000, // 1 minute
      max: options.max || 100, // max requests per window
      message: options.message || 'Too many requests, please try again later.',
      statusCode: options.statusCode || 429,
      skipFailedRequests: options.skipFailedRequests || false,
      skipSuccessfulRequests: options.skipSuccessfulRequests || false,
      keyGenerator: options.keyGenerator || (req => req.ip),
      skip: options.skip || (() => false),
      handler: options.handler || ((req, res) => {
        res.status(this.options.statusCode).json({
          error: this.options.message,
          retryAfter: Math.ceil(this.options.windowMs / 1000)
        });
      }),
      ...options
    };

    this.store = options.store || new MemoryStore(this.options.windowMs);
  }

  async check(key) {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
    // Get existing hits
    let hits = await this.store.get(key) || [];
    
    // Remove expired hits
    hits = hits.filter(hit => hit > windowStart);
    
    // Add current hit
    hits.push(now);
    await this.store.set(key, hits);
    
    return {
      current: hits.length,
      remaining: Math.max(0, this.options.max - hits.length),
      reset: Math.ceil((hits[0] + this.options.windowMs) / 1000),
      resetMs: hits[0] + this.options.windowMs
    };
  }

  middleware() {
    return async (req, res, next) => {
      // Skip if configured to skip
      if (this.options.skip(req, res)) {
        return next();
      }

      const key = this.options.keyGenerator(req);
      try {
        const limitInfo = await this.check(key);
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', this.options.max);
        res.setHeader('X-RateLimit-Remaining', limitInfo.remaining);
        res.setHeader('X-RateLimit-Reset', limitInfo.reset);
        if (limitInfo.current > this.options.max) {
          return this.options.handler(req, res);
        }
        
        // Skip counting if configured
        const originalEnd = res.end;
        res.end = function(chunk, encoding) {
          res.end = originalEnd;
          
          const shouldSkip = (this.options.skipFailedRequests && res.statusCode >= 400) || (this.options.skipSuccessfulRequests && res.statusCode < 400);
          
          if (shouldSkip) {
            // Remove the last hit
            this.store.get(key).then(hits => {
              if (hits && hits.length > 0) {
                hits.pop();
                this.store.set(key, hits);
              }
            });
          }
          
          return res.end(chunk, encoding);
        }.bind(this);
        next();
      } catch (error) {
        console.error('Rate limit error:', error);
        next(); // Continue on store errors
      }
    };
  }
}

// Memory store (default)
class MemoryStore {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.hits = new Map();
    this.interval = setInterval(() => this.cleanup(), windowMs);
  }

  async get(key) {
    return this.hits.get(key);
  }

  async set(key, value) {
    this.hits.set(key, value);
  }

  async cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [key, hits] of this.hits.entries()) {
      const validHits = hits.filter(hit => hit > windowStart);
      if (validHits.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, validHits);
      }
    }
  }

  destroy() {
    clearInterval(this.interval);
  }
}

// Redis store for distributed environments
class RedisStore {
  constructor(redisClient, windowMs) {
    this.redis = redisClient;
    this.windowMs = windowMs;
    this.prefix = 'ratelimit:';
  }

  async get(key) {
    const data = await this.redis.get(this.prefix + key);
    return data ? JSON.parse(data) : null;
  }

  async set(key, value) {
    await this.redis.setex(this.prefix + key, Math.ceil(this.windowMs / 1000), JSON.stringify(value));
  }
}

// Plugin main function
module.exports = function rateLimitPlugin(context, options = {}) {
  const { app } = context;

  // Add rate limiting method to app
  context.addMethod('rateLimit', function(rateOptions = {}) {
    const limiter = new RateLimiter({
      ...options, // Global options
      ...rateOptions // Route-specific options
      });
    return limiter.middleware();
  });

  // Add global rate limiting
  if (options.global) {
    const globalLimiter = new RateLimiter(options);
    context.addMiddleware(globalLimiter.middleware());
  }

  console.log('Rate limit plugin loaded successfully');
};

// Utility function for creating Redis store
module.exports.createRedisStore = function(redisClient, windowMs) {
  return new RedisStore(redisClient, windowMs);
};

// Utility function for creating Memory store
module.exports.createMemoryStore = function(windowMs) {
  return new MemoryStore(windowMs);
};