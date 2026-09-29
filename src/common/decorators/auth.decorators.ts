import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
export const Public = () => SetMetadata('public', true);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().user.id,
);
