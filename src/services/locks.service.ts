/**
 * Simple in-memory lock manager for preventing concurrent uploads of same file.
 * In production, use Redis or similar for distributed locks.
 */
class SimpleLockManager {
  private locks = new Map<string, number>();
  private lockTimeout = 30000; // 30 seconds max lock

  /**
   * Attempt to acquire lock for resource.
   */
  acquire(resourceId: string): boolean {
    const now = Date.now();
    const existingLock = this.locks.get(resourceId);

    // Clean up expired locks
    if (existingLock && now - existingLock > this.lockTimeout) {
      this.locks.delete(resourceId);
      return this.locks.set(resourceId, now), true;
    }

    // Lock exists and not expired
    if (existingLock && now - existingLock <= this.lockTimeout) {
      return false;
    }

    // Acquire lock
    this.locks.set(resourceId, now);
    return true;
  }

  /**
   * Release lock for resource.
   */
  release(resourceId: string): void {
    this.locks.delete(resourceId);
  }

  /**
   * Check if resource is locked.
   */
  isLocked(resourceId: string): boolean {
    const lockTime = this.locks.get(resourceId);
    if (!lockTime) return false;
    if (Date.now() - lockTime > this.lockTimeout) {
      this.locks.delete(resourceId);
      return false;
    }
    return true;
  }
}

export const lockManager = new SimpleLockManager();
