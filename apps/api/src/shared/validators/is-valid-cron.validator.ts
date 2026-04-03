import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'
import { Cron } from 'croner'

export function IsValidCron(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidCron',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false
          try {
            // croner lança erro se o padrão for inválido
            new Cron(value, { paused: true })
            return true
          } catch {
            return false
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid cron expression`
        },
      },
    })
  }
}
