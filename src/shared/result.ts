/**
 * Generic result type for consistent response handling.
 */

export interface Success<T> {
  ok: true;
  data: T;
}

export interface Failure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export type Result<T> = Success<T> | Failure;

export function success<T>(data: T): Success<T> {
  return { ok: true, data };
}

export function failure(code: string, message: string, details?: Record<string, any>): Failure {
  return {
    ok: false,
    error: { code, message, details }
  };
}

export function isSuccess<T>(result: Result<T>): result is Success<T> {
  return result.ok === true;
}

export function isFailure<T>(result: Result<T>): result is Failure {
  return result.ok === false;
}
