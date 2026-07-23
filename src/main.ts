import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

declare const module: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Flutter / frontend
  app.enableCors({
    origin: '*',
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server running on http://0.0.0.0:${port}/api`);

  // Only relevant if nest-cli.json has webpack HMR enabled. On a normal
  // tsc/nodemon watch setup this block never runs (module.hot is
  // undefined). With webpack HMR, recompiles re-run bootstrap() in the
  // SAME process without killing it — this closes the previous app
  // (and its Redis connections, etc.) first so lifecycle hooks like
  // RedisService.onModuleInit don't fire on top of still-live clients.
  if (module.hot) {
    module.hot.accept();
    module.hot.dispose(() => app.close());
  }
}

bootstrap();
