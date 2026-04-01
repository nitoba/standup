import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  DbError,
  ExternalServiceError,
  InvalidStateTransitionError,
  NotFoundError,
} from '../../../shared/domain'

type StandupHttpError =
  | NotFoundError
  | InvalidStateTransitionError
  | ExternalServiceError
  | DbError

export function throwStandupHttpError(error: StandupHttpError): never {
  if (NotFoundError.is(error)) {
    throw new NotFoundException(error.message)
  }

  if (InvalidStateTransitionError.is(error)) {
    throw new ConflictException(error.message)
  }

  if (ExternalServiceError.is(error)) {
    throw new ServiceUnavailableException(
      error.publicMessage ?? 'Service unavailable',
    )
  }

  throw new InternalServerErrorException('Internal server error')
}
