import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let errorResponse: any;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorResponse = exception.getResponse();

      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else if (
        typeof errorResponse === 'object' &&
        errorResponse !== null &&
        'message' in errorResponse
      ) {
        message = (errorResponse as any).message;
      } else {
        message = exception.message;
      }

      // Logging client or server errors differently
      if (status >= 500) {
        this.logger.error(
          `[${request.method}] ${request.url} ${status} - ${JSON.stringify(message)} | IP: ${request.ip}`,
          exception.stack,
        );
      } else {
        this.logger.warn(
          `[${request.method}] ${request.url} ${status} - ${JSON.stringify(message)} | IP: ${request.ip}`,
        );
      }
    } else {
      // Handling unexpected errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      this.logger.error(
        `[${request.method}] ${request.url} ${status} - Unexpected error | IP: ${request.ip}`,
        (exception as any)?.stack || '',
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });
  }
}
