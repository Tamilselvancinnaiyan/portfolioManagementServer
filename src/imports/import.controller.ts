import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { BusinessException } from '../common/exceptions/business.exception';
import { ImportService } from './import.service';
import { ConfirmImportDto } from './import.dto';

@ApiTags('CSV Imports')
@ApiBearerAuth()
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller('portfolios/:portfolioId/import')
export class ImportController {
  constructor(private service: ImportService) {}
  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  preview(
    @CurrentUser() u: string,
    @Param('portfolioId', ParseUUIDPipe) p: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BusinessException('CSV file is required');
    return this.service.preview(u, p, file.buffer);
  }
  @Post('confirm') @HttpCode(202) confirm(
    @CurrentUser() u: string,
    @Param('portfolioId', ParseUUIDPipe) p: string,
    @Body() dto: ConfirmImportDto,
  ) {
    return this.service.confirm(u, p, dto.importId);
  }
  @Get(':id') status(
    @CurrentUser() u: string,
    @Param('portfolioId', ParseUUIDPipe) p: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.status(u, p, id);
  }
}
