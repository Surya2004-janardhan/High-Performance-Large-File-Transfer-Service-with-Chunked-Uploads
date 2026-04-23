# Operational Runbook

## Deployment

### Docker Compose Development

```bash
# Start all services (api, sqlite, minio)
docker-compose up --build

# Logs
docker-compose logs -f api
docker-compose logs -f minio

# Stop all services
docker-compose down

# Clean and restart
docker-compose down -v && docker-compose up --build
```

### Environment Configuration

Create `.env` in project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_PORT` | 3000 | Express server port |
| `DATABASE_PATH` | `/app/data/uploads.db` | SQLite database location |
| `STORAGE_ENDPOINT` | `minio` | MinIO hostname |
| `STORAGE_PORT` | 9000 | MinIO API port |
| `STORAGE_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `STORAGE_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `UPLOAD_CHUNK_SIZE_BYTES` | 5242880 | Default chunk size (5MB) |
| `CLEANUP_STALE_AFTER_MINUTES` | 1440 | Stale upload threshold (1 day) |
| `CLEANUP_INTERVAL_SECONDS` | 3600 | Cleanup job frequency (1 hour) |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | Node environment |

### Production Deployment

For production, use:

```dockerfile
# Use official Node.js image
FROM node:20-alpine

# Install production dependencies only
RUN npm ci --only=production

# Copy compiled code and run
CMD ["npm", "start"]
```

Then deploy with:

```bash
docker build -t lft-service:1.0.0 .
docker push <registry>/lft-service:1.0.0

# Kubernetes example
kubectl apply -f k8s-deployment.yaml
```

---

## Monitoring

### Health Checks

```bash
# Quick health check
curl http://localhost:3000/api/health

# Continuous monitoring
watch -n 5 'curl -s http://localhost:3000/api/health | jq'
```

Health check includes:
- API status
- Database connectivity
- Storage connectivity
- Timestamp

### Structured Logs

All logs include:
- Timestamp (ISO 8601)
- Level (info, warn, error)
- Request ID (for correlation)
- Context (uploadId, chunkIndex, error details)

Example:
```json
{
  "level": "info",
  "time": "2026-04-23T10:15:30.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadId": "660e8400-e29b-41d4-a716-446655440000",
  "chunkIndex": 0,
  "message": "Chunk stored successfully",
  "size": 5242880
}
```

### Metrics (Optional)

Add Prometheus metrics for production:

```typescript
import promClient from 'prom-client';

// Histogram: chunk upload time
const chunkUploadDuration = new promClient.Histogram({
  name: 'upload_chunk_duration_ms',
  help: 'Time to upload a chunk',
  buckets: [100, 500, 1000, 5000, 10000]
});

// Counter: total chunks uploaded
const chunksCounter = new promClient.Counter({
  name: 'upload_chunks_total',
  help: 'Total chunks uploaded'
});

// Gauge: active uploads
const activeUploads = new promClient.Gauge({
  name: 'upload_active',
  help: 'Active upload sessions'
});
```

Expose metrics on `/metrics` for Prometheus scraping.

---

## Maintenance

### Database Maintenance

**Weekly:**

```bash
# Vacuum database (reclaim space)
sqlite3 data/uploads.db "VACUUM;"

# Check database integrity
sqlite3 data/uploads.db "PRAGMA integrity_check;"
```

**Monthly:**

```bash
# Analyze table statistics (improves query planning)
sqlite3 data/uploads.db "ANALYZE;"

# Backup
cp data/uploads.db backups/uploads-$(date +%Y%m%d).db
```

### Storage Maintenance

**Daily:**

```bash
# Monitor storage usage
docker-compose exec minio mc du local/uploads

# Check bucket health
docker-compose exec minio mc ready local
```

**Weekly:**

```bash
# Clean up orphaned objects (from failed uploads)
# Manual: delete stale upload objects
# Or use cleanup endpoint: POST /api/testing/run-cleanup
```

### Log Rotation

Configure external log rotation (ELK, Datadog, CloudWatch):

```bash
# Send logs to syslog
LOG_LEVEL=info npm start | tee -a /var/log/lft-service.log

# Or configure Docker logging driver
# In docker-compose.yml:
# logging:
#   driver: "syslog"
#   options:
#     syslog-address: "udp://127.0.0.1:514"
```

---

## Troubleshooting

### Issue: API Container Won't Start

**Symptom:**
```
Error: Failed to init database
```

**Solution:**

```bash
# Check database path exists
docker-compose exec api ls -la /app/data/

# Verify permissions
docker-compose exec api chmod 755 /app/data

# Check logs
docker-compose logs api
```

### Issue: MinIO Connection Refused

**Symptom:**
```
Error: StorageError: ECONNREFUSED 127.0.0.1:9000
```

**Solution:**

```bash
# Wait for MinIO to fully start
docker-compose logs minio | grep "HEALTH OK"

# Check MinIO health
docker-compose exec minio mc ready local

# Restart MinIO
docker-compose restart minio
```

### Issue: Database Locked

**Symptom:**
```
SQLITE_BUSY: database is locked
```

**Cause:** Multiple processes accessing same SQLite file

**Solution:**

```bash
# Check active connections
sqlite3 data/uploads.db "PRAGMA database_list;"

# Close all connections and restart
docker-compose down -v
docker-compose up --build
```

### Issue: Out of Disk Space

**Symptom:**
```
ENOSPC: no space left on device
```

**Solution:**

```bash
# Check disk usage
df -h

# Find largest files in minio storage
du -sh minio_data/*

# Delete old completed uploads
# Manually remove from storage and DB, or
# Implement retention policy
```

### Issue: Memory Usage Too High

**Symptom:**
```
Process using 2GB+ RAM
```

**Solution:**

```bash
# Check memory usage
docker stats lft-api

# Reduce concurrent uploads in cleanup by modifying:
# src/workers/cleanup.worker.ts

# Or restart to clear any leaks
docker-compose restart api
```

### Issue: Slow Downloads

**Symptom:**
```
Download takes >10s for 100MB file
```

**Solution:**

```bash
# Check network bandwidth
iperf -s
# (from client): iperf -c localhost

# Check disk I/O
iostat -x 1

# Verify MinIO is not bottleneck
docker-compose exec minio mc stat local/uploads/...
```

---

## Backup & Recovery

### Backup Strategy

Daily full backup of SQLite database:

```bash
#!/bin/bash
BACKUP_DIR="/backups/lft-service"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Stop API (optional, safer)
docker-compose stop api

# Copy database
cp data/uploads.db "$BACKUP_DIR/uploads_$DATE.db"

# Copy MinIO data
docker-compose exec minio mc mirror local/uploads "$BACKUP_DIR/minio_$DATE"

# Restart API
docker-compose start api

# Retention: keep 30 days
find "$BACKUP_DIR" -type f -mtime +30 -delete
```

### Point-in-Time Recovery

**Scenario:** Accidental deletion of uploads 2 days ago

```bash
# 1. Stop API
docker-compose stop api

# 2. Restore database from 3-day-old backup
cp backups/lft-service/uploads_20260420_000000.db data/uploads.db

# 3. Restore MinIO data (more complex; depends on backup method)
# docker-compose exec minio mc mirror <backup-location> local/uploads

# 4. Start API
docker-compose start api

# 5. Verify health
curl http://localhost:3000/api/health
```

---

## Performance Tuning

### SQLite Optimization

In `src/db/client.ts`, add:

```typescript
db.run("PRAGMA cache_size = -64000");      // 64MB cache
db.run("PRAGMA synchronous = NORMAL");     // Faster writes
db.run("PRAGMA journal_mode = WAL");       // Write-Ahead Log
db.run("PRAGMA foreign_keys = ON");        // Enforce constraints
```

### Connection Pooling

Add better-sqlite3 with connection pool:

```typescript
import Database from 'better-sqlite3';

const pool = [];
for (let i = 0; i < 10; i++) {
  pool.push(new Database(dbPath, { timeout: 5000 }));
}

export function getConnection(): Database {
  return pool[Math.floor(Math.random() * pool.length)];
}
```

### MinIO Tuning

Adjust MinIO startup parameters:

```bash
# In docker-compose.yml
environment:
  - MINIO_API_REQUESTS_MAX=1000
  - MINIO_API_REQUESTS_DEADLINE=10s
  - MINIO_DISK_USAGE_CRAWL_INTERVAL=72h
```

---

## Scaling Considerations

### Horizontal Scaling

Current single-node setup not suitable for:
- > 100 concurrent uploads
- > 10 TB total uploads
- 24/7 high-availability requirement

To scale:

1. **Use Managed Services:**
   - PostgreSQL (RDS) instead of SQLite
   - S3 instead of MinIO
   - CloudFront for downloads

2. **Distributed Architecture:**
   ```
   Load Balancer (Nginx/HAProxy)
     ├─ API Instance 1
     ├─ API Instance 2
     └─ API Instance N
          └─ Shared PostgreSQL
          └─ Shared S3
   ```

3. **Async Processing:**
   - Queue uploads to Redis/RabbitMQ
   - Worker pool processes chunks
   - Webhook on completion

4. **Caching:**
   - Redis for upload status cache
   - CDN for file downloads

---

## Security Hardening

### Before Production

1. **Enable Authentication:**
   ```bash
   # Add API key middleware
   # Validate in every request
   ```

2. **Rate Limiting:**
   ```bash
   # npm install express-rate-limit
   # Apply 100 req/min per IP
   ```

3. **HTTPS:**
   ```bash
   # Enable in reverse proxy (Nginx)
   # Use Let's Encrypt certs
   ```

4. **CORS:**
   ```typescript
   // Restrict to specific origins
   cors({ origin: 'https://trusted-client.com' })
   ```

5. **Input Validation:**
   - Already implemented in Phase 5

6. **Secrets Management:**
   - Use AWS Secrets Manager, Vault, etc.
   - Never commit .env with real secrets

### Audit & Compliance

- Log all download activities with user ID
- Implement audit trail in DB
- Enable CloudTrail for S3 (if using AWS)
- Regular security scans with Snyk, etc.

---

## Incident Response

### Upload Stuck/Failed

**Investigation:**

```bash
# Check upload status
curl http://localhost:3000/api/upload/$UPLOAD_ID/status

# Check DB record
sqlite3 data/uploads.db \
  "SELECT id, status, created_at FROM uploads WHERE id='$UPLOAD_ID';"

# Check storage for chunks
docker-compose exec minio mc ls local/uploads/$UPLOAD_ID
```

**Resolution:**

```bash
# If incomplete & old: trigger cleanup
curl -X POST http://localhost:3000/api/testing/run-cleanup

# If stuck: force cancel
curl -X DELETE http://localhost:3000/api/upload/$UPLOAD_ID
```

### Storage Full

**Immediate:**

```bash
# Stop accepting uploads
# (set API_MAX_FILE_SIZE=0 and restart)

# Delete completed files not needed
# (query DB and delete from MinIO)
```

**Long-term:**

```bash
# Increase storage
# Migrate to bigger disk or S3
# Implement retention policies
```

### Database Corruption

**Recovery:**

```bash
# Restore from backup
docker-compose stop api
cp backups/uploads_latest.db data/uploads.db
docker-compose start api

# Verify
curl http://localhost:3000/api/health
sqlite3 data/uploads.db "PRAGMA integrity_check;"
```

---

## Contacts & Escalation

| Issue | Owner | Escalation |
|-------|-------|-----------|
| API bugs | Dev Team | Tech Lead |
| Database issues | DBA | Cloud Ops |
| Storage capacity | Cloud Ops | Infrastructure |
| Security incident | Security | CISO |

---

## Useful Commands

```bash
# View active logs
docker-compose logs -f api

# Execute command in container
docker-compose exec api npm run build

# Enter shell
docker-compose exec api /bin/sh

# Memory usage
docker stats lft-api

# Disk usage
docker-compose exec api du -sh /app/data

# Check port availability
lsof -i :3000

# Network test
curl -v http://localhost:3000/api/health

# Database shell
docker-compose exec api sqlite3 /app/data/uploads.db
```
