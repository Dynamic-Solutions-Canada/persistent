/* Trusted display-only catalogs arrive through the existing bounded native state channel. */
let strings = {}
function text(key, parameters = {}) {
  return (strings[key] ?? key).replace(/{{\s*(\w+)\s*}}/g, (token, name) => Object.hasOwn(parameters, name) ? String(parameters[name]) : token)
}
function applyLocalization(value) {
  if (!value || typeof value.language !== 'string' || !value.strings || typeof value.strings !== 'object') return
  strings = value.strings
  document.documentElement.lang = value.language
  for (const element of document.querySelectorAll('[data-i18n-text]')) element.textContent = text(element.dataset.i18nText)
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) element.setAttribute(attribute, text(element.getAttribute(`data-i18n-${attribute}`)))
  }
}
window.persistentText = { text, applyLocalization }
