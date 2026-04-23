#!/bin/bash

# Smoke Test Script for Large File Transfer Service
# Tests all major REST endpoints and validates responses

set -e

API_URL="${1:-http://localhost:3000/api}"
TEST_FILE="${2:-test-10mb.bin}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create test file if it doesn't exist
if [ ! -f "$TEST_FILE" ]; then
  echo "Creating ${TEST_FILE}..."
  dd if=/dev/zero of="$TEST_FILE" bs=1M count=10 2>/dev/null
fi

FILE_SIZE=$(stat -f%z "$TEST_FILE" 2>/dev/null || stat -c%s "$TEST_FILE")
echo "Test file size: $FILE_SIZE bytes"

# Test 1: Health Check
echo -e "${YELLOW}[TEST 1] Health Check${NC}"
HEALTH=$(curl -s "$API_URL/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✓ Health check passed${NC}"
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo "$HEALTH"
  exit 1
fi

# Test 2: Initialize Upload
echo -e "${YELLOW}[TEST 2] Initialize Upload${NC}"
FILE_NAME="smoke-test-$(date +%s).bin"
INIT_RESPONSE=$(curl -s -X POST "$API_URL/upload/init" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"$FILE_NAME\",\"fileSize\":$FILE_SIZE}")

UPLOAD_ID=$(echo "$INIT_RESPONSE" | grep -o '"uploadId":"[^"]*"' | cut -d'"' -f4)
CHUNK_SIZE=$(echo "$INIT_RESPONSE" | grep -o '"chunkSize":[0-9]*' | cut -d':' -f2)

if [ -z "$UPLOAD_ID" ]; then
  echo -e "${RED}✗ Failed to initialize upload${NC}"
  echo "$INIT_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Upload initialized${NC}"
echo "  Upload ID: $UPLOAD_ID"
echo "  Chunk Size: $CHUNK_SIZE"

# Test 3: Upload Chunks
echo -e "${YELLOW}[TEST 3] Upload Chunks${NC}"
CHUNK_COUNT=0
OFFSET=0

while [ $OFFSET -lt $FILE_SIZE ]; do
  CHUNK_END=$((OFFSET + CHUNK_SIZE))
  if [ $CHUNK_END -gt $FILE_SIZE ]; then
    CHUNK_END=$FILE_SIZE
  fi

  dd if="$TEST_FILE" of="chunk_$CHUNK_COUNT.bin" \
    bs=1 skip=$OFFSET count=$((CHUNK_END - OFFSET)) 2>/dev/null

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "$API_URL/upload/$UPLOAD_ID/chunk/$CHUNK_COUNT" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@chunk_$CHUNK_COUNT.bin")

  if [ "$HTTP_STATUS" = "204" ]; then
    echo -e "${GREEN}✓ Chunk $CHUNK_COUNT uploaded${NC}"
  else
    echo -e "${RED}✗ Chunk $CHUNK_COUNT failed (HTTP $HTTP_STATUS)${NC}"
    exit 1
  fi

  rm "chunk_$CHUNK_COUNT.bin"
  OFFSET=$CHUNK_END
  CHUNK_COUNT=$((CHUNK_COUNT + 1))
done

# Test 4: Check Upload Status
echo -e "${YELLOW}[TEST 4] Check Upload Status${NC}"
STATUS_RESPONSE=$(curl -s "$API_URL/upload/$UPLOAD_ID/status")
if echo "$STATUS_RESPONSE" | grep -q '"uploadedChunks"'; then
  echo -e "${GREEN}✓ Status check passed${NC}"
  echo "$STATUS_RESPONSE" | grep -o '"uploadedChunks":\[[^]]*\]'
else
  echo -e "${RED}✗ Status check failed${NC}"
  echo "$STATUS_RESPONSE"
  exit 1
fi

# Test 5: Complete Upload
echo -e "${YELLOW}[TEST 5] Complete Upload${NC}"
COMPLETE_RESPONSE=$(curl -s -X POST "$API_URL/upload/$UPLOAD_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{}')

FILE_ID=$(echo "$COMPLETE_RESPONSE" | grep -o '"fileId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$FILE_ID" ]; then
  echo -e "${RED}✗ Upload completion failed${NC}"
  echo "$COMPLETE_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Upload completed${NC}"
echo "  File ID: $FILE_ID"

# Test 6: Download File
echo -e "${YELLOW}[TEST 6] Download File${NC}"
HTTP_STATUS=$(curl -s -o downloaded_file.bin -w "%{http_code}" \
  "$API_URL/download/$FILE_ID")

if [ "$HTTP_STATUS" = "200" ]; then
  DOWNLOADED_SIZE=$(stat -f%z "downloaded_file.bin" 2>/dev/null || stat -c%s "downloaded_file.bin")
  
  if [ "$DOWNLOADED_SIZE" = "$FILE_SIZE" ]; then
    echo -e "${GREEN}✓ File downloaded successfully${NC}"
    echo "  Downloaded size: $DOWNLOADED_SIZE bytes"
  else
    echo -e "${RED}✗ Downloaded file size mismatch${NC}"
    echo "  Expected: $FILE_SIZE, Got: $DOWNLOADED_SIZE"
    exit 1
  fi
else
  echo -e "${RED}✗ Download failed (HTTP $HTTP_STATUS)${NC}"
  exit 1
fi

rm downloaded_file.bin

# Test 7: Test Idempotency (upload same chunk again)
echo -e "${YELLOW}[TEST 7] Test Idempotency${NC}"
NEW_UPLOAD=$(curl -s -X POST "$API_URL/upload/init" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"idempotent-test.bin\",\"fileSize\":1000000}")

NEW_UPLOAD_ID=$(echo "$NEW_UPLOAD" | grep -o '"uploadId":"[^"]*"' | cut -d'"' -f4)

# Create dummy chunk
dd if=/dev/zero of="dummy_chunk.bin" bs=1024 count=10 2>/dev/null

# Upload twice
curl -s -X PUT "$API_URL/upload/$NEW_UPLOAD_ID/chunk/0" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@dummy_chunk.bin" > /dev/null

SECOND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "$API_URL/upload/$NEW_UPLOAD_ID/chunk/0" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@dummy_chunk.bin")

if [ "$SECOND_RESPONSE" = "204" ]; then
  echo -e "${GREEN}✓ Idempotency test passed${NC}"
else
  echo -e "${RED}✗ Idempotency test failed${NC}"
  exit 1
fi

rm dummy_chunk.bin

# Test 8: Test Cleanup
echo -e "${YELLOW}[TEST 8] Test Cleanup Trigger${NC}"
CLEANUP_RESPONSE=$(curl -s -X POST "$API_URL/testing/run-cleanup" \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$CLEANUP_RESPONSE" | grep -q '"expiredCount"'; then
  echo -e "${GREEN}✓ Cleanup trigger successful${NC}"
else
  echo -e "${RED}✗ Cleanup trigger failed${NC}"
  echo "$CLEANUP_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓✓✓ All smoke tests passed! ✓✓✓${NC}"
