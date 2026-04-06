import 'reflect-metadata'
import { type Type, ValidationPipe } from '@nestjs/common'
import type { ModuleMetadata } from '@nestjs/common/interfaces/modules/module-metadata.interface'
import { HttpAdapterHost } from '@nestjs/core'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { GlobalExceptionFilter } from '../../platform/http/filters/global-exception.filter'
import type { AuthSession } from '../../shared/auth/auth-session'

const TEST_SESSION_HEADER = 'x-test-session'

type CreateControllerHttpTestAppOptions = {
  imports?: ModuleMetadata['imports']
  controllers: Array<Type<unknown>>
  providers?: ModuleMetadata['providers']
}

type SessionRequest = {
  delete: (path: string) => ReturnType<ReturnType<typeof request>['delete']>
  get: (path: string) => ReturnType<ReturnType<typeof request>['get']>
  patch: (path: string) => ReturnType<ReturnType<typeof request>['patch']>
  post: (path: string) => ReturnType<ReturnType<typeof request>['post']>
  put: (path: string) => ReturnType<ReturnType<typeof request>['put']>
}

type TestRequest = Request & {
  session?: AuthSession
}

function buildValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: false,
    },
  })
}

function createSessionRequest(
  getHttpServer: () => Parameters<typeof request>[0],
  session: AuthSession,
): SessionRequest {
  const sessionHeader = JSON.stringify(session)

  return {
    delete: (path) =>
      request(getHttpServer())
        .delete(path)
        .set(TEST_SESSION_HEADER, sessionHeader),
    get: (path) =>
      request(getHttpServer())
        .get(path)
        .set(TEST_SESSION_HEADER, sessionHeader),
    patch: (path) =>
      request(getHttpServer())
        .patch(path)
        .set(TEST_SESSION_HEADER, sessionHeader),
    post: (path) =>
      request(getHttpServer())
        .post(path)
        .set(TEST_SESSION_HEADER, sessionHeader),
    put: (path) =>
      request(getHttpServer())
        .put(path)
        .set(TEST_SESSION_HEADER, sessionHeader),
  }
}

function bindControllerMethods(
  moduleRef: TestingModule,
  controllers: Array<Type<unknown>>,
) {
  for (const controllerType of controllers) {
    const controller = moduleRef.get(controllerType, {
      strict: false,
    }) as Record<string, unknown>
    const prototype = Object.getPrototypeOf(controller) as Record<
      string,
      unknown
    >

    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor') {
        continue
      }

      const value = controller[key as keyof typeof controller]

      if (typeof value === 'function') {
        controller[key as keyof typeof controller] = value.bind(controller)
      }
    }
  }
}

export async function createControllerHttpTestApp(
  options: CreateControllerHttpTestAppOptions,
) {
  const moduleRef = await Test.createTestingModule({
    imports: options.imports ?? [],
    controllers: options.controllers,
    providers: options.providers ?? [],
  }).compile()

  bindControllerMethods(moduleRef, options.controllers)

  const app = moduleRef.createNestApplication()
  const httpAdapterHost = app.get(HttpAdapterHost)
  app.useGlobalFilters(
    new GlobalExceptionFilter(httpAdapterHost, {
      create: () => ({
        error: () => undefined,
        warn: () => undefined,
      }),
    } as never),
  )

  app.use((req: TestRequest, _res: Response, next: NextFunction) => {
    const sessionHeader = req.header(TEST_SESSION_HEADER)

    if (typeof sessionHeader === 'string') {
      req.session = JSON.parse(sessionHeader) as AuthSession
    }

    next()
  })
  app.useGlobalPipes(buildValidationPipe())

  await app.init()

  const getHttpServer = () => app.getHttpServer()

  return {
    app,
    request: request(getHttpServer()),
    withSession: (session: AuthSession) =>
      createSessionRequest(getHttpServer, session),
    close: async () => {
      await app.close()
    },
  }
}
