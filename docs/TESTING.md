# Testing Guide - Integration & Smoke Tests

## Quick Start: Run All Tests

### One Command to Run Everything
```bash
npm run test:integration
```

**What it does:**
- Runs 12 comprehensive integration tests
- Tests happy path, errors, concurrency, large files
- Takes ~30 seconds
- Shows pass/fail summary

---

## Available Test Commands

### Integration Tests (TypeScript)
```bash
npm run test:integration
```
- **Pros:** Detailed output, many test cases, programmatic
- **Cons:** Requires dependencies
- **Time:** ~30-40 seconds
- **Tests:** 12 scenarios
- **File:** `tests/integration.test.ts`

### Smoke Tests (Bash Script)
```bash
bash scripts/smoke/run-tests.sh
```
- **Pros:** Simple, shell-based, works anywhere
- **Cons:** Less detailed
- **Time:** ~20-30 seconds
- **Tests:** 9 scenarios
- **File:** `scripts/smoke/run-tests.sh`

### Run Both
```bash
npm run test:all
```
- Runs integration tests + smoke tests
- Comprehensive validation
- Time: ~60 seconds

---

## Setup Required

### Install Dependencies (First Time Only)
```bash
npm install
```

### Ensure Services Are Running
```bash
docker-compose up -d
sleep 3  # Wait for startup
```

### Verify Services Are Healthy
```bash
curl http://localhost:3000/api/health
```

Should return:
```json
{"status":"OK","database":"connected","storage":"connected"}
```

---

## Integration Test Details

### What Tests Run? (12 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | Health Check | Verify API is responding |
| 2 | Initialize Upload | Create upload session |
| 3 | Upload Chunks | Store file chunks (idempotency) |
| 4 | Check Upload Status | Verify progress tracking |
| 5 | Complete Upload | Assemble chunks into file |
| 6 | Download File | Retrieve completed file |
| 7 | Verify File Integrity | Ensure data isn't corrupted |
| 8 | Idempotent Upload | Re-upload same chunk (no duplicates) |
| 9 | Cancel Upload | Delete in-progress upload |
| 10 | Manual Cleanup | Trigger background cleanup |
| 11 | Concurrent Uploads | Multiple simultaneous uploads |
| 12 | Large File (50MB) | Stress test with many chunks |
| 13 | Download Non-existent | Error handling (404) |

### Test Output Example

```
🚀 Starting Integration Test Suite

API Base URL: http://localhost:3000

✅ Health Check (145ms)
✅ Initialize Upload (120ms)
✅ Upload Chunks (basic-upload) (254ms)
✅ Check Upload Status (basic-upload) (89ms)
✅ Complete Upload (basic-upload) (156ms)
✅ Download File (basic-upload) (201ms)
✅ Verify File Integrity (basic-upload) (180ms)
✅ Idempotent Upload (Re-upload Chunk) (312ms)
✅ Cancel Upload (267ms)
✅ Manual Cleanup (134ms)
✅ Concurrent Uploads (3 simultaneous) (298ms)
✅ Large File Upload (50MB) (892ms)
✅ Download Non-existent File (Error Case) (78ms)

======================================================================
TEST RESULTS SUMMARY
======================================================================

Total Tests: 13
Passed: 13 ✅
Failed: 0 ❌
Total Time: 3456ms

======================================================================
🎉 ALL TESTS PASSED! 🎉
======================================================================
```

---

## Smoke Test Details

### What Tests Run? (9 tests)

```
✓ Test 1: Health Check
✓ Test 2: Create and Initialize Upload
✓ Test 3: Upload Chunks
✓ Test 4: Check Upload Status
✓ Test 5: Complete Upload
✓ Test 6: Download File
✓ Test 7: Idempotent Re-upload
✓ Test 8: Cancel Upload
✓ Test 9: Manual Cleanup
```

### Run Specific Test (Advanced)
```bash
# Extract just health check from smoke tests
bash scripts/smoke/run-tests.sh | grep -A 5 "Test 1"
```

---

## Complete Testing Workflow

### Step 1: Clean Start
```bash
docker-compose down -v
docker-compose up --build -d
sleep 5
```

### Step 2: Run Integration Tests
```bash
npm run test:integration
```

### Step 3: Run Smoke Tests
```bash
bash scripts/smoke/run-tests.sh
```

### Step 4: All in One
```bash
npm run test:all
```

---

## Continuous Testing (Watch Mode)

### Watch for Changes & Run Tests
```bash
# Install watchman first
brew install watchman  # macOS
# or
apt-get install watchman  # Linux

# Then run tests on file changes
npm run test:watch
```

---

## Debugging Test Failures

### If Integration Tests Fail

**Check 1: Is API running?**
```bash
curl http://localhost:3000/api/health
```

**Check 2: View API logs**
```bash
docker-compose logs lft-api --tail=50
```

**Check 3: Check disk space**
```bash
du -sh /tmp/
```
Tests create temp files here.

**Check 4: Restart everything**
```bash
docker-compose down -v
docker-compose up --build -d
sleep 5
npm run test:integration
```

### If Smoke Tests Fail

**Check 1: Run health check manually**
```bash
curl http://localhost:3000/api/health
```

**Check 2: View container status**
```bash
docker-compose ps
```

**Check 3: Check MinIO**
```bash
curl http://localhost:9001
```

---

## Test Configuration

### Modify Integration Test Parameters

**File:** `tests/integration.test.ts`

```typescript
// Change API URL (default: http://localhost:3000)
const suite = new IntegrationTestSuite('http://your-api-url');

// Change chunk size (currently 5MB)
const chunkSize = 5242880;  // Line ~XXX

// Change file size for large test (currently 50MB)
fileSize: 52428800,  // Line ~XXX
```

### Rebuild Test After Changes
```bash
npm run build
npm run test:integration
```

---

## Performance Metrics

### Expected Timings

| Test | Time | Notes |
|------|------|-------|
| Health Check | <200ms | Simple request |
| Init Upload | <200ms | Database write |
| Upload 5MB Chunk | 100-500ms | Depends on disk I/O |
| Complete Upload | 200-800ms | Assembly process |
| Download 5MB | 100-300ms | Streaming |
| 50MB Large File | 5-15 seconds | 10 chunks × individual uploads |
| All 13 tests | 30-50 seconds | Depends on system |

### Typical Full Run
```
Environment: Docker on modern laptop
Duration: ~35 seconds
Result: All 13 tests pass
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Run Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Start Docker services
        run: docker-compose up -d && sleep 5
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Run smoke tests
        run: bash scripts/smoke/run-tests.sh
```

---

## Troubleshooting

### "Connection refused" Error
```bash
# Services not running?
docker-compose up -d && sleep 5
```

### "Address already in use" Error
```bash
# Port 3000 or 9001 already in use?
lsof -i :3000
lsof -i :9001
# Kill the process
kill -9 <PID>
```

### "File not found" Error
```bash
# Temp files cleanup issue?
rm -rf /tmp/chunk-* /tmp/downloaded-* /tmp/lft-assembly/ 
```

### "SQLITE_CANTOPEN" Error
```bash
# Database permission issue?
docker-compose down -v
docker-compose up --build -d
```

### Tests Timeout
```bash
# Increase timeout in tests/integration.test.ts
timeout: 60000,  // 60 seconds instead of 30
```

---

## Manual Testing (No Automation)

If you want to test manually instead:

```bash
# 1. Initialize
UPLOAD=$(curl -s -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.bin","fileSize":10485760}')

UPLOAD_ID=$(echo $UPLOAD | grep -o '"uploadId":"[^"]*' | cut -d'"' -f4)
echo "Upload ID: $UPLOAD_ID"

# 2. Create test file
dd if=/dev/zero of=test.bin bs=1M count=10

# 3. Split into chunks
split -b 5242880 test.bin chunk-

# 4. Upload chunks
for f in chunk-*; do
  INDEX=$(printf '%d' "'${f: -1}")
  curl -X PUT http://localhost:3000/api/upload/$UPLOAD_ID/chunk/$INDEX \
    --data-binary @$f
done

# 5. Complete
FILE=$(curl -s -X POST http://localhost:3000/api/upload/$UPLOAD_ID/complete \
  -H "Content-Type: application/json" -d '{}')

FILE_ID=$(echo $FILE | grep -o '"fileId":"[^"]*' | cut -d'"' -f4)
echo "File ID: $FILE_ID"

# 6. Download
curl -o downloaded.bin http://localhost:3000/api/upload/download/$FILE_ID

# 7. Verify
md5sum test.bin downloaded.bin
```

---

## Test Results File

Tests don't generate a results file, but you can capture output:

```bash
# Save to file
npm run test:integration > test-results.txt 2>&1

# View results
cat test-results.txt

# Run smoke tests and save
bash scripts/smoke/run-tests.sh > smoke-results.txt 2>&1
```

---

## Summary

**Quick Commands:**

| Goal | Command | Time |
|------|---------|------|
| Run integration tests | `npm run test:integration` | 30-40s |
| Run smoke tests | `bash scripts/smoke/run-tests.sh` | 20-30s |
| Run both | `npm run test:all` | 50-70s |
| Watch mode | `npm run test:watch` | Continuous |
| Manual test | See [Manual Testing](#manual-testing-no-automation) section | Variable |

**Before testing:**
```bash
docker-compose up -d && sleep 3
```

**Expected result:**
```
✅ All tests pass
🎉 Project is working!
```

