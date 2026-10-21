/** Browser constraint failures use the selected interface language without changing field values. */
import type { FormEvent } from 'react'
import { tr } from './i18n.js'

/** Apply application copy only when the browser rejects an input; the next edit clears it. */
export function localizeInvalidInput(event: FormEvent<HTMLInputElement>): void {
  const input = event.currentTarget
  const validity = input.validity
  if (validity.valueMissing) input.setCustomValidity(tr('Fill in this field.'))
  else if (validity.typeMismatch && input.type === 'email') input.setCustomValidity(tr('Enter a valid email address.'))
  else if (validity.typeMismatch && input.type === 'url') input.setCustomValidity(tr('Enter a valid web address.'))
  else if (validity.rangeUnderflow) input.setCustomValidity(tr('Enter a value of at least {{minimum}}.', { minimum: input.min }))
  else if (validity.rangeOverflow) input.setCustomValidity(tr('Enter a value no greater than {{maximum}}.', { maximum: input.max }))
  else if (validity.badInput || validity.stepMismatch) input.setCustomValidity(tr('Enter a valid number.'))
}

/** Custom validity must never remain attached after a user corrects a field. */
export function clearInputValidity(event: FormEvent<HTMLInputElement>): void {
  event.currentTarget.setCustomValidity('')
}
