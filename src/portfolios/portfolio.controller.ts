import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { PortfolioService } from './portfolio.service';
import { HoldingsService } from '../holdings/holdings.service';
import { PerformanceService } from './performance.service';
import { CreatePortfolioDto, UpdatePortfolioDto } from './portfolio.dto';
import { PerformanceQuery } from './performance.dto';
import { CacheService } from '../cache/cache.service';

@ApiTags('Portfolios')
@ApiBearerAuth()
@Controller('portfolios')
export class PortfolioController {
  constructor(
    private service: PortfolioService,
    private valuation: HoldingsService,
    private performance: PerformanceService,
    private cache: CacheService,
  ) {}
  @Post() create(@CurrentUser() u: string, @Body() dto: CreatePortfolioDto) {
    return this.service.create(u, dto);
  }
  @Get() list(@CurrentUser() u: string) {
    return this.service.list(u);
  }
  @Get(':id') get(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(u, id);
  }
  @Patch(':id') update(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.service.update(u, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(u, id);
  }
  @Get(':id/holdings') holdings(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.valuation.holdings(u, id);
  }
  @Get(':id/summary') summary(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.valuation.summary(u, id);
  }
  @Get(':id/allocation') allocation(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.valuation.allocation(u, id);
  }
  @Get(':id/performance') history(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PerformanceQuery,
  ) {
    return this.performance.get(u, id, q);
  }
  @Get(':id/dashboard') async dashboard(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const p = await this.service.get(u, id);
    return this.cache.remember(
      `portfolio:dashboard:${this.valuation.marketSource}:${id}:v${p.revision}`,
      this.valuation.marketSource === 'yahoo' ? 0 : 30,
      async () => {
        const [snapshot, performance] = await Promise.all([
          this.valuation.snapshot(u, id),
          this.performance.series(u, id, '1M'),
        ]);
        return {
          summary: snapshot.summary,
          performance,
          ...snapshot.allocation,
          topMovers: [...snapshot.holdings]
            .sort((a, b) => Math.abs(b.dayPnL) - Math.abs(a.dayPnL))
            .slice(0, 5),
          recentTransactions: snapshot.recentTransactions,
          holdings: snapshot.holdings.slice(0, 10),
        };
      },
    );
  }
}
