import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public, CurrentUser } from '../common/decorators/auth.decorators';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshDto } from './auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private service: AuthService,
    private users: UsersService,
  ) {}
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('register') register(
    @Body() dto: RegisterDto,
  ) {
    return this.service.register(dto);
  }
  @Public() @Throttle({ default: { limit: 10, ttl: 60000 } }) @Post('login') login(
    @Body() dto: LoginDto,
  ) {
    return this.service.login(dto);
  }
  @Public() @Throttle({ default: { limit: 20, ttl: 60000 } }) @Post('refresh') refresh(
    @Body() dto: RefreshDto,
  ) {
    return this.service.refresh(dto.refreshToken);
  }
  @Public() @Post('logout') logout(@Body() dto: RefreshDto) {
    return this.service.logout(dto.refreshToken);
  }
  @ApiBearerAuth() @Get('me') me(@CurrentUser() id: string) {
    return this.users.me(id);
  }
}
