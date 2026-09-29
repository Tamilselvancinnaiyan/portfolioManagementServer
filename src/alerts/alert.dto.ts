import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNumber, ValidateIf, IsUUID, Max, Min } from 'class-validator';
import { AlertCondition, AlertStatus } from '@prisma/client';
export class CreateAlertDto {
  @ApiProperty() @IsUUID() stockId!: string;
  @ApiProperty({ enum: AlertCondition }) @IsEnum(AlertCondition) condition!: AlertCondition;
  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  @Max(1e12)
  targetPrice!: number;
}
export class UpdateAlertDto extends PartialType(OmitType(CreateAlertDto, ['stockId'] as const), {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: AlertStatus;
}
