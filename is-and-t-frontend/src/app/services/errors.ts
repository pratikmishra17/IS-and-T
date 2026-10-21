import { HttpErrorResponse } from '@angular/common/http';

/**
 * Turns a failed request into a sentence for the user. The backend sends errors as
 * ProblemDetail JSON, whose "detail" field is written to be shown as-is; validation
 * errors also carry an "errors" map of field name to message.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Can’t reach the server. Is the backend running?';
    }
    const fieldErrors = error.error?.errors as Record<string, string> | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      return Object.entries(fieldErrors).map(([field, message]) => `${field} ${message}`).join('. ') + '.';
    }
    if (typeof error.error?.detail === 'string') {
      return error.error.detail;
    }
  }
  return 'Something went wrong. Please try again.';
}
