import { TaggedError } from 'better-result'

export class ValidationError extends TaggedError('ValidationError')<{
  field: string
  message: string
}>() {}

export class NotFoundError extends TaggedError('NotFoundError')<{
  resource: string
  id: string
  message: string
}>() {
  constructor(args: { resource: string; id: string }) {
    super({
      ...args,
      message: `${args.resource} not found: ${args.id}`,
    })
  }
}

export class DbError extends TaggedError('DbError')<{
  operation: string
  message: string
}>() {}

export class InvalidStateTransitionError extends TaggedError(
  'InvalidStateTransitionError',
)<{
  from: string
  to: string
  message: string
}>() {
  constructor(args: { from: string; to: string }) {
    super({
      ...args,
      message: `Invalid standup transition: ${args.from} -> ${args.to}`,
    })
  }
}

export class ExternalServiceError extends TaggedError('ExternalServiceError')<{
  service: string
  message: string
}>() {}
