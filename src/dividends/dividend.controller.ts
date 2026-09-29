import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { DividendService } from './dividend.service';

@ApiTags('Dividends')
@ApiBearerAuth()
@Controller('portfolios/:id/dividends')
export class DividendController {
  constructor(private service: DividendService) {}
  @Get() get(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(u, id);
  }
}
