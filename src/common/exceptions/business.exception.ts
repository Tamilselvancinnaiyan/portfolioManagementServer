import { BadRequestException } from '@nestjs/common';
export class BusinessException extends BadRequestException {
  constructor(message: string, errorCode = 'BUSINESS_VALIDATION') {
    super({ message, errorCode });
  }
}
