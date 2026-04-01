import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { GitConfigSection } from './git-config-section'

function createMockFormField() {
  return {
    touched: () => false,
    invalid: () => false,
    errors: () => [],
  }
}

describe('GitConfigSection', () => {
  async function renderComponent(inputs: {
    gitAuthor: string
    gitSincePeriod: string
    azureDevopsUser: string
  }) {
    await TestBed.configureTestingModule({
      imports: [GitConfigSection],
    }).compileComponents()

    const fixture = TestBed.createComponent(GitConfigSection)
    fixture.componentRef.setInput('gitAuthor', inputs.gitAuthor)
    fixture.componentRef.setInput('gitSincePeriod', inputs.gitSincePeriod)
    fixture.componentRef.setInput('azureDevopsUser', inputs.azureDevopsUser)
    fixture.componentRef.setInput('gitAuthorField', createMockFormField())
    fixture.componentRef.setInput('azureDevopsUserField', createMockFormField())
    fixture.detectChanges()

    return fixture
  }

  it('renders git author input with correct value', async () => {
    const fixture = await renderComponent({
      gitAuthor: 'nitoba',
      gitSincePeriod: '8 hours ago',
      azureDevopsUser: 'John Doe',
    })
    const el = fixture.nativeElement as HTMLElement

    const authorInput = el.querySelector<HTMLInputElement>('#git-author')
    expect(authorInput?.value).toBe('nitoba')
  })

  it('renders git since period input with correct value', async () => {
    const fixture = await renderComponent({
      gitAuthor: 'nitoba',
      gitSincePeriod: '24 hours ago',
      azureDevopsUser: '',
    })
    const el = fixture.nativeElement as HTMLElement

    const periodInput = el.querySelector<HTMLInputElement>('#git-since-period')
    expect(periodInput?.value).toBe('24 hours ago')
  })

  it('renders azure devops user input with correct value', async () => {
    const fixture = await renderComponent({
      gitAuthor: 'nitoba',
      gitSincePeriod: '8 hours ago',
      azureDevopsUser: 'Jane Smith',
    })
    const el = fixture.nativeElement as HTMLElement

    const azureInput = el.querySelector<HTMLInputElement>('#azure-devops-user')
    expect(azureInput?.value).toBe('Jane Smith')
  })

  it('emits gitAuthorChange when author input changes', async () => {
    const fixture = await renderComponent({
      gitAuthor: 'nitoba',
      gitSincePeriod: '8 hours ago',
      azureDevopsUser: '',
    })
    const outputSpy = vi.fn()
    ;(fixture.componentInstance as GitConfigSection).gitAuthorChange.subscribe(
      outputSpy,
    )

    const input = fixture.nativeElement.querySelector(
      '#git-author',
    ) as HTMLInputElement
    input.value = 'new-author'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith('new-author')
  })

  it('emits gitSincePeriodChange when period input changes', async () => {
    const fixture = await renderComponent({
      gitAuthor: 'nitoba',
      gitSincePeriod: '8 hours ago',
      azureDevopsUser: '',
    })
    const outputSpy = vi.fn()
    ;(
      fixture.componentInstance as GitConfigSection
    ).gitSincePeriodChange.subscribe(outputSpy)

    const input = fixture.nativeElement.querySelector(
      '#git-since-period',
    ) as HTMLInputElement
    input.value = '2 days ago'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith('2 days ago')
  })

  it('emits azureDevopsUserChange when azure user input changes', async () => {
    const fixture = await renderComponent({
      gitAuthor: 'nitoba',
      gitSincePeriod: '8 hours ago',
      azureDevopsUser: '',
    })
    const outputSpy = vi.fn()
    ;(
      fixture.componentInstance as GitConfigSection
    ).azureDevopsUserChange.subscribe(outputSpy)

    const input = fixture.nativeElement.querySelector(
      '#azure-devops-user',
    ) as HTMLInputElement
    input.value = 'new-azure-user'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith('new-azure-user')
  })
})
