/** Nine-locale Play text validation and listing edit orchestration (text, optionally phone screenshots), independent of app runtime dependencies. */
export class PlayMetadata {
  static languages = [
    'en-US',
    'en-CA',
    'es-ES',
    'fr-FR',
    'fr-CA',
    'de-DE',
    'zh-CN',
    'pt-BR',
    'ja-JP',
  ]
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
    return this.#resolve(source, { text: 500 }).map(({ language, text }) => ({
      language,
      text,
    }))
  }

  static #resolve(source, limits) {
    if (
      source?.schemaVersion !== 1 ||
      !source.locales ||
      typeof source.locales !== 'object'
    ) {
      throw new Error('Metadata needs schemaVersion 1 and locales.')
    }
    const keys = Object.keys(source.locales)
    if (
      keys.length !== this.languages.length ||
      this.languages.some((key) => !keys.includes(key))
    ) {
      throw new Error(
        'Metadata must contain exactly the nine supported Play language tags.',
      )
    }
    return this.languages.map((language) => {
      let value = source.locales[language]
      if (value?.copyFrom) {
        const aliases = { 'en-CA': 'en-US', 'fr-CA': 'fr-FR' }
        if (
          Object.keys(value).length !== 1 ||
          aliases[language] !== value.copyFrom
        ) {
          throw new Error(`${language}: invalid copyFrom alias.`)
        }
        value = source.locales[value.copyFrom]
        if (value?.copyFrom)
          throw new Error(
            `${language}: chained/cyclic aliases are not allowed.`,
          )
      }
      if (
        !value ||
        Object.keys(value).some((key) => !Object.hasOwn(limits, key))
      ) {
        throw new Error(`${language}: unexpected metadata field.`)
      }
      for (const [field, limit] of Object.entries(limits)) {
        const text = value[field]
        if (
          typeof text !== 'string' ||
          !text.trim() ||
          [...text].length > limit
        ) {
          throw new Error(
            `${language}.${field} must contain 1-${limit} characters.`,
          )
        }
      }
      return { language, ...value }
    })
  }

  /**
   * Stage title/descriptions for all languages in one edit, and with `images` also
   * replace each planned language's phone screenshots in that same edit. Existing
   * video, unplanned image types (icon, feature graphic), unknown translations, app
   * details and distribution are untouched. A read-only check discards its edit;
   * failures also discard uncommitted work.
   *
   * @param {object} options
   * @param {{ language: string }[]} options.listings Validated text, from listings().
   * @param {(path: string, init?: object) => Promise<any>} options.request Play API call;
   *   `raw` and `rawType` in init send bytes instead of JSON.
   * @param {(editId: string) => Promise<void>} options.commit Commits the edit.
   * @param {string} options.editPath The app's edits collection path.
   * @param {boolean} options.check Report only, write nothing.
   * @param {{ language: string, imageType: string, shots: { name: string, bytes: Buffer, contentType: string }[] }[] | null} [options.images]
   *   Per-language screenshot plan from PlayImages.plan(), or null for text only.
   * @param {(line: string) => void} [options.report]
   */
  static async publishListings({
    listings,
    request,
    commit,
    editPath,
    check,
    images = null,
    report = console.log,
  }) {
    const edit = await request(editPath, { method: 'POST', body: {} })
    const path = `${editPath}/${edit.id}`
    let committed = false
    try {
      const current = await request(`${path}/listings`)
      for (const listing of listings) {
        const before = current.listings?.find(
          (item) => item.language === listing.language,
        )
        const changes = Object.entries(this.limits).map(
          ([field, limit]) =>
            `${field}: ${before?.[field] === listing[field] ? 'unchanged' : 'CHANGED'} (${[...listing[field]].length}/${limit})`,
        )
        report(`[play-publish] ${listing.language}: ${changes.join(', ')}`)
      }
      if (images)
        await this.#reportImages({ images, current, path, request, report })
      if (check) {
        report(
          `[play-publish] --check: no ${images ? 'text or images' : 'text'} written, edit discarded on exit.`,
        )
        return
      }
      for (const listing of listings) {
        const exists = current.listings?.some(
          (item) => item.language === listing.language,
        )
        // PUT is the documented create operation. PATCH preserves an existing
        // locale's video field; graphics have their own untouched endpoints.
        await request(`${path}/listings/${listing.language}`, {
          method: exists ? 'PATCH' : 'PUT',
          body: listing,
        })
      }
      // After the text, so a language the text sync just created exists in this edit.
      if (images) await this.#replaceImages({ images, path, request, report })
      await commit(edit.id)
      committed = true
      const imageSummary = images
        ? ` and ${images[0].shots.length} phone screenshots per language`
        : ''
      report(
        `[play-publish] Nine text listings${imageSummary} committed. Verify Console review/publication separately.`,
      )
    } finally {
      if (!committed) await request(path, { method: 'DELETE' })
    }
  }

  /**
   * Log the planned replacement per language. Only languages already on Play are read:
   * a listing the text sync would create does not exist in a check's edit, and reading
   * its images would fail the whole run.
   */
  static async #reportImages({ images, current, path, request, report }) {
    for (const { language, imageType, shots } of images) {
      const exists = current.listings?.some(
        (item) => item.language === language,
      )
      let before = 'new listing, 0'
      if (exists) {
        const live = await request(`${path}/listings/${language}/${imageType}`)
        before = String(live.images?.length ?? 0)
      }
      report(
        `[play-publish] ${language} ${imageType}: ${before} on Play -> ${shots.length}`,
      )
    }
    const files = images[0].shots.map(
      ({ name, width, height }) => `${name} (${width}x${height})`,
    )
    report(`[play-publish] screenshots in order: ${files.join(', ')}`)
  }

  /**
   * Replace each planned language's image set inside the open edit, then re-read it and
   * throw if Play holds a different count, so the edit never commits a partial carousel.
   * Replaced whole rather than diffed: Play has no stable identity to match a file against.
   */
  static async #replaceImages({ images, path, request, report }) {
    for (const { language, imageType, shots } of images) {
      const imagesPath = `${path}/listings/${language}/${imageType}`
      await request(imagesPath, { method: 'DELETE' })
      for (const shot of shots) {
        await request(`/upload${imagesPath}?uploadType=media`, {
          method: 'POST',
          raw: shot.bytes,
          rawType: shot.contentType,
        })
      }

      const staged = await request(imagesPath)
      const count = staged.images?.length ?? 0
      if (count !== shots.length) {
        throw new Error(
          `${language} ${imageType}: Play holds ${count} after upload, expected ${shots.length}.`,
        )
      }
      report(`[play-publish] ${language} ${imageType}: ${count} uploaded`)
    }
  }
}
