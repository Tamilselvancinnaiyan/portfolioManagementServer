import { IsEmail, IsIn, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
export class LoginDto {
  @ApiProperty({ example: 'demo@vestora.app' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class RegisterDto extends LoginDto {
  @ApiProperty() @IsString() @Length(1, 100) name!: string;
  @ApiProperty({ enum: ['INR', 'USD'] }) @IsIn(['INR', 'USD']) baseCurrency = 'INR';
}
export class RefreshDto {
  @ApiProperty() @IsString() @Length(20, 2048) refreshToken!: string;
}
