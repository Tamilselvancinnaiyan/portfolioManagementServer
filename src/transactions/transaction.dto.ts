import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  ValidateIf,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TransactionType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
export class CreateTransactionDto {
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() stockId?: string;
  @ApiProperty({ enum: TransactionType }) @IsEnum(TransactionType) type!: TransactionType;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  quantity = 0;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  price = 0;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  fees = 0;
  @ApiPropertyOptional({ description: 'Required for DIVIDEND, DEPOSIT and WITHDRAWAL' })
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  amount = 0;
  @ApiProperty({ example: '2026-09-10' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
// Separate patch DTO avoids applying creation defaults to omitted financial fields.
export class UpdateTransactionDto {
  @ApiPropertyOptional() @ValidateIf((_, value) => value !== undefined) @IsUUID() stockId?: string;
  @ApiPropertyOptional({ enum: TransactionType })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TransactionType)
  type?: TransactionType;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  quantity?: number;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  price?: number;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  fees?: number;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  @Max(1e12)
  amount?: number;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate?: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
export class TransactionQuery extends PaginationDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(TransactionType)
  type?: TransactionType;
  @ApiPropertyOptional({ description: 'Stock symbol' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(20)
  stock?: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsDateString({ strict: true })
  startDate?: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsDateString({ strict: true })
  endDate?: string;
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsIn(['asc', 'desc']) sort: 'asc' | 'desc' =
    'desc';
}
