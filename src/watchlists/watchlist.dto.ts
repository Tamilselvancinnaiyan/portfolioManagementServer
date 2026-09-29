import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';
export class CreateWatchlistDto {
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
}
export class AddStockDto {
  @ApiProperty() @IsUUID() stockId!: string;
}
