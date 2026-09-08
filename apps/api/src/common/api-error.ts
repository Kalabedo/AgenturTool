import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Fehlercodes der Domäne.
 *
 * Als Code statt als Text, damit das Frontend darauf reagieren kann, ohne
 * Meldungen zu vergleichen — und damit sich die Formulierung ändern lässt,
 * ohne etwas zu brechen.
 */
export const API_ERROR_CODE = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  INVOICE_NOT_EDITABLE: 'INVOICE_NOT_EDITABLE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Fehler mit Domänencode; wird vom ExceptionFilter in das Antwortformat übersetzt. */
export class ApiError extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super(message, status);
  }

  static notFound(message: string): ApiError {
    return new ApiError(API_ERROR_CODE.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError(API_ERROR_CODE.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST, details);
  }

  static unsupportedFileType(message: string): ApiError {
    return new ApiError(
      API_ERROR_CODE.UNSUPPORTED_FILE_TYPE,
      message,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }

  static fileTooLarge(message: string): ApiError {
    return new ApiError(API_ERROR_CODE.FILE_TOO_LARGE, message, HttpStatus.PAYLOAD_TOO_LARGE);
  }

  /**
   * Verletzung der Sperre finalisierter Rechnungen. 409 statt 403, weil es
   * nicht an fehlender Berechtigung liegt, sondern am Zustand des Dokuments.
   */
  static invoiceNotEditable(message: string): ApiError {
    return new ApiError(API_ERROR_CODE.INVOICE_NOT_EDITABLE, message, HttpStatus.CONFLICT);
  }
}
