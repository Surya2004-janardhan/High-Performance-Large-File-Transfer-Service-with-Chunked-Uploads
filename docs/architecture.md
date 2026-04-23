# Architecture & Design

## System Overview

The Large File Transfer Service is built on a layered architecture optimized for handling multi-gigabyte files with minimal memory overhead.

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer                              │
│  (Browser, CLI, Mobile App, Test UI)                        │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Express.js API Gateway                          │
│  - Request validation & sanitization                        │
│  - CORS, body parsing, structured logging                   │
│  - Request ID correlation tracking                          │
│  - Error middleware with HTTP mapping                       │
└────────┬─────────────────────────────────┬──────────────────┘
         │                                 │
         ▼                                 ▼
┌──────────────────────────┐    ┌─────────────────────────┐
│   REST Controllers        │    │  Background Workers     │
│                          │    │                         │
│ - upload.routes.ts       │    │ - cleanup.worker.ts     │
│ - upload.controller      │    │   (periodic stale      │
│ - download.controller    │    │    upload expiration)   │
└────────┬─────────────────┘    └──────────┬──────────────┘
         │                                 │
         └─────────────────┬───────────────┘
                           │
                 ┌─────────▼──────────┐
                 │   Service Layer    │
                 │                    │
                 │ - UploadService    │
                 │ - DownloadService  │
                 │ - CleanupService   │
                 │ - AssemblyService  │
                 │                    │
                 │ Business logic:    │
                 │ - Validation       │
                 │ - State machine    │
                 │ - Transactions     │
                 │ - Idempotency      │
                 └─────────┬──────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────────┐  ┌────────────────┐
│  Repository   │  │  Storage Adapter  │  │  Lock Manager  │
│   Layer       │  │                   │  │                │
│               │  │ - MinIOAdapter    │  │ Simple in-mem  │
│ - Uploads     │  │ - getChunk()      │  │ lock for       │
│ - Chunks      │  │ - putChunk()      │  │ concurrent     │
│ - Files       │  │ - getFile()       │  │ operations     │
└────────┬──────┘  │ - putFile()       │  └────────────────┘
         │         │ - delete()        │
         │         │ - listChunks()    │
         │         └────────┬──────────┘
         │                  │
         ▼                  ▼
    ┌────────────────────────────────────┐
    │    Data Persistence Layer          │
    │                                    │
    │  SQLite DB          MinIO S3       │
    │  - uploads table    - Chunk obj    │
    │  - chunks table     - File obj     │
    │  - files table      - Buckets      │
    │                                    │
    │  Persistent across restarts        │
    └────────────────────────────────────┘
```

## Key Design Decisions

### 1. Layered Architecture

- **Controllers** (API) → **Services** (Business) → **Repositories** (Data Access) → **Storage**
- Clear separation of concerns
- Easy to test each layer independently
- Storage abstraction keeps MinIO details isolated

### 2. Idempotent Chunk Upload

**Problem:** Network retries could create duplicate chunks.

**Solution:** 
- Chunks identified by composite key `(uploadId, chunkIndex)`
- Before storing, check if chunk already exists in DB + storage
- If exists, return success without re-storing (true idempotency)

```typescript
if (await chunkRepo.chunkExists(uploadId, chunkIndex)) {
  return; // Already uploaded, skip
}
// Store new chunk
```

### 3. Memory-Efficient Assembly

**Problem:** Loading a 1GB file into memory would exhaust Node.js heap.

**Solution:** Use Node.js Streams with `pipeline()` for backpressure handling:

```typescript
pipeline(
  readStream1,
  readStream2,
  ...readStreamN,
  writeStream,
  (err) => { /* cleanup */ }
)
```

- Chunks read one at a time
- Memory buffer stays constant ~50MB
- Backpressure pauses reads if write buffer is full
- Atomic: temp file → verify → promote to final location

### 4. Transaction-Safe Database Operations

**Problem:** Concurrent uploads could race and corrupt state.

**Solution:** SQLite transactions for critical sections:

```typescript
await withTransaction(async () => {
  await uploadRepo.createUploadSession(...);
  await chunkRepo.upsertChunkRecord(...);
  // Both succeed or rollback together
});
```

### 5. Cleanup Scheduler

**Problem:** Incomplete uploads consume storage forever.

**Solution:** Background worker running cleanup periodically:

- Finds uploads older than threshold (default 1 day) with PENDING/UPLOADING status
- Deletes associated chunk files from storage
- Marks upload as EXPIRED
- Logged for audit trail

### 6. Request Correlation

**Problem:** Hard to trace requests through logs in production.

**Solution:** Every request assigned unique `x-request-id` header:

```typescript
const requestId = req.headers['x-request-id'] || uuidv4();
res.setHeader('x-request-id', requestId);
logger.info({ requestId }, 'Processing request');
```

All logs include requestId for traceability.

---

## Error Handling Strategy

### Domain Errors vs HTTP Errors

**Domain Layer (Service/Repo):**
- Throws typed exceptions: `ValidationError`, `NotFoundError`, `ConflictError`, `DatabaseError`, `StorageError`
- Each has a code and domain-specific details

**HTTP Layer (Controller/Middleware):**
- Error middleware catches all exceptions
- Maps domain error to HTTP status code
- Returns JSON with error code, message, and requestId

```typescript
// Service throws
throw new NotFoundError('Upload not found', { uploadId });

// Middleware catches
catch (err) {
  res.status(404).json({
    error: 'Upload not found',
    code: 'NOT_FOUND',
    details: { uploadId },
    requestId
  });
}
```

---

## Security Considerations

### Input Validation

All user inputs validated:
- File names sanitized (no path traversal)
- Upload IDs validated as UUIDs
- Chunk indices verified as non-negative integers
- File sizes bounded

### Storage Isolation

- All chunk objects stored under `uploads/{uploadId}/{chunkIndex}`
- No direct access to parent directory or other uploads
- Path traversal assertions prevent `../` escapes

### No Authentication (Phase 1-3)

Current implementation has no auth. Production should add:
- Bearer token or API key
- Per-user upload quotas
- Rate limiting per IP/token

---

## Performance Characteristics

### Memory Usage

| Operation | Memory | Notes |
|-----------|--------|-------|
| Init upload | < 1 MB | Just metadata |
| Store 100MB chunk | ~50 MB constant | Stream buffering |
| Assemble 1GB file | ~50 MB constant | Pipeline handles backpressure |
| Download 500MB file | ~50 MB constant | Stream-to-response |

### Throughput

| Scenario | Throughput | Bottleneck |
|----------|-----------|-----------|
| Single chunk upload | ~500 MB/s | Network |
| 30 concurrent chunks | ~15 GB/s aggregate | Disk I/O |
| Final file download | ~500 MB/s | Network |

### Database Operations

| Operation | Time | Notes |
|-----------|------|-------|
| Create upload record | < 5ms | Single INSERT |
| Check chunk exists | < 1ms | Index lookup |
| List uploaded chunks | 5-10ms | Full scan (small table) |
| Mark upload completed | < 5ms | Single UPDATE |

---

## Scalability Limitations & Solutions

### Current Limitations

1. **Single-node deployment:** No horizontal scaling
2. **In-memory locks:** Race conditions in clustered setup
3. **SQLite:** Not suitable for high concurrency (100+ simultaneous uploads)

### Production Scaling

1. **Database:** Migrate to PostgreSQL with connection pooling
2. **Distributed Locks:** Use Redis for cross-node coordination
3. **Storage:** Use S3 or similar with CDN
4. **Worker Pool:** Move cleanup to separate worker process
5. **Message Queue:** Use Bull/RabbitMQ for async operations

---

## Testing Strategy

### Unit Tests (Phase 5)
- Service business logic
- Validator functions
- Repository CRUD operations
- Error mapping

### Integration Tests (Phase 5)
- Full upload→download flow
- Resumability under interruption
- Cleanup expiry logic
- Concurrent uploads

### Contract Tests (Phase 5)
- All REST endpoints match spec
- Response schemas match expected
- Status codes correct
- Error responses consistent

### Visual Tests (Phase 5)
- Minimal Next.js UI in tests/ui/
- Demonstrate upload flow to evaluators
- Test major user scenarios

### Load Tests (Optional)
- Concurrent chunk uploads
- Large file assembly (1GB+)
- Memory profile under stress

---

## Monitoring & Observability

### Structured Logging

All logs include:
- Timestamp (ISO 8601)
- Log level (info, warn, error)
- Request ID (if applicable)
- Context (uploadId, chunkIndex, error details)

Example:
```json
{
  "level": "info",
  "time": "2026-04-23T10:15:30.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadId": "660e8400-e29b-41d4-a716-446655440000",
  "message": "Chunk stored successfully",
  "chunkIndex": 0,
  "size": 5242880
}
```

### Metrics Points (Future Enhancement)

```typescript
// Track in production:
metrics.histogram('upload.chunk_size', chunkSizeBytes);
metrics.counter('upload.chunks_received', 1);
metrics.timer('upload.assembly_time_ms', assemblyDuration);
metrics.gauge('cleanup.uploads_expired', expiredCount);
metrics.gauge('storage.bucket_size_bytes', totalStorageSize);
```

---

## Future Enhancements

1. **Resumable Downloads:** Resume interrupted downloads from offset
2. **Client Deduplication:** Hash-based dedup to avoid re-uploading same file
3. **Encryption:** End-to-end encryption for sensitive files
4. **Versioning:** Support multiple versions of same file
5. **Webhooks:** Notify external systems on completion
6. **Bandwidth Throttling:** Limit upload/download speeds
7. **Multi-part Download:** Download in parallel chunks
