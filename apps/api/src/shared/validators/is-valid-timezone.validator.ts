import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'

// Lazy-cache da lista de timezones suportados
let supportedTimezones: ReadonlySet<string> | null = null

function getSupportedTimezones(): ReadonlySet<string> {
  if (!supportedTimezones) {
    try {
      supportedTimezones = new Set(Intl.supportedValuesOf('timeZone'))
    } catch {
      // Fallback: aceitar qualquer string se Intl.supportedValuesOf não disponível
      supportedTimezones = new Set()
    }
  }
  return supportedTimezones
}

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false
          // UTC e GMT são sempre válidos mas podem não aparecer em Intl.supportedValuesOf
          if (value === 'UTC' || value === 'GMT') return true
          const supported = getSupportedTimezones()
          // Se supportedTimezones está vazio (Intl.supportedValuesOf indisponível), aceita string não-vazia
          if (supported.size === 0) return value.length > 0
          return supported.has(value)
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid IANA timezone (e.g. "America/Sao_Paulo")`
        },
      },
    })
  }
}
