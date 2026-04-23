# REST API Documentation

## Overview

The Large File Transfer Service provides a complete REST API for managing chunked file uploads, resumable transfers, and downloads.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, the API requires no authentication. In production, add Bearer token or API key authentication.

---

## Endpoints

### 1. Initialize Upload

**POST** `/upload/init`

Initialize a new upload session and get the upload ID and chunk size.

**Request Body:**
```json
{
  "fileName": "document.pdf",
  "fileSize": 104857600
}
```

**Response** `201 Created`:
```json
{
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "chunkSize": 5242880
}
```

**Error Cases:**
- `400 Bad Request` - Invalid fileName or fileSize
- `500 Internal Server Error` - Database error

---

### 2. Upload Chunk

**PUT** `/upload/{uploadId}/chunk/{chunkIndex}`

Upload a single chunk of binary data. This endpoint is **idempotent** — uploading the same chunk twice will succeed both times without duplication.

**Path Parameters:**
- `uploadId` (string, UUID) - Upload session ID from init
- `chunkIndex` (integer, ≥ 0) - Zero-based chunk index

**Request Headers:**
- `Content-Type: application/octet-stream`
- `Content-Length: <bytes>` - Chunk size in bytes

**Request Body:**
Raw binary data of the chunk

**Response** `204 No Content`:
```
(empty body)
```

**Error Cases:**
- `400 Bad Request` - Invalid uploadId or chunkIndex
- `404 Not Found` - Upload session not found
- `409 Conflict` - Upload already completed
- `500 Internal Server Error` - Storage error

**Example (cURL):**
```bash
curl -X PUT "http://localhost:3000/api/upload/550e8400-e29b-41d4-a716-446655440000/chunk/0" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk_0.bin
```

---

### 3. Get Upload Status

**GET** `/upload/{uploadId}/status`

Retrieve the list of chunks that have been successfully uploaded. Used for resuming interrupted uploads.

**Path Parameters:**
- `uploadId` (string, UUID) - Upload session ID

**Response** `200 OK`:
```json
{
  "uploadedChunks": [0, 1, 2, 4]
}
```

Indicates chunks 0, 1, 2, and 4 have been uploaded; chunk 3 is missing.

**Error Cases:**
- `400 Bad Request` - Invalid uploadId format
- `404 Not Found` - Upload session not found

---

### 4. Complete Upload

**POST** `/upload/{uploadId}/complete`

Finalize the upload. Verifies all chunks are present, assembles them into the final file, and moves it to permanent storage.

**Path Parameters:**
- `uploadId` (string, UUID) - Upload session ID

**Request Body:**
```json
{}
```

**Response** `200 OK`:
```json
{
  "fileId": "660e8400-e29b-41d4-a716-446655440000",
  "fileName": "document.pdf",
  "fileSize": 104857600,
  "mimeType": "application/pdf"
}
```

**Error Cases:**
- `400 Bad Request` - Missing chunks or invalid uploadId
- `404 Not Found` - Upload session not found
- `409 Conflict` - Upload already completed
- `500 Internal Server Error` - Assembly or storage error

---

### 5. Cancel Upload

**DELETE** `/upload/{uploadId}`

Cancel an in-progress upload and clean up all associated chunks and metadata.

**Path Parameters:**
- `uploadId` (string, UUID) - Upload session ID

**Response** `204 No Content`:
```
(empty body)
```

**Error Cases:**
- `400 Bad Request` - Invalid uploadId format
- `404 Not Found` - Upload session not found

---

### 6. Download File

**GET** `/download/{fileId}`

Download a completed file. Response is streamed for memory efficiency.

**Path Parameters:**
- `fileId` (string, UUID) - File ID from complete endpoint

**Response Headers:**
- `Content-Type: <mime-type>` - e.g., `application/pdf`
- `Content-Length: <bytes>` - Total file size
- `Content-Disposition: attachment; filename="<original-filename>"` - Download hint

**Response** `200 OK`:
Raw binary file data

**Error Cases:**
- `404 Not Found` - File not found
- `500 Internal Server Error` - Download failed

**Example (cURL):**
```bash
curl -O -J "http://localhost:3000/api/download/660e8400-e29b-41d4-a716-446655440000"
```

---

### 7. Run Cleanup (Testing)

**POST** `/testing/run-cleanup`

Manually trigger cleanup of stale incomplete uploads. Used for testing; in production, cleanup runs automatically on schedule.

**Request Body:**
```json
{}
```

**Response** `200 OK`:
```json
{
  "expiredCount": 2,
  "errors": []
}
```

**Error Cases:**
- `500 Internal Server Error` - Cleanup failed

---

### 8. Health Check

**GET** `/health`

Check service status and dependency connectivity.

**Response** `200 OK`:
```json
{
  "status": "ok",
  "database": "connected",
  "storage": "connected",
  "timestamp": "2026-04-23T10:00:00.000Z"
}
```

---

## Common Workflows

### Complete Upload Flow

```bash
# 1. Initialize
INIT=$(curl -X POST "http://localhost:3000/api/upload/init" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"file.bin","fileSize":10485760}')
UPLOAD_ID=$(echo $INIT | jq -r '.uploadId')
CHUNK_SIZE=$(echo $INIT | jq -r '.chunkSize')

# 2. Upload chunks
for i in {0..1}; do
  dd if=file.bin bs=$CHUNK_SIZE skip=$i count=1 of=chunk_$i.bin 2>/dev/null
  curl -X PUT "http://localhost:3000/api/upload/$UPLOAD_ID/chunk/$i" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @chunk_$i.bin
done

# 3. Check status
curl "http://localhost:3000/api/upload/$UPLOAD_ID/status"

# 4. Complete
COMPLETE=$(curl -X POST "http://localhost:3000/api/upload/$UPLOAD_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{}')
FILE_ID=$(echo $COMPLETE | jq -r '.fileId')

# 5. Download
curl -O -J "http://localhost:3000/api/download/$FILE_ID"
```

### Resume Interrupted Upload

```bash
# Get status after interruption
curl "http://localhost:3000/api/upload/$UPLOAD_ID/status"

# Upload missing chunks based on response
curl -X PUT "http://localhost:3000/api/upload/$UPLOAD_ID/chunk/2" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @chunk_2.bin

# Then complete as normal
curl -X POST "http://localhost:3000/api/upload/$UPLOAD_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Error Handling

All errors return a consistent JSON structure:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "additional context"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-04-23T10:00:00.000Z"
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Invalid request input |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Request conflicts with current state |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `STORAGE_ERROR` | 503 | Storage system unavailable |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

---

## Rate Limiting & Quotas

Currently no rate limiting. Recommended additions:
- 1000 req/min per IP
- 10 concurrent uploads per client
- 100MB max file size (configurable)

---

## Versioning

Current API version: `1.0.0`

Future versions will maintain backward compatibility or provide migration paths.
