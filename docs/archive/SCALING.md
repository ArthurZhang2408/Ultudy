# Scaling Ultudy to Hundreds of Thousands of Users

This document outlines the architecture and configuration for scaling Ultudy to support hundreds of thousands of concurrent users.

## Architecture Overview

```
┌─────────────────┐
│  Load Balancer  │ (e.g., Nginx, AWS ALB)
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼───┐
│ API 1 │ │ API 2│ ... (Multiple API server instances)
└───┬───┘ └──┬───┘
    │         │
┌───▼─────────▼───┐
│  Redis Cluster  │ (Job queue + Rate limiting + Caching)
└────────┬─────────┘
         │
┌────────┴─────────┐
│  Worker Pool     │ (Multiple worker instances)
│ ┌──────┐┌──────┐ │
│ │Worker││Worker│ │
│ │  1   ││  2   │ │... (3-10 workers depending on load)
│ └──────┘└──────┘ │
└──────────────────┘
         │
┌────────▼─────────┐
│   PostgreSQL     │ (Primary + Read Replicas)
│   + PgBouncer    │ (Connection pooling)
└──────────────────┘
         │
┌────────▼─────────┐
│  Object Storage  │ (S3, GCS, etc. for uploaded files)
└──────────────────┘
```

## Key Scalability Features

### 1. **Horizontal Worker Scaling**

Run multiple worker instances to process jobs concurrently:

```bash
# Start worker instance 1
WORKER_ID=worker-1 UPLOAD_QUEUE_CONCURRENCY=5 LESSON_QUEUE_CONCURRENCY=3 npm start

# Start worker instance 2
WORKER_ID=worker-2 UPLOAD_QUEUE_CONCURRENCY=5 LESSON_QUEUE_CONCURRENCY=3 npm start

# Start worker instance 3 (and so on...)
WORKER_ID=worker-3 UPLOAD_QUEUE_CONCURRENCY=5 LESSON_QUEUE_CONCURRENCY=3 npm start
```

**Benefits:**
- Each worker processes 5 uploads and 3 lessons concurrently
- 10 workers = 50 concurrent uploads, 30 concurrent lessons
- Workers automatically share work from Redis queue
- Add/remove workers dynamically based on load

### 2. **Redis-Based Caching**

Lessons are cached in Redis for 24 hours (configurable):

```bash
# Enable caching (enabled by default)
ENABLE_LESSON_CACHE=true

# Set cache TTL (in seconds)
LESSON_CACHE_TTL=86400  # 24 hours
```

**Cache Hit Rates:**
- First generation: Database query + LLM call (~5-10s)
- Cached hit: Redis fetch (~5-10ms) = **1000x faster**
- Shared across all API servers and workers

### 3. **Rate Limiting**

Prevent abuse and ensure fair resource allocation:

```bash
# Enable rate limiting (enabled by default)
ENABLE_RATE_LIMITING=true

# Limit lesson generations per user per minute
LESSON_JOBS_PER_MINUTE=10

# Limit uploads per user per minute
UPLOAD_JOBS_PER_MINUTE=5
```

**Per-User Limits:**
- Distributed across all API servers (Redis-backed)
- Returns HTTP 429 with `Retry-After` header
- X-RateLimit headers show remaining quota

### 4. **Job Priorities**

Prioritize critical jobs over batch operations:

```javascript
// Frontend can set priority when generating lessons
fetch('/api/lessons/generate', {
  method: 'POST',
  body: JSON.stringify({
    document_id: 'abc123',
    priority: 'high'  // 'high', 'normal', or 'low'
  })
});
```

**Priority Levels:**
- `high` (1): Interactive user requests - processed first
- `normal` (2): Default for most operations
- `low` (3): Batch jobs, background tasks

### 5. **Concurrent Job Processing**

Configure concurrency per queue per worker:

```bash
# Upload processing (I/O bound - can handle more)
UPLOAD_QUEUE_CONCURRENCY=5

# Lesson generation (LLM API bound - limited by rate limits)
LESSON_QUEUE_CONCURRENCY=3
```

**Scaling Math:**
- 1 worker with concurrency=3 → 3 concurrent LLM calls
- 5 workers with concurrency=3 → 15 concurrent LLM calls
- 10 workers with concurrency=3 → 30 concurrent LLM calls

## Production Deployment Configuration

### Environment Variables

```bash
# === Database ===
DATABASE_URL=postgresql://user:pass@postgres:5432/ultudy
# Or use PgBouncer:
# DATABASE_URL=postgresql://user:pass@pgbouncer:6432/ultudy

# === Redis ===
REDIS_URL=redis://redis-cluster:6379

# === Job Queue Configuration ===
UPLOAD_QUEUE_CONCURRENCY=5
LESSON_QUEUE_CONCURRENCY=3
WORKER_ID=worker-1  # Unique per worker instance

# === Caching ===
ENABLE_LESSON_CACHE=true
LESSON_CACHE_TTL=86400  # 24 hours

# === Rate Limiting ===
ENABLE_RATE_LIMITING=true
LESSON_JOBS_PER_MINUTE=10
UPLOAD_JOBS_PER_MINUTE=5

# === LLM Provider ===
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# === Embeddings Provider ===
EMBEDDINGS_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# === Storage (for uploaded files) ===
# If using S3:
# AWS_S3_BUCKET=ultudy-uploads
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
```

## Deployment Architectures

### Option 1: Docker Compose (Development/Small Scale)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ultudy
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres

  redis:
    image: redis:7-alpine

  api-1:
    build: .
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ultudy
      REDIS_URL: redis://redis:6379
    ports:
      - "3001:3001"

  api-2:
    build: .
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ultudy
      REDIS_URL: redis://redis:6379
    ports:
      - "3002:3001"

  worker-1:
    build: .
    command: npm start
    environment:
      WORKER_ID: worker-1
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ultudy
      REDIS_URL: redis://redis:6379
      UPLOAD_QUEUE_CONCURRENCY: 5
      LESSON_QUEUE_CONCURRENCY: 3

  worker-2:
    build: .
    command: npm start
    environment:
      WORKER_ID: worker-2
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ultudy
      REDIS_URL: redis://redis:6379
      UPLOAD_QUEUE_CONCURRENCY: 5
      LESSON_QUEUE_CONCURRENCY: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

### Option 2: Kubernetes (Large Scale)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ultudy-api
spec:
  replicas: 5  # 5 API server instances
  selector:
    matchLabels:
      app: ultudy-api
  template:
    metadata:
      labels:
        app: ultudy-api
    spec:
      containers:
      - name: api
        image: ultudy/backend:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ultudy-secrets
              key: database-url
        - name: REDIS_URL
          value: redis://redis-cluster:6379
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ultudy-worker
spec:
  replicas: 10  # 10 worker instances
  selector:
    matchLabels:
      app: ultudy-worker
  template:
    metadata:
      labels:
        app: ultudy-worker
    spec:
      containers:
      - name: worker
        image: ultudy/backend:latest
        env:
        - name: WORKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: UPLOAD_QUEUE_CONCURRENCY
          value: "5"
        - name: LESSON_QUEUE_CONCURRENCY
          value: "3"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ultudy-secrets
              key: database-url
        - name: REDIS_URL
          value: redis://redis-cluster:6379
        resources:
          requests:
            cpu: 1000m
            memory: 1Gi
          limits:
            cpu: 2000m
            memory: 2Gi
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ultudy-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ultudy-worker
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Database Optimizations

### 1. Connection Pooling with PgBouncer

```ini
# pgbouncer.ini
[databases]
ultudy = host=postgres port=5432 dbname=ultudy

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
```

### 2. Read Replicas

```javascript
// Configure read replica for GET requests
const readPool = new Pool({
  connectionString: process.env.READ_REPLICA_URL
});

// Use read replica for queries
const { rows } = await readPool.query('SELECT * FROM lessons WHERE ...');
```

### 3. Database Indexes

```sql
-- Index frequently queried columns
CREATE INDEX CONCURRENTLY idx_lessons_document_owner
  ON lessons(document_id, owner_id);

CREATE INDEX CONCURRENTLY idx_lessons_section_owner
  ON lessons(section_id, owner_id) WHERE section_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_concepts_lesson
  ON concepts(lesson_id, owner_id);

CREATE INDEX CONCURRENTLY idx_jobs_owner_status
  ON jobs(owner_id, status, created_at DESC);
```

## Monitoring & Observability

### Key Metrics to Track

1. **Queue Metrics**
   - Jobs waiting in queue
   - Job processing time (p50, p95, p99)
   - Job failure rate
   - Queue throughput (jobs/second)

2. **Cache Metrics**
   - Cache hit rate
   - Cache memory usage
   - Eviction rate

3. **Rate Limit Metrics**
   - Requests blocked per user
   - Top users hitting limits

4. **API Metrics**
   - Request latency (p50, p95, p99)
   - Error rate
   - Requests per second

5. **Database Metrics**
   - Connection pool usage
   - Query latency
   - Active connections

### Sample Monitoring Setup

```javascript
// Expose metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  const metrics = {
    queue: {
      upload: await uploadQueue.getJobCounts(),
      lesson: await lessonQueue.getJobCounts()
    },
    cache: await getCacheStats(),
    timestamp: new Date()
  };
  res.json(metrics);
});
```

## Cost Optimization Tips

1. **LLM API Costs**
   - Use caching aggressively (24-hour TTL)
   - Implement rate limiting to prevent abuse
   - Use cheaper models for non-critical tasks
   - Batch similar requests when possible

2. **Database Costs**
   - Use read replicas for read-heavy workloads
   - Implement query caching
   - Archive old lessons to cold storage

3. **Redis Costs**
   - Set appropriate TTLs on cached data
   - Use LRU eviction policy
   - Monitor memory usage and scale appropriately

## Capacity Planning

### Estimated Throughput per Worker

**Single Worker Instance (Concurrency: 3 lessons, 5 uploads):**
- Lesson generations: ~180/hour (assuming 1 minute per lesson)
- File uploads: ~600/hour (assuming 30 seconds per upload)

**10 Worker Instances:**
- Lesson generations: ~1,800/hour = **30/minute**
- File uploads: ~6,000/hour = **100/minute**

**With Caching (80% cache hit rate):**
- Effective lesson capacity: **150/minute** (5x improvement)

### Target: 100,000 Active Users

Assumptions:
- 10% of users generate lessons simultaneously (10,000 users)
- Each user generates 1 lesson per 5 minutes
- Cache hit rate: 80%

**Required Capacity:**
- Peak load: 2,000 lessons/minute (20% cache miss)
- Workers needed: ~67 workers (30/minute each)
- With auto-scaling: 50-100 workers

## Troubleshooting

### High Queue Backlog

```bash
# Check queue depths
redis-cli LLEN bull:lesson-generation:wait
redis-cli LLEN bull:upload-processing:wait

# Solution: Add more workers
kubectl scale deployment ultudy-worker --replicas=20
```

### Memory Issues

```bash
# Check Redis memory usage
redis-cli INFO memory

# Solution: Increase Redis instance size or reduce TTL
LESSON_CACHE_TTL=43200  # 12 hours instead of 24
```

### Database Connection Exhaustion

```bash
# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Solution: Use PgBouncer for connection pooling
# Or increase max_connections in PostgreSQL
```

## Next Steps for Even Greater Scale

1. **Migrate to Cloud-Native Queues**
   - AWS SQS + Lambda for serverless processing
   - Google Cloud Tasks + Cloud Run
   - Azure Queue Storage + Functions

2. **Implement GraphQL Federation**
   - Split into microservices (Auth, Lessons, Uploads, etc.)
   - Each service scales independently

3. **Edge Caching with CDN**
   - Cache static lesson content at edge locations
   - Reduce latency for global users

4. **Database Sharding**
   - Partition by user_id or course_id
   - Distribute load across multiple databases

5. **Multi-Region Deployment**
   - Deploy to multiple geographic regions
   - Route users to nearest region
