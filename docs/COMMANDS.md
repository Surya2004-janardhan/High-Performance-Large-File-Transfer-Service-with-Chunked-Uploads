
## Quick Start (1 Command)
```bash
docker-compose up --build -d
```
**What it does:** Starts API server on port 3000 + MinIO on port 9001 in background

---

## Section 1: Docker Commands

### Start Services (Background)
```bash
docker-compose up --build -d
```
- **-d** = detached (background)
- **--build** = rebuild images
- Runs in foreground, press Ctrl+C to stop

### Start Services (Foreground - See Logs)
```bash
docker-compose up --build
```
- Shows all logs in real-time
- Press Ctrl+C to stop

### Check Status
```bash
docker-compose ps
```
Shows:
```
NAME         STATUS              PORTS
lft-api      Up (healthy)        0.0.0.0:3000->3000/tcp
lft-minio    Up (healthy)        0.0.0.0:9001->9001/tcp, 9000/tcp
```

### Stop Services
```bash
docker-compose stop
```

### Stop & Remove Containers
```bash
docker-compose down
```

### Remove Everything (containers + volumes)
```bash
docker-compose down -v
```
⚠️ **Warning:** Deletes database data!

### View Logs
```bash
# All services
docker-compose logs -f

# Just API
docker-compose logs -f lft-api

# Just MinIO
docker-compose logs -f lft-minio

# Last 100 lines
docker-compose logs --tail=100
```

### Rebuild from Scratch
```bash
docker-compose down -v && docker-compose up --build -d
```
**Warning:** Deletes database, starts fresh

---

## Section 2: Manual API Testing

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```
**Expected Response:**
```json
{
  "status": "OK",
  "timestamp": "2026-04-25T10:00:00Z",
  "database": "connected",
  "storage": "connected"
}
```

### 2. Initialize Upload
```bash
curl -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test-video.mp4",
    "fileSize": 10485760
  }'
```
**Response:** Save `uploadId` from response
```json
{
  "uploadId": "abc-123-def-456",
  "chunkSize": 5242880,
  "totalChunks": 2
}
```

### 3. Create Test File (10MB)
```bash
dd if=/dev/zero of=test-file.bin bs=1M count=10
```
Creates 10MB binary file named `test-file.bin`

### 4. Split File into Chunks
```bash
split -b 5242880 test-file.bin chunk-
```
Creates: `chunk-aa`, `chunk-ab` (each 5MB)

### 5. Upload Chunk 0
```bash
UPLOAD_ID="abc-123-def-456"  # Replace with real uploadId

curl -X PUT http://localhost:3000/api/upload/$UPLOAD_ID/chunk/0 \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk-aa
```
**Expected:** 204 No Content

### 6. Upload Chunk 1
```bash
curl -X PUT http://localhost:3000/api/upload/$UPLOAD_ID/chunk/1 \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk-ab
```
**Expected:** 204 No Content

### 7. Check Upload Status
```bash
curl http://localhost:3000/api/upload/$UPLOAD_ID/status
```
**Response:**
```json
{
  "uploadedChunks": [0, 1],
  "status": "UPLOADING",
  "progress": "100%"
}
```

### 8. Complete Upload
```bash
curl -X POST http://localhost:3000/api/upload/$UPLOAD_ID/complete \
  -H "Content-Type: application/json" \
  -d '{}'
```
**Response:** Save `fileId`
```json
{
  "fileId": "xyz-789-uvw-012",
  "fileName": "test-video.mp4",
  "fileSize": 10485760
}
```

### 9. Download File
```bash
FILE_ID="xyz-789-uvw-012"  # Replace with real fileId

curl -o downloaded-file.bin http://localhost:3000/api/upload/download/$FILE_ID
```

### 10. Verify File Integrity
```bash
# Original
md5sum test-file.bin

# Downloaded
md5sum downloaded-file.bin

# Should match!
```

### 11. Cancel Upload (Optional)
```bash
curl -X DELETE http://localhost:3000/api/upload/$UPLOAD_ID
```
**Result:** Deletes upload + chunks, returns 204

### 12. Manual Cleanup
```bash
curl -X POST http://localhost:3000/api/testing/run-cleanup \
  -H "Content-Type: application/json" \
  -d '{}'
```
**Response:**
```json
{
  "cleanedUploads": 0,
  "deletedChunks": 0,
  "freedBytes": 0
}
```

---

## Section 3: Automated Testing

### Run Full Smoke Test Suite
```bash
bash scripts/smoke/run-tests.sh
```

**Output (9 tests):**
```
✓ Test 1: Health Check
✓ Test 2: Initialize Upload  
✓ Test 3: Upload Chunks
✓ Test 4: Check Upload Status
✓ Test 5: Complete Upload
✓ Test 6: Download File
✓ Test 7: Idempotent Re-upload
✓ Test 8: Cancel Upload
✓ Test 9: Manual Cleanup

=== All smoke tests passed! ===
```

### Run Specific Test
```bash
# Extract test from script and run manually
# Or modify scripts/smoke/run-tests.sh to comment out tests

bash scripts/smoke/run-tests.sh 2>&1 | grep "Test 1"
```

---

## Section 4: Complete Workflow (Copy-Paste All)

### Step 1: Start Services
```bash
docker-compose up --build -d
sleep 5  # Wait for startup
```

### Step 2: Create Test File
```bash
dd if=/dev/zero of=test-file-10mb.bin bs=1M count=10
```

### Step 3: Run Tests
```bash
bash scripts/smoke/run-tests.sh
```

### Step 4: Verify Everything Works
```bash
curl http://localhost:3000/api/health
```

---

## Section 5: Troubleshooting Commands

### Check If Services Are Running
```bash
docker-compose ps
```

### View API Logs
```bash
docker-compose logs lft-api --tail=50
```

### View MinIO Logs
```bash
docker-compose logs lft-minio --tail=50
```

### Check Container Health
```bash
docker inspect lft-api | grep -A 5 "HealthStatus"
docker inspect lft-minio | grep -A 5 "HealthStatus"
```

### Rebuild API Only (After Code Changes)
```bash
docker-compose up -d --build lft-api
```

### Force Rebuild (Clear Cache)
```bash
docker-compose build --no-cache lft-api
docker-compose up -d lft-api
```

### Remove All Docker Resources
```bash
docker-compose down -v && docker system prune -f
```

---

## Section 6: Performance Testing

### Upload 50MB File
```bash
# Create 50MB file
dd if=/dev/zero of=large-file.bin bs=1M count=50

# Initialize
UPLOAD=$(curl -s -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"large.bin","fileSize":52428800}')

UPLOAD_ID=$(echo $UPLOAD | grep -o '"uploadId":"[^"]*' | cut -d'"' -f4)

# Split
split -b 5242880 large-file.bin chunk-

# Upload all chunks
for f in chunk-*; do
  INDEX="${f: -2}"  # Get last 2 chars (aa, ab, ac, etc)
  NUM=$(($(echo "$INDEX" | od -An -td1 | tr -d ' ') - 97))  # Convert to 0-indexed
  
  curl -X PUT http://localhost:3000/api/upload/$UPLOAD_ID/chunk/$NUM \
    --data-binary @$f
  echo "Uploaded chunk $NUM"
done

# Complete
curl -X POST http://localhost:3000/api/upload/$UPLOAD_ID/complete \
  -H "Content-Type: application/json" -d '{}'

# Download
curl -o downloaded.bin http://localhost:3000/api/upload/download/$FILE_ID

# Verify
md5sum large-file.bin downloaded.bin
```

---

## Section 7: Monitor Services (Real-time)

### Watch Container Status
```bash
watch -n 2 'docker-compose ps'
```
Updates every 2 seconds. Press Ctrl+C to exit.

### Watch Logs Live
```bash
docker-compose logs -f --tail=20
```
Shows last 20 lines, updates in real-time.

### Check Resource Usage
```bash
docker stats lft-api lft-minio
```
Shows CPU, memory, network usage in real-time.

---

## Section 8: Simple Test Script (Bash)

Save as `quick-test.sh`:

```bash
#!/bin/bash

echo "🚀 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services..."
sleep 5

echo "✅ Running health check..."
curl -s http://localhost:3000/api/health | jq '.'

echo "📝 Creating 10MB test file..."
dd if=/dev/zero of=test.bin bs=1M count=10 2>/dev/null

echo "🔼 Running smoke tests..."
bash scripts/smoke/run-tests.sh

echo "✨ Done!"
```

Run:
```bash
chmod +x quick-test.sh
./quick-test.sh
```

---

## Section 9: Quick Reference

| Command | Purpose |
|---------|---------|
| `docker-compose up -d` | Start in background |
| `docker-compose down` | Stop & remove |
| `docker-compose logs -f` | View logs |
| `docker-compose ps` | Check status |
| `curl http://localhost:3000/api/health` | Health check |
| `bash scripts/smoke/run-tests.sh` | Run all tests |
| `dd if=/dev/zero of=file.bin bs=1M count=10` | Create 10MB file |
| `split -b 5242880 file.bin chunk-` | Split into 5MB chunks |
| `md5sum file.bin` | File hash/checksum |

---

## Section 10: API Ports Reference

| Service | Port | Purpose | URL |
|---------|------|---------|-----|
| API | 3000 | File transfer API | `http://localhost:3000` |
| MinIO | 9001 | S3-compatible storage | `http://localhost:9001` |
| MinIO API | 9000 | Internal (container only) | N/A |

---

## Pro Tips

### Fastest Full Cycle (10 seconds)
```bash
# 1 command = start + health check + logs
docker-compose up -d && sleep 3 && curl http://localhost:3000/api/health && docker-compose logs --tail=20
```

### Clean Start from Scratch
```bash
docker-compose down -v && docker system prune -f && docker-compose up --build -d
```

### Test Without Running Manually
```bash
# One line = everything
docker-compose up --build -d && sleep 5 && bash scripts/smoke/run-tests.sh
```

### Debug Single Endpoint
```bash
# Initialize upload + save ID + print response
INIT=$(curl -s -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.mp4","fileSize":10485760}')

echo $INIT | jq '.'  # Pretty print JSON
```

---

## Expected Behavior

### Healthy System
```bash
$ docker-compose ps
NAME         STATUS              
lft-api      Up (healthy)        
lft-minio    Up (healthy)        

$ curl http://localhost:3000/api/health
{"status":"OK","database":"connected","storage":"connected"}

$ bash scripts/smoke/run-tests.sh
✓ Test 1: Health Check
✓ Test 2: Initialize Upload
[... all 9 tests pass ...]
=== All smoke tests passed! ===
```

### Unhealthy Signs
- Container status: "Restarting"
- Health check 404/500 errors
- Smoke test failures
- Logs show errors

⚠️ **If unhealthy:**
```bash
# View error logs
docker-compose logs lft-api --tail=50

# Restart services
docker-compose down && docker-compose up --build -d
```

