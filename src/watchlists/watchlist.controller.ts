import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { WatchlistService } from './watchlist.service';
import { AddStockDto, CreateWatchlistDto } from './watchlist.dto';

@ApiTags('Watchlists')
@ApiBearerAuth()
@Controller('watchlists')
export class WatchlistController {
  constructor(private service: WatchlistService) {}
  @Post() create(@CurrentUser() u: string, @Body() d: CreateWatchlistDto) {
    return this.service.create(u, d.name);
  }
  @Get() list(@CurrentUser() u: string) {
    return this.service.list(u);
  }
  @Patch(':id') update(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreateWatchlistDto,
  ) {
    return this.service.update(u, id, d.name);
  }
  @Delete(':id') remove(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(u, id);
  }
  @Post(':id/stocks') add(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AddStockDto,
  ) {
    return this.service.add(u, id, d.stockId);
  }
  @Get(':id/stocks') stocks(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.stocks(u, id);
  }
  @Delete(':id/stocks/:stockId') removeStock(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stockId', ParseUUIDPipe) s: string,
  ) {
    return this.service.removeStock(u, id, s);
  }
}
