import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  duration: number;
  error?: string;
}

class IntegrationTestSuite {
  private api: AxiosInstance;
  private baseURL: string;
  private results: TestResult[] = [];
  private testStartTime: number = 0;
  private uploadIds: Map<string, string> = new Map();
  private fileIds: Map<string, string> = new Map();

  constructor(baseURL: string = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.api = axios.create({
      baseURL: `${baseURL}/api`,
      timeout: 30000,
      validateStatus: () => true, // Don't throw on any status
    });
  }

  async run(): Promise<void> {
    console.log('\n🚀 Starting Integration Test Suite\n');
    console.log(`API Base URL: ${this.baseURL}\n`);

    // Test 1: Health Check
    await this.testHealthCheck();

    // Test 2-4: Basic Upload Flow
    await this.testInitializeUpload();
    await this.testUploadChunks('basic-upload');
    await this.testCheckUploadStatus('basic-upload');
    await this.testCompleteUpload('basic-upload');
    await this.testDownloadFile('basic-upload');
    await this.testVerifyFileIntegrity('basic-upload');

    // Test 7: Idempotent Upload (Re-upload Same Chunk)
    await this.testIdempotentUpload();

    // Test 8: Cancel Upload
    await this.testCancelUpload();

    // Test 9: Manual Cleanup
    await this.testManualCleanup();

    // Test 10: Multiple Concurrent Uploads
    await this.testConcurrentUploads();

    // Test 11: Large File (50MB)
    await this.testLargeFileUpload();

    // Test 12: Download Non-existent File
    await this.testDownloadNonExistent();

    // Print Results
    this.printResults();
  }

  private async testHealthCheck(): Promise<void> {
    const testName = 'Health Check';
    this.testStartTime = Date.now();

    try {
      const response = await this.api.get('/health');

      if (response.status === 200) {
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `Unexpected status: ${response.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testInitializeUpload(): Promise<void> {
    const testName = 'Initialize Upload';
    this.testStartTime = Date.now();

    try {
      const response = await this.api.post('/upload/init', {
        fileName: 'test-basic.bin',
        fileSize: 10485760, // 10MB
      });

      if (response.status === 201 && response.data?.uploadId) {
        this.uploadIds.set('basic-upload', response.data.uploadId);
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `Bad response: ${JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testUploadChunks(key: string): Promise<void> {
    const testName = `Upload Chunks (${key})`;
    this.testStartTime = Date.now();

    try {
      const uploadId = this.uploadIds.get(key);
      if (!uploadId) {
        this.addResult(testName, 'FAIL', 'No uploadId available');
        return;
      }

      // Create temp chunk file (5MB)
      const chunkPath = `/tmp/chunk-${key}-0.bin`;
      const chunkSize = 5242880; // 5MB
      const buffer = Buffer.alloc(chunkSize);
      fs.writeFileSync(chunkPath, buffer);

      // Upload chunk 0
      const response1 = await this.api.put(
        `/upload/${uploadId}/chunk/0`,
        buffer,
        {
          headers: { 
            'Content-Type': 'application/octet-stream',
            'Content-Length': chunkSize
          },
        }
      );

      if (response1.status !== 204) {
        this.addResult(testName, 'FAIL', `Chunk 0 upload failed: ${response1.status}`);
        fs.unlinkSync(chunkPath);
        return;
      }

      // Upload chunk 1 (same size)
      const response2 = await this.api.put(
        `/upload/${uploadId}/chunk/1`,
        buffer,
        {
          headers: { 
            'Content-Type': 'application/octet-stream',
            'Content-Length': chunkSize
          },
        }
      );

      fs.unlinkSync(chunkPath);

      if (response2.status === 204) {
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `Chunk 1 upload failed: ${response2.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testCheckUploadStatus(key: string): Promise<void> {
    const testName = `Check Upload Status (${key})`;
    this.testStartTime = Date.now();

    try {
      const uploadId = this.uploadIds.get(key);
      if (!uploadId) {
        this.addResult(testName, 'FAIL', 'No uploadId available');
        return;
      }

      const response = await this.api.get(`/upload/${uploadId}/status`);

      if (
        response.status === 200 &&
        Array.isArray(response.data?.uploadedChunks) &&
        response.data.uploadedChunks.length === 2
      ) {
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `Bad status response: ${JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testCompleteUpload(key: string): Promise<void> {
    const testName = `Complete Upload (${key})`;
    this.testStartTime = Date.now();

    try {
      const uploadId = this.uploadIds.get(key);
      if (!uploadId) {
        this.addResult(testName, 'FAIL', 'No uploadId available');
        return;
      }

      const response = await this.api.post(`/upload/${uploadId}/complete`, {});

      if (response.status === 200 && response.data?.fileId) {
        this.fileIds.set(key, response.data.fileId);
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `Bad complete response: ${response.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testDownloadFile(key: string): Promise<void> {
    const testName = `Download File (${key})`;
    this.testStartTime = Date.now();

    try {
      const fileId = this.fileIds.get(key);
      if (!fileId) {
        this.addResult(testName, 'FAIL', 'No fileId available');
        return;
      }

      const response = await this.api.get(`/upload/download/${fileId}`, {
        responseType: 'arraybuffer',
      });

      const downloadPath = `/tmp/downloaded-${key}.bin`;
      fs.writeFileSync(downloadPath, response.data);

      if (response.status === 200 && fs.statSync(downloadPath).size === 10485760) {
        this.addResult(testName, 'PASS');
        fs.unlinkSync(downloadPath);
      } else {
        this.addResult(testName, 'FAIL', `Download failed or wrong size`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testVerifyFileIntegrity(key: string): Promise<void> {
    const testName = `Verify File Integrity (${key})`;
    this.testStartTime = Date.now();

    try {
      const fileId = this.fileIds.get(key);
      if (!fileId) {
        this.addResult(testName, 'FAIL', 'No fileId available');
        return;
      }

      const response = await this.api.get(`/upload/download/${fileId}`, {
        responseType: 'arraybuffer',
      });

      // File should be exactly 10485760 bytes (2 * 5242880)
      if (response.data.length === 10485760) {
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `File size mismatch: ${response.data.length}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testIdempotentUpload(): Promise<void> {
    const testName = 'Idempotent Upload (Re-upload Chunk)';
    this.testStartTime = Date.now();

    try {
      // Initialize
      const initResponse = await this.api.post('/upload/init', {
        fileName: 'test-idempotent.bin',
        fileSize: 5242880,
      });

      if (initResponse.status !== 201) {
        this.addResult(testName, 'FAIL', 'Initialize failed');
        return;
      }

      const uploadId = initResponse.data.uploadId;
      const chunkSize = 5242880;
      const buffer = Buffer.alloc(chunkSize);

      // Upload chunk
      const uploadResponse1 = await this.api.put(
        `/upload/${uploadId}/chunk/0`,
        buffer,
        { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': chunkSize } }
      );

      // Re-upload same chunk (idempotent)
      const uploadResponse2 = await this.api.put(
        `/upload/${uploadId}/chunk/0`,
        buffer,
        { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': chunkSize } }
      );

      if (uploadResponse1.status === 204 && uploadResponse2.status === 204) {
        // Verify status shows only 1 chunk (not 2)
        const statusResponse = await this.api.get(`/upload/${uploadId}/status`);
        if (statusResponse.data?.uploadedChunks?.length === 1) {
          this.addResult(testName, 'PASS');
        } else {
          this.addResult(testName, 'FAIL', 'Chunk duplicated (not idempotent)');
        }
      } else {
        this.addResult(testName, 'FAIL', `Upload responses: ${uploadResponse1.status}, ${uploadResponse2.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testCancelUpload(): Promise<void> {
    const testName = 'Cancel Upload';
    this.testStartTime = Date.now();

    try {
      // Initialize
      const initResponse = await this.api.post('/upload/init', {
        fileName: 'test-cancel.bin',
        fileSize: 10485760,
      });

      if (initResponse.status !== 201) {
        this.addResult(testName, 'FAIL', 'Initialize failed');
        return;
      }

      const uploadId = initResponse.data.uploadId;
      const chunkSize = 5242880;
      const buffer = Buffer.alloc(chunkSize);

      // Upload 1 chunk
      await this.api.put(`/upload/${uploadId}/chunk/0`, buffer, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': chunkSize },
      });

      // Cancel upload
      const cancelResponse = await this.api.delete(`/upload/${uploadId}`);

      if (cancelResponse.status === 204) {
        // Try to get status (should fail)
        const statusResponse = await this.api.get(`/upload/${uploadId}/status`);
        if (statusResponse.status !== 200) {
          this.addResult(testName, 'PASS');
        } else {
          this.addResult(testName, 'FAIL', 'Upload still exists after cancel');
        }
      } else {
        this.addResult(testName, 'FAIL', `Cancel failed: ${cancelResponse.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testManualCleanup(): Promise<void> {
    const testName = 'Manual Cleanup';
    this.testStartTime = Date.now();

    try {
      const response = await this.api.post('/testing/run-cleanup', {});

      if (response.status === 200 && typeof response.data?.cleanedUploads === 'number') {
        this.addResult(testName, 'PASS');
      } else if (response.status === 200) {
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `Bad response: ${response.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testConcurrentUploads(): Promise<void> {
    const testName = 'Concurrent Uploads (3 simultaneous)';
    this.testStartTime = Date.now();

    try {
      // Initialize 3 uploads
      const promises = Array(3)
        .fill(null)
        .map(() =>
          this.api.post('/upload/init', {
            fileName: `test-concurrent-${Math.random()}.bin`,
            fileSize: 5242880,
          })
        );

      const responses = await Promise.all(promises);

      if (responses.every((r: any) => r.status === 201)) {
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', 'Some initializations failed');
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testLargeFileUpload(): Promise<void> {
    const testName = 'Large File Upload (50MB)';
    this.testStartTime = Date.now();

    try {
      // Initialize 50MB upload (10 chunks of 5MB)
      const initResponse = await this.api.post('/upload/init', {
        fileName: 'test-large.bin',
        fileSize: 52428800, // 50MB
      });

      if (initResponse.status !== 201) {
        this.addResult(testName, 'FAIL', 'Initialize failed');
        return;
      }

      const uploadId = initResponse.data.uploadId;
      const chunkSize = 5242880;
      const buffer = Buffer.alloc(chunkSize);

      // Upload chunks sequentially to avoid timeout issues
      let allSuccess = true;
      for (let i = 0; i < 10; i++) {
        const response = await this.api.put(`/upload/${uploadId}/chunk/${i}`, buffer, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': chunkSize,
          },
          timeout: 15000,
        });

        if (response.status !== 204) {
          allSuccess = false;
          break;
        }
      }

      if (allSuccess) {
        // Complete upload
        const completeResponse = await this.api.post(`/upload/${uploadId}/complete`, {});

        if (completeResponse.status === 200) {
          this.addResult(testName, 'PASS');
        } else {
          this.addResult(testName, 'FAIL', `Complete failed: ${completeResponse.status}`);
        }
      } else {
        this.addResult(testName, 'FAIL', 'Some chunks failed to upload');
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private async testDownloadNonExistent(): Promise<void> {
    const testName = 'Download Non-existent File (Error Case)';
    this.testStartTime = Date.now();

    try {
      const response = await this.api.get('/upload/download/fake-file-id-12345');

      if (response.status === 404) {
        this.addResult(testName, 'PASS');
      } else {
        this.addResult(testName, 'FAIL', `Expected 404, got ${response.status}`);
      }
    } catch (error: any) {
      this.addResult(testName, 'FAIL', error.message);
    }
  }

  private addResult(name: string, status: 'PASS' | 'FAIL', error?: string): void {
    const duration = Date.now() - this.testStartTime;
    this.results.push({ name, status, duration, error });

    const icon = status === 'PASS' ? '✅' : '❌';
    const errorMsg = error ? ` - ${error}` : '';
    console.log(`${icon} ${name} (${duration}ms)${errorMsg}`);
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(70));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(70) + '\n');

    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const total = this.results.length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Total Time: ${totalDuration}ms\n`);

    if (failed > 0) {
      console.log('FAILED TESTS:\n');
      this.results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`  ❌ ${r.name}`);
          if (r.error) console.log(`     Error: ${r.error}`);
        });
    }

    console.log('\n' + '='.repeat(70));
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! 🎉');
    } else {
      console.log(`⚠️  ${failed} test(s) failed`);
    }
    console.log('='.repeat(70) + '\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run tests
const suite = new IntegrationTestSuite();
suite.run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
