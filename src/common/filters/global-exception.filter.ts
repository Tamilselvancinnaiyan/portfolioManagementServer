import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    let status = 500,
      message: string | string[] = 'Internal server error',
      errorCode = 'INTERNAL_ERROR';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : ((body as any).message ?? exception.message);
      errorCode =
        typeof body === 'object' && 'errorCode' in body
          ? String(body.errorCode)
          : ({
              400: 'VALIDATION_ERROR',
              401: 'UNAUTHORIZED',
              403: 'FORBIDDEN',
              404: 'NOT_FOUND',
              409: 'CONFLICT',
              429: 'RATE_LIMITED',
            }[status] ?? 'HTTP_ERROR');
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        message = 'Resource already exists';
        errorCode = 'CONFLICT';
      }
      if (exception.code === 'P2025') {
        status = 404;
        message = 'Resource not found';
        errorCode = 'NOT_FOUND';
      }
      if (exception.code === 'P2004') {
        status = 400;
        message = 'Transaction violates business constraints';
        errorCode = 'BUSINESS_VALIDATION';
      }
      if (exception.code === 'P2003') {
        status = 400;
        message = 'Invalid resource reference';
        errorCode = 'INVALID_REFERENCE';
      }
    }
    if (status === 500)
      this.logger.error({
        event: 'request_failed',
        requestId: host.switchToHttp().getRequest().id,
        errorType: exception instanceof Error ? exception.name : 'Unknown',
      });
    response.status(status).json({ success: false, message, errorCode });
  }
}
