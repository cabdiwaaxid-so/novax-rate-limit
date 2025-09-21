# Rate Limit Plugin for Novaxjs2

A rate limit middleware plugin for Novaxjs2 framework with multiple storage options, flexible configuration, and comprehensive features.

## Installation

```bash
npm install novax-rate-limit
```

## Quick Start

```javascript
const novax = require('novaxjs2');
const rateLimitPlugin = require('novax-rate-limit');

const app = new novax();

// Basic usage
app.usePlugin(rateLimitPlugin, {
    windowMs: 60000, // 1 minute
    max: 100 // 100 requests per minute
});

app.get('/api/data', app.rateLimit(), (req, res) => {
    res.json({ data: 'Your protected data' });
});

app.at(3000);
```

## Features

- ✅ Multiple storage backends (Memory, Redis)
- ✅ Global and route-specific rate limiting
- ✅ Custom key generation
- ✅ Skip conditions for specific requests
- ✅ RFC-compliant rate limit headers
- ✅ Custom error handlers
- ✅ Request filtering options
- ✅ Automatic cleanup
- ✅ Production-ready error handling

## Configuration Options

### Basic Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `windowMs` | number | `60000` | Time window in milliseconds |
| `max` | number | `100` | Maximum requests per window |
| `message` | string | `'Too many requests'` | Error message |
| `statusCode` | number | `429` | HTTP status code for rate limited responses |
| `global` | boolean | `false` | Apply globally to all routes |

### Advanced Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `keyGenerator` | function | `req => req.ip` | Custom key generation function |
| `skip` | function | `() => false` | Function to skip rate limiting |
| `handler` | function | Custom handler | Custom rate limit response handler |
| `skipFailedRequests` | boolean | `false` | Don't count 4xx/5xx responses |
| `skipSuccessfulRequests` | boolean | `false` | Don't count 2xx responses |
| `store` | object | `MemoryStore` | Storage implementation |

## Usage Examples

### Basic Route Limiting

```javascript
app.get('/api/public', app.rateLimit({
    windowMs: 60000,
    max: 10
}), (req, res) => {
    res.json({ message: 'Public endpoint' });
});
```

### Global Rate Limiting

```javascript
app.usePlugin(rateLimitPlugin, {
    global: true,
    windowMs: 60000,
    max: 1000 // Global limit across all routes
});
```

### Custom Key Generation

```javascript
app.get('/api/user', app.rateLimit({
    windowMs: 60000,
    max: 5,
    keyGenerator: req => `\${req.ip}:\${req.headers['user-agent']}`
}), (req, res) => {
    res.json({ user: 'data' });
});
```

### Skip Conditions

```javascript
app.get('/api/admin', app.rateLimit({
    windowMs: 60000,
    max: 100,
    skip: (req) => req.user && req.user.role === 'admin'
}), (req, res) => {
    res.json({ admin: 'data' });
});
```

### Custom Error Handler

```javascript
app.get('/api/custom', app.rateLimit({
    windowMs: 60000,
    max: 5,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Custom rate limit message',
            retryAfter: 60,
            documentation: 'https://api.example.com/rate-limits'
        });
    }
}), (req, res) => {
    res.json({ data: 'Custom endpoint' });
});
```

## Storage Backends

### Memory Store (Default)

```javascript
const { createMemoryStore } = require('novax-rate-limit');

app.usePlugin(rateLimitPlugin, {
    windowMs: 60000,
    max: 100,
    store: createMemoryStore(60000)
});
```

### Redis Store

```javascript
const redis = require('redis');
const { createRedisStore } = require('novax-rate-limit');

const redisClient = redis.createClient();
redisClient.connect();

app.usePlugin(rateLimitPlugin, {
    windowMs: 60000,
    max: 100,
    store: createRedisStore(redisClient, 60000)
});
```

## Response Headers

The plugin adds RFC-compliant rate limit headers to all responses:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Error Handling

The plugin includes robust error handling:

- Store errors are caught and logged, but don't block requests
- Invalid configurations throw descriptive errors
- All async operations include proper error handling

## Best Practices

### For API Endpoints

```javascript
// Stricter limits for sensitive endpoints
app.post('/api/auth/login', app.rateLimit({
    windowMs: 60000,
    max: 5, // Prevent brute force attacks
    skipFailedRequests: true // Don't count failed login attempts
}), (req, res) => {
    // Authentication logic
});
```

### For Different User Types

```javascript
// Different limits for different user roles
app.get('/api/content', app.rateLimit({
    windowMs: 60000,
    keyGenerator: (req) => {
        if (req.user && req.user.role === 'premium') {
            return `premium:\${req.user.id}`; // Higher limits for premium users
        }
        return req.ip; // Standard limits for others
    },
    max: (req) => {
        if (req.user && req.user.role === 'premium') return 1000;
        return 100;
    }
}), (req, res) => {
    res.json({ content: 'data' });
});
```

## Troubleshooting

### Common Issues

1. **Rate limiting not working**: Ensure the plugin is used before route definitions
2. **Memory leaks**: Use Redis store in production for distributed environments
3. **Incorrect counts**: Check if `skipFailedRequests` or `skipSuccessfulRequests` are configured properly

## API Reference

### `app.rateLimit(options)`
Returns a middleware function with the specified rate limiting configuration.

### `createMemoryStore(windowMs)`
Creates a memory-based store instance.

### `createRedisStore(redisClient, windowMs)`
Creates a Redis-based store instance.

## License

MIT License - feel free to use in commercial projects.

## Support

For issues and feature requests, please create an issue on the GitHub repository.

---

**Note**: For production environments, always use Redis or another persistent store to maintain rate limit state across server restarts and in distributed setups.