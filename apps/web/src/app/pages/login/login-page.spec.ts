import { TestBed } from '@angular/core/testing'

import { LoginPage } from './login-page'

describe('LoginPage', () => {
  it('renders login prompt', async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
    }).compileComponents()

    const fixture = TestBed.createComponent(LoginPage)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standup_bot')
    expect(element.textContent).toContain('sign in with discord')
  })
})
