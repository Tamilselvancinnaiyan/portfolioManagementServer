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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AlertService } from './alert.service';
import { CreateAlertDto, UpdateAlertDto } from './alert.dto';

@ApiTags('Alerts')
@ApiBearerAuth()
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('alerts')
export class AlertController {
  constructor(private service: AlertService) {}
  @Post() create(@CurrentUser() u: string, @Body() d: CreateAlertDto) {
    return this.service.create(u, d);
  }
  @Get() list(@CurrentUser() u: string, @Query() q: PaginationDto) {
    return this.service.list(u, q);
  }
  @Patch(':id') update(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateAlertDto,
  ) {
    return this.service.update(u, id, d);
  }
  @Delete(':id') remove(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(u, id);
  }
}
