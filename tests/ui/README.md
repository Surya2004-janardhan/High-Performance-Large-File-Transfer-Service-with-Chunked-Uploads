# Test UI Harness

This directory contains a minimal Next.js UI harness for visual testing and validation of the file transfer service REST API.

## Purpose

- Simulate chunked file upload flows from user perspective
- Validate resumability across network interruptions
- Test download and cancellation workflows visually
- Provide evaluator-friendly demonstration of core features

## Implementation

**To be implemented in Phase 5** after backend REST API and core services are complete.

### Structure (Phase 5)

```
tests/ui/
├── app/                          # Next.js App Router
├── components/                   # UI components for upload, progress, status
├── lib/                          # API client, chunking, checksum utilities
├── e2e/                          # Visual end-to-end test flows
├── package.json
├── next.config.js
├── tsconfig.json
└── .env.example
```

## Usage (Phase 5)

```bash
cd tests/ui
npm install
npm run dev              # Start dev server on :3001
```

Then navigate to `http://localhost:3001` and test the upload flows.

See docs/visual-testing-guide.md for detailed test scenarios.
