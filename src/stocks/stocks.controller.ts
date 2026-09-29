import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StockQuery } from './stocks.dto';
import { StocksService } from './stocks.service';

@ApiTags('Stocks')
@ApiBearerAuth()
@Controller('stocks')
export class StocksController {
  constructor(private service: StocksService) {}
  @Get() list(@Query() q: StockQuery) {
    return this.service.list(q);
  }
  @Throttle({ default: { limit: 30, ttl: 60000 } }) @Get('search') search(@Query() q: StockQuery) {
    return this.service.list(q);
  }
  @Get(':symbol') get(@Param('symbol') symbol: string) {
    return this.service.get(symbol);
  }
}
