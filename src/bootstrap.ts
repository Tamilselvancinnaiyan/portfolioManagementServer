import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  const config = new DocumentBuilder()
    .setTitle('Vestora API')
    .setDescription(
      'Manual investment ledger. Yahoo Finance or mock market data; no trade execution. Success: {success,data,message}; errors: {success:false,message,errorCode}. Decimal database fields are serialized as strings; calculated display values are numbers.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  for (const path of Object.values(document.paths))
    for (const operation of Object.values(path ?? {})) {
      if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
      const responses = (operation as any).responses;
      for (const [status, response] of Object.entries(responses)) {
        if (!status.startsWith('2')) continue;
        Object.assign(response as object, {
          description: 'Successful response, wrapped in the standard envelope',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['success', 'data', 'message'],
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    oneOf: [
                      { type: 'object', additionalProperties: true },
                      { type: 'array', items: { type: 'object', additionalProperties: true } },
                    ],
                  },
                  message: { type: 'string', example: 'Request completed successfully' },
                },
              },
            },
          },
        });
      }
      responses['400'] = {
        description: 'Validation or business-rule error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: {
                  oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                },
                errorCode: { type: 'string' },
              },
            },
          },
        },
      };
      responses['401'] = { description: 'Missing, invalid or expired access token' };
      responses['404'] = { description: 'Resource not found or not owned by caller' };
      responses['429'] = { description: 'Rate limit exceeded' };
    }
  SwaggerModule.setup('api/docs', app, document);
  app.enableShutdownHooks();
}
