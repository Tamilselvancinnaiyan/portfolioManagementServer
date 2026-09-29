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
import { CreateTransactionDto, UpdateTransactionDto, TransactionQuery } from './transaction.dto';
import { TransactionService } from './transaction.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller()
export class TransactionController {
  constructor(private service: TransactionService) {}
  @Post('portfolios/:portfolioId/transactions') create(
    @CurrentUser() u: string,
    @Param('portfolioId', ParseUUIDPipe) p: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.service.create(u, p, dto);
  }
  @Get('portfolios/:portfolioId/transactions') list(
    @CurrentUser() u: string,
    @Param('portfolioId', ParseUUIDPipe) p: string,
    @Query() q: TransactionQuery,
  ) {
    return this.service.list(u, p, q);
  }
  @Get('transactions/:id') get(@CurrentUser() u: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(u, id);
  }
  @Patch('transactions/:id') update(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.service.update(u, id, dto);
  }
  @Delete('transactions/:id') remove(
    @CurrentUser() u: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(u, id);
  }
}
