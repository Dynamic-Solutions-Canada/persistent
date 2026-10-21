/** Nine-locale Play text validation and edit orchestration, independent of app runtime dependencies. */
export class PlayMetadata {
  static languages = ['en-US', 'en-CA', 'es-ES', 'fr-FR', 'fr-CA', 'de-DE', 'zh-CN', 'pt-BR', 'ja-JP']
  static limits = { title: 30, shortDescription: 80, fullDescription: 4000 }

  /** Validate the entire source before OAuth or any edit. Aliases share copy, never locale identity. */
  static listings(source) {
    return this.#resolve(source, this.limits)
  }

  /** Curated release notes are version-bound and rejected, rather than silently truncated, above 500 chars. */
  static notes(source, versionName) {
    if (!versionName || source.versionName !== versionName) {
      throw new Error('Localized notes versionName must match --version-name.')
    }
    return this.#resolve(source, { text: 500 }).map(({ language, text }) => ({ language, text }))
  }

  static #resolve(source, limits) {
    if (source?.schemaVersion !== 1 || !source.locales || typeof source.locales !== 'object') {
      throw new Error('Metadata needs schemaVersion 1 and locales.')
    }
    const keys = Object.keys(source.locales)
    if (keys.length !== this.languages.length || this.languages.some((key) => !keys.includes(key))) {
      throw new Error('Metadata must contain exactly the nine supported Play language tags.')
    }
    return this.languages.map((language) => {
      let value = source.locales[language]
      if (value?.copyFrom) {
        const aliases = { 'en-CA': 'en-US', 'fr-CA': 'fr-FR' }
        if (Object.keys(value).length !== 1 || aliases[language] !== value.copyFrom) {
          throw new Error(`${language}: invalid copyFrom alias.`)
        }
        value = source.locales[value.copyFrom]
        if (value?.copyFrom) throw new Error(`${language}: chained/cyclic aliases are not allowed.`)
      }
      if (!value || Object.keys(value).some((key) => !Object.hasOwn(limits, key))) {
        throw new Error(`${language}: unexpected metadata field.`)
      }
      for (const [field, limit] of Object.entries(limits)) {
        const text = value[field]
        if (typeof text !== 'string' || !text.trim() || [...text].length > limit) {
          throw new Error(`${language}.${field} must contain 1-${limit} characters.`)
        }
      }
      return { language, ...value }
    })
  }

  /**
   * Stage only title/descriptions for all languages in one edit. Existing video,
   * images, unknown translations, app details and distribution are untouched.
   * A read-only check discards its edit; failures also discard uncommitted work.
   */
  static async publishListings({ listings, request, commit, editPath, check, report = console.log }) {
    const edit = await request(editPath, { method: 'POST', body: {} })
    const path = `${editPath}/${edit.id}`
    let committed = false
    try {
      const current = await request(`${path}/listings`)
      for (const listing of listings) {
        const before = current.listings?.find((item) => item.language === listing.language)
        const changes = Object.entries(this.limits).map(([field, limit]) =>
          `${field}: ${before?.[field] === listing[field] ? 'unchanged' : 'CHANGED'} (${[...listing[field]].length}/${limit})`)
        report(`[play-publish] ${listing.language}: ${changes.join(', ')}`)
      }
      if (check) {
        report('[play-publish] --check: no text written, edit discarded on exit.')
        return
      }
      for (const listing of listings) {
        const exists = current.listings?.some((item) => item.language === listing.language)
        // PUT is the documented create operation. PATCH preserves an existing
        // locale's video field; graphics have their own untouched endpoints.
        await request(`${path}/listings/${listing.language}`, {
          method: exists ? 'PATCH' : 'PUT', body: listing
        })
      }
      await commit(edit.id)
      committed = true
      report('[play-publish] Nine text listings committed. Verify Console review/publication separately.')
    } finally {
      if (!committed) await request(path, { method: 'DELETE' })
    }
  }
}
