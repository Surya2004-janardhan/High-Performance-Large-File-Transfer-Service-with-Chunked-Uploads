#!/bin/bash

# Smoke test script for Large File Transfer Service
# Tests all critical API endpoints with sample files

set -e

API_URL="${API_URL:-http://localhost:3000/api}"
CHUNK_SIZE=5242880  # 5MB
TEMP_DIR="/tmp/lft-smoke-test-$$"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Large File Transfer Service - Smoke Tests ===${NC}\n"

# Create temp directory
mkdir -p "$TEMP_DIR"
trap "rm -rf $TEMP_DIR" EXIT

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
HEALTH=$(curl -s "$API_URL/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✓ Health check passed${NC}\n"
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo "$HEALTH"
  exit 1
fi

# Test 2: Create small test file (10MB)
echo -e "${YELLOW}Test 2: Create and Initialize Upload${NC}"
TEST_FILE="$TEMP_DIR/test.bin"
dd if=/dev/zero of="$TEST_FILE" bs=1M count=10 2>/dev/null
FILE_SIZE=$(stat -f%z "$TEST_FILE" 2>/dev/null || stat -c%s "$TEST_FILE" 2>/dev/null)

INIT_RESPONSE=$(curl -s -X POST "$API_URL/upload/init" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"test.bin\",\"fileSize\":$FILE_SIZE}")

UPLOAD_ID=$(echo "$INIT_RESPONSE" | grep -o '"uploadId":"[^"]*' | cut -d'"' -f4)
RETURNED_CHUNK_SIZE=$(echo "$INIT_RESPONSE" | grep -o '"chunkSize":[0-9]*' | cut -d':' -f2)

if [ -z "$UPLOAD_ID" ]; then
  echo -e "${RED}✗ Failed to initialize upload${NC}"
  echo "$INIT_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Upload initialized${NC}"
echo "  Upload ID: $UPLOAD_ID"
echo "  Chunk Size: $RETURNED_CHUNK_SIZE bytes"
echo "  File Size: $FILE_SIZE bytes\n"

# Test 3: Upload chunks
echo -e "${YELLOW}Test 3: Upload Chunks${NC}"
CHUNKS_UPLOADED=0
OFFSET=0

while [ $OFFSET -lt $FILE_SIZE ]; do
  CHUNK_INDEX=$((CHUNKS_UPLOADED))
  REMAINING=$((FILE_SIZE - OFFSET))
  CHUNK_BYTES=$((REMAINING < CHUNK_SIZE ? REMAINING : CHUNK_SIZE))

  # Extract chunk
  CHUNK_FILE="$TEMP_DIR/chunk_$CHUNK_INDEX.bin"
  dd if="$TEST_FILE" of="$CHUNK_FILE" bs=1 skip=$OFFSET count=$CHUNK_BYTES 2>/dev/null

  # Upload chunk
  UPLOAD_STATUS=$(curl -s -w "\n%{http_code}" -X PUT \
    "$API_URL/upload/$UPLOAD_ID/chunk/$CHUNK_INDEX" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@$CHUNK_FILE")

  HTTP_CODE=$(echo "$UPLOAD_STATUS" | tail -n1)
  if [ "$HTTP_CODE" = "204" ]; then
    echo -e "${GREEN}✓ Chunk $CHUNK_INDEX uploaded (${CHUNK_BYTES} bytes)${NC}"
    CHUNKS_UPLOADED=$((CHUNKS_UPLOADED + 1))
  else
    echo -e "${RED}✗ Failed to upload chunk $CHUNK_INDEX (HTTP $HTTP_CODE)${NC}"
    exit 1
  fi

  OFFSET=$((OFFSET + CHUNK_BYTES))
done

echo -e "\n"

# Test 4: Check upload status
echo -e "${YELLOW}Test 4: Check Upload Status${NC}"
STATUS_RESPONSE=$(curl -s "$API_URL/upload/$UPLOAD_ID/status")
UPLOADED_COUNT=$(echo "$STATUS_RESPONSE" | grep -o '\[.*\]' | tr -cd ',' | wc -c)
UPLOADED_COUNT=$((UPLOADED_COUNT + 1))

if [ "$UPLOADED_COUNT" -eq "$CHUNKS_UPLOADED" ]; then
  echo -e "${GREEN}✓ All $UPLOADED_COUNT chunks confirmed uploaded${NC}\n"
else
  echo -e "${RED}✗ Chunk count mismatch (expected $CHUNKS_UPLOADED, got $UPLOADED_COUNT)${NC}"
  echo "$STATUS_RESPONSE"
  exit 1
fi

# Test 5: Complete upload
echo -e "${YELLOW}Test 5: Complete Upload${NC}"
COMPLETE_RESPONSE=$(curl -s -X POST "$API_URL/upload/$UPLOAD_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{}')

FILE_ID=$(echo "$COMPLETE_RESPONSE" | grep -o '"fileId":"[^"]*' | cut -d'"' -f4)

if [ -z "$FILE_ID" ]; then
  echo -e "${RED}✗ Failed to complete upload${NC}"
  echo "$COMPLETE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Upload completed${NC}"
echo "  File ID: $FILE_ID\n"

# Test 6: Download file
echo -e "${YELLOW}Test 6: Download File${NC}"
DOWNLOAD_FILE="$TEMP_DIR/downloaded.bin"

curl -s -o "$DOWNLOAD_FILE" "$API_URL/download/$FILE_ID"

DOWNLOADED_SIZE=$(stat -f%z "$DOWNLOAD_FILE" 2>/dev/null || stat -c%s "$DOWNLOAD_FILE" 2>/dev/null)

if [ "$DOWNLOADED_SIZE" -eq "$FILE_SIZE" ]; then
  echo -e "${GREEN}✓ File downloaded successfully ($DOWNLOADED_SIZE bytes)${NC}"
else
  echo -e "${RED}✗ Downloaded file size mismatch (expected $FILE_SIZE, got $DOWNLOADED_SIZE)${NC}"
  exit 1
fi

# Verify file integrity if md5sum available
if command -v md5sum &> /dev/null; then
  ORIGINAL_MD5=$(md5sum "$TEST_FILE" | awk '{print $1}')
  DOWNLOADED_MD5=$(md5sum "$DOWNLOAD_FILE" | awk '{print $1}')
  
  if [ "$ORIGINAL_MD5" = "$DOWNLOADED_MD5" ]; then
    echo -e "${GREEN}✓ File integrity verified (MD5 checksum matches)${NC}\n"
  else
    echo -e "${RED}✗ File integrity check failed (MD5 mismatch)${NC}"
    exit 1
  fi
fi

# Test 7: Test idempotency (re-upload same chunk)
echo -e "${YELLOW}Test 7: Test Idempotent Re-upload${NC}"

INIT_RESPONSE=$(curl -s -X POST "$API_URL/upload/init" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"idempotent-test.bin\",\"fileSize\":$FILE_SIZE}")

UPLOAD_ID_2=$(echo "$INIT_RESPONSE" | grep -o '"uploadId":"[^"]*' | cut -d'"' -f4)

CHUNK_FILE="$TEMP_DIR/chunk_0.bin"
dd if="$TEST_FILE" of="$CHUNK_FILE" bs=1 count=$CHUNK_SIZE 2>/dev/null

# Upload chunk first time
curl -s -X PUT "$API_URL/upload/$UPLOAD_ID_2/chunk/0" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$CHUNK_FILE" > /dev/null

# Upload same chunk second time (should succeed)
REUPLOAD_STATUS=$(curl -s -w "\n%{http_code}" -X PUT \
  "$API_URL/upload/$UPLOAD_ID_2/chunk/0" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$CHUNK_FILE")

HTTP_CODE=$(echo "$REUPLOAD_STATUS" | tail -n1)
if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✓ Idempotent re-upload succeeded (HTTP $HTTP_CODE)${NC}\n"
else
  echo -e "${RED}✗ Idempotent re-upload failed (HTTP $HTTP_CODE)${NC}"
  exit 1
fi

# Test 8: Cancel upload
echo -e "${YELLOW}Test 8: Cancel Upload${NC}"

INIT_RESPONSE=$(curl -s -X POST "$API_URL/upload/init" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"cancel-test.bin\",\"fileSize\":1000000}")

UPLOAD_ID_3=$(echo "$INIT_RESPONSE" | grep -o '"uploadId":"[^"]*' | cut -d'"' -f4)

DROP_STATUS=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL/upload/$UPLOAD_ID_3")
HTTP_CODE=$(echo "$DROP_STATUS" | tail -n1)

if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✓ Upload cancelled successfully (HTTP $HTTP_CODE)${NC}\n"
else
  echo -e "${RED}✗ Failed to cancel upload (HTTP $HTTP_CODE)${NC}"
  exit 1
fi

# Test 9: Manual cleanup (if available)
if curl -s "$API_URL/testing/run-cleanup" > /dev/null 2>&1; then
  echo -e "${YELLOW}Test 9: Manual Cleanup${NC}"
  CLEANUP_RESPONSE=$(curl -s -X POST "$API_URL/testing/run-cleanup" \
    -H "Content-Type: application/json" \
    -d '{}')
  
  if echo "$CLEANUP_RESPONSE" | grep -q '"expiredCount"'; then
    echo -e "${GREEN}✓ Cleanup executed successfully${NC}\n"
  else
    echo -e "${RED}✗ Cleanup endpoint issue${NC}"
  fi
fi

echo -e "${GREEN}=== All smoke tests passed! ===${NC}"
