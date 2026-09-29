import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('portfolios/:id/analytics')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}
  @Get() get(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(u, id);
  }
  @Get('monthly-returns') monthly(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.monthly(u, id);
  }
  @Get('contribution') contribution(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.contribution(u, id);
  }
}
