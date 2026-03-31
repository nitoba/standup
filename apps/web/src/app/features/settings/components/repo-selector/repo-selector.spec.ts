import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { RepoSelector } from './repo-selector'

interface RepoOption {
  name: string
  displayName: string
  id: string
  project: string
}

describe('RepoSelector', () => {
  async function renderComponent(inputs: {
    reposByProject: { project: string; repos: RepoOption[] }[]
    selectedRepos: string[]
  }) {
    await TestBed.configureTestingModule({
      imports: [RepoSelector],
    }).compileComponents()

    const fixture = TestBed.createComponent(RepoSelector)
    fixture.componentRef.setInput('reposByProject', inputs.reposByProject)
    fixture.componentRef.setInput('selectedRepos', inputs.selectedRepos)
    fixture.detectChanges()

    return fixture
  }

  it('renders project group headers', async () => {
    const fixture = await renderComponent({
      reposByProject: [
        {
          project: 'AGROTRACE',
          repos: [
            { id: '1', name: 'web', displayName: 'web', project: 'AGROTRACE' },
          ],
        },
      ],
      selectedRepos: [],
    })
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).toContain('AGROTRACE')
  })

  it('renders repo checkboxes with correct labels', async () => {
    const fixture = await renderComponent({
      reposByProject: [
        {
          project: 'AGROTRACE',
          repos: [
            { id: '1', name: 'web', displayName: 'web', project: 'AGROTRACE' },
            { id: '2', name: 'api', displayName: 'api', project: 'AGROTRACE' },
          ],
        },
      ],
      selectedRepos: [],
    })
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).toContain('web')
    expect(el.textContent).toContain('api')
  })

  it('shows checkboxes as checked for selected repos', async () => {
    const fixture = await renderComponent({
      reposByProject: [
        {
          project: 'AGROTRACE',
          repos: [
            { id: '1', name: 'web', displayName: 'web', project: 'AGROTRACE' },
          ],
        },
      ],
      selectedRepos: ['AGROTRACE/web'],
    })
    const el = fixture.nativeElement as HTMLElement

    const checkbox = el.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    expect(checkbox?.checked).toBe(true)
  })

  it('emits selectionChange with added repo when checkbox is checked', async () => {
    const fixture = await renderComponent({
      reposByProject: [
        {
          project: 'AGROTRACE',
          repos: [
            { id: '1', name: 'web', displayName: 'web', project: 'AGROTRACE' },
          ],
        },
      ],
      selectedRepos: [],
    })
    const outputSpy = vi.fn()
    ;(fixture.componentInstance as RepoSelector).selectionChange.subscribe(
      outputSpy,
    )

    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith(['AGROTRACE/web'])
  })

  it('emits selectionChange with repo removed when unchecked', async () => {
    const fixture = await renderComponent({
      reposByProject: [
        {
          project: 'AGROTRACE',
          repos: [
            { id: '1', name: 'web', displayName: 'web', project: 'AGROTRACE' },
          ],
        },
      ],
      selectedRepos: ['AGROTRACE/web'],
    })
    const outputSpy = vi.fn()
    ;(fixture.componentInstance as RepoSelector).selectionChange.subscribe(
      outputSpy,
    )

    const checkbox = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith([])
  })

  it('emits full selection array when multiple repos are selected', async () => {
    const fixture = await renderComponent({
      reposByProject: [
        {
          project: 'AGROTRACE',
          repos: [
            { id: '1', name: 'web', displayName: 'web', project: 'AGROTRACE' },
            { id: '2', name: 'api', displayName: 'api', project: 'AGROTRACE' },
          ],
        },
      ],
      selectedRepos: ['AGROTRACE/web'],
    })
    const outputSpy = vi.fn()
    ;(fixture.componentInstance as RepoSelector).selectionChange.subscribe(
      outputSpy,
    )

    const checkboxes = fixture.nativeElement.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>
    checkboxes[1]!.click()
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith(['AGROTRACE/web', 'AGROTRACE/api'])
  })
})
