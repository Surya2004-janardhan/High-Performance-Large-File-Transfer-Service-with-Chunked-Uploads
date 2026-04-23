# Testing Guide

## Overview

The Large File Transfer Service includes comprehensive test coverage across multiple levels:

- **Unit Tests** - Service and validator logic
- **Integration Tests** - Full workflows with actual DB/storage
- **Contract Tests** - REST endpoint compliance
- **Visual Tests** - Minimal Next.js UI for interactive testing
- **Smoke Tests** - Shell scripts for quick verification

## Running Tests

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for services)
- SQLite3 client (optional, for DB inspection)

### Start Services

```bash
# Terminal 1: Start API, Database, and Storage
docker-compose up --build
```

Wait for health checks to pass (typically 30-40 seconds):

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "storage": "connected",
  "timestamp": "2026-04-23T10:00:00.000Z"
}
```

### Run Unit & Integration Tests

```bash
# Terminal 2: Run test suite
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

### Run Smoke Tests

Quick verification of all endpoints without full test suite:

```bash
# Using provided shell script
bash scripts/smoke/run-tests.sh

# Or with custom API URL
API_URL=http://custom-host:3000/api bash scripts/smoke/run-tests.sh
```

Expected output:
```
=== Large File Transfer Service - Smoke Tests ===

Test 1: Health Check
✓ Health check passed

Test 2: Create and Initialize Upload
✓ Upload initialized
  Upload ID: 550e8400-e29b-41d4-a716-446655440000
  Chunk Size: 5242880 bytes
  File Size: 10485760 bytes

Test 3: Upload Chunks
✓ Chunk 0 uploaded (5242880 bytes)
✓ Chunk 1 uploaded (5242880 bytes)

...

=== All smoke tests passed! ===
```

### Run Visual Tests (Phase 5)

```bash
cd tests/ui
npm install
npm run dev              # Starts on http://localhost:3001
npm run test:e2e         # Run Playwright e2e tests
```

Then navigate to UI and manually test upload flows.

---

## Test Coverage

### Unit Tests - Services

**File:** `tests/unit/services/*`

Tests individual service methods in isolation:

```bash
npm test -- services/upload.service.spec.ts
```

**Coverage:**
- `initializeUploadSession()` - valid/invalid inputs, ID generation
- `storeChunk()` - idempotency, size validation, duplicate detection
- `completeUpload()` - state validation, assembly success/failure
- `cancelUpload()` - cleanup, error handling
- All validator functions - edge cases, boundary values

### Unit Tests - Validators

**File:** `tests/unit/domain/upload.validators.spec.ts`

```bash
npm test -- upload.validators.spec.ts
```

**Coverage:**
- File name sanitization (path traversal, special chars, length)
- UUID format validation
- Chunk index validation (negative, non-integer)
- File size constraints (zero, negative, too large)
- Content-Length validation

### Integration Tests - Full Workflows

**File:** `tests/integration/upload-lifecycle.spec.ts`

End-to-end flows with real DB and storage:

```bash
npm test -- integration/upload-lifecycle.spec.ts
```

**Scenarios:**
1. **Happy Path:** Init → Upload 2 chunks → Complete → Download
2. **Resumability:** Init → Upload chunk 0 → Check status → Upload chunk 1 → Complete
3. **Interruption Recovery:** Init → Partial upload → Check status (missing chunk) → Resume → Complete
4. **Cancellation:** Init → Upload chunk → Cancel → Verify cleanup
5. **Concurrent Uploads:** Multiple files simultaneously

### Integration Tests - Idempotency

**File:** `tests/integration/idempotent-chunk.spec.ts`

```bash
npm test -- idempotent-chunk.spec.ts
```

**Verification:**
- Upload chunk twice → Same result (204)
- No duplicate in DB (composite key prevents)
- No duplicate in storage
- Chunk count unchanged after re-upload

### Contract Tests - REST Endpoints

**File:** `tests/contract/rest-contract.spec.ts`

Validates all endpoints match the published API specification:

```bash
npm test -- contract/rest-contract.spec.ts
```

**Each endpoint tested for:**
- Status codes (200, 201, 204, 400, 404, 409, 500, 503)
- Response schema (JSON structure, required fields)
- Headers (Content-Type, Content-Length, Content-Disposition)
- Error messages and error codes

**Example:**
```typescript
describe('POST /api/upload/init', () => {
  it('Returns 201 with uploadId and chunkSize', async () => {
    const res = await api.post('/upload/init').send({
      fileName: 'test.bin',
      fileSize: 1000000
    });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('uploadId');
    expect(res.body).toHaveProperty('chunkSize');
  });
});
```

### Integration Tests - Cleanup Worker

**File:** `tests/integration/cleanup-worker.spec.ts`

```bash
npm test -- cleanup-worker.spec.ts
```

**Scenarios:**
1. Set stale threshold to 1 minute
2. Initialize upload (created_at = now)
3. Wait 61 seconds
4. Trigger cleanup via `/api/testing/run-cleanup`
5. Verify:
   - Upload status changed to EXPIRED
   - Chunk files deleted from storage
   - Chunk records deleted from DB

### Performance Tests - Memory Usage

**File:** `tests/performance/large-file-memory.spec.ts`

Tests memory efficiency during large file operations:

```bash
npm test -- performance/large-file-memory.spec.ts
```

**Scenarios:**
1. **1 GB File Assembly:** Monitor heap during final assembly
   - Expected: ~50-100 MB peak heap
   - Warn if > 500 MB
   - Fail if > 1 GB
2. **Download Streaming:** Stream download and check memory
   - Expected: ~50-100 MB constant
   - Fail if heap grows unbounded
3. **Concurrent Uploads:** 30 parallel chunks
   - Track memory during concurrent I/O
   - Verify backpressure prevents buffer explosion

---

## Manual Testing Scenarios

### Scenario 1: Basic Upload & Download

```bash
# Create test file
dd if=/dev/zero of=/tmp/test-file.bin bs=1M count=50

# 1. Initialize
UPLOAD=$(curl -s -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test-file.bin","fileSize":52428800}')
UPLOAD_ID=$(echo $UPLOAD | jq -r '.uploadId')
CHUNK_SIZE=$(echo $UPLOAD | jq -r '.chunkSize')

# 2. Split and upload chunks
split -b $CHUNK_SIZE /tmp/test-file.bin /tmp/chunk_

for i in {00..09}; do
  curl -X PUT "http://localhost:3000/api/upload/$UPLOAD_ID/chunk/${i##0}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @/tmp/chunk_$i
done

# 3. Verify status
curl http://localhost:3000/api/upload/$UPLOAD_ID/status | jq

# 4. Complete
COMPLETE=$(curl -s -X POST http://localhost:3000/api/upload/$UPLOAD_ID/complete \
  -H "Content-Type: application/json" \
  -d '{}')
FILE_ID=$(echo $COMPLETE | jq -r '.fileId')

# 5. Download
curl -O -J http://localhost:3000/api/download/$FILE_ID

# 6. Verify
md5sum /tmp/test-file.bin downloaded_file
```

### Scenario 2: Resumable Upload

```bash
# Start upload with large file
dd if=/dev/zero of=/tmp/large.bin bs=1M count=100

UPLOAD=$(curl -s -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"large.bin","fileSize":104857600}')
UPLOAD_ID=$(echo $UPLOAD | jq -r '.uploadId')

# Upload first 10 chunks
split -b 5242880 /tmp/large.bin /tmp/chunk_
for i in {00..09}; do
  curl -X PUT "http://localhost:3000/api/upload/$UPLOAD_ID/chunk/${i##0}" \
    --data-binary @/tmp/chunk_$i
done

# Simulate interruption (network goes down)
# ... time passes ...

# Check status - see which chunks are missing
curl http://localhost:3000/api/upload/$UPLOAD_ID/status

# Resume: upload remaining chunks
for i in {10..19}; do
  curl -X PUT "http://localhost:3000/api/upload/$UPLOAD_ID/chunk/${i##0}" \
    --data-binary @/tmp/chunk_$i
done

# Complete
curl -X POST http://localhost:3000/api/upload/$UPLOAD_ID/complete \
  -H "Content-Type: application/json" -d '{}'
```

### Scenario 3: Error Cases

```bash
# Missing upload ID
curl http://localhost:3000/api/upload/invalid-id/status
# Expected: 400 Bad Request

# Non-existent upload
curl http://localhost:3000/api/upload/550e8400-e29b-41d4-a716-446655440000/status
# Expected: 404 Not Found

# Complete without all chunks
curl -X POST http://localhost:3000/api/upload/$UPLOAD_ID/complete \
  -H "Content-Type: application/json" -d '{}'
# Expected: 400 Bad Request (missing chunks)

# Invalid file name
curl -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"","fileSize":1000}'
# Expected: 400 Bad Request

# File size too large
curl -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"huge.bin","fileSize":999999999999999}'
# Expected: 400 Bad Request
```

---

## Debugging

### Enable Debug Logging

```bash
LOG_LEVEL=debug npm run dev
```

All logs show:
- Request ID for correlation
- Operation timing
- Database queries
- Storage operations

### Inspect Database

```bash
# Connect to SQLite
sqlite3 data/uploads.db

# List all uploads
SELECT id, file_name, status, created_at FROM uploads;

# List chunks for upload
SELECT chunk_index, size FROM chunks WHERE upload_id='550e8400-...';

# Check files
SELECT id, file_name, file_size FROM files;
```

### Check Storage Objects

```bash
# List MinIO buckets
docker-compose exec minio mc ls local

# List upload objects
docker-compose exec minio mc ls local/uploads

# View MinIO console
# Open http://localhost:9001 in browser
# Login: minioadmin / minioadmin
```

### Network Debugging

```bash
# Verbose curl with headers and timing
curl -v -w '@curl-format.txt' http://localhost:3000/api/health

# Monitor active connections
netstat -an | grep 3000

# See request/response bodies
HTTP_PROXY=http://localhost:8080 curl ...  # with local proxy
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      minio:
        image: minio/minio:latest
        env:
          MINIO_ROOT_USER: minioadmin
          MINIO_ROOT_PASSWORD: minioadmin
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

---

## Troubleshooting

### Tests hang / timeout

- Check if services are running: `docker-compose ps`
- Verify health: `curl http://localhost:3000/api/health`
- Check logs: `docker-compose logs api`

### Database locked errors

```bash
# Reset database
rm data/uploads.db
docker-compose restart api
```

### Storage connection issues

```bash
# Check MinIO health
docker-compose exec minio mc ready local

# View MinIO logs
docker-compose logs minio
```

### Memory test failures

- Close other applications
- Check available RAM: `free -h`
- Reduce test file sizes temporarily
- Profile with: `node --prof` and analysis tools
