import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';

@Controller('health')
class HealthController {
  @Get() check() {
    return { status: 'ok' };
  }
}
@Module({ controllers: [HealthController] })
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
