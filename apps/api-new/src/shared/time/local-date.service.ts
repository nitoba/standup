import { Injectable } from '@nestjs/common'

@Injectable()
export class LocalDateService {
  format(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(date)
  }

  today(timezone: string): string {
    return this.format(new Date(), timezone)
  }
}
