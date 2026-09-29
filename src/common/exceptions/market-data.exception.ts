import { ServiceUnavailableException } from '@nestjs/common';
export function marketDataUnavailable() {
  return new ServiceUnavailableException({
    message: 'Market data is temporarily unavailable. Please retry.',
    errorCode: 'MARKET_DATA_UNAVAILABLE',
  });
}
