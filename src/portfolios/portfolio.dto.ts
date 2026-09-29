import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, ValidateIf, IsString, Length, MaxLength } from 'class-validator';
export class CreatePortfolioDto {
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  description?: string;
  @ApiProperty({ enum: ['INR', 'USD'] }) @IsIn(['INR', 'USD']) baseCurrency = 'INR';
}
export class UpdatePortfolioDto {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, 100)
  name?: string;
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  description?: string;
  @ApiPropertyOptional({ enum: ['INR', 'USD'] })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['INR', 'USD'])
  baseCurrency?: string;
}
