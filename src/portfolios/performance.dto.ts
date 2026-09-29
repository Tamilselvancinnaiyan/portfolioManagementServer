import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
export const PERIODS = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'MAX'] as const;
export class PerformanceQuery {
  @ApiPropertyOptional({ enum: PERIODS, default: '1M' })
  @IsIn(PERIODS)
  period: (typeof PERIODS)[number] = '1M';
  @ApiPropertyOptional({ enum: ['NIFTY50', 'SENSEX', 'NASDAQ100', 'SP500'] })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['NIFTY50', 'SENSEX', 'NASDAQ100', 'SP500'])
  benchmark?: string;
}
