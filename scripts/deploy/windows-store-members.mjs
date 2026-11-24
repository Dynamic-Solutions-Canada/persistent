/**
 * Read and write Store API members whatever their casing: the Store CLI and the REST API
 * return PascalCase or camelCase, and an update must keep the response's own spelling.
 */

/** Read a member regardless of the casing used by the Store CLI or API. */
export function member(object, name) {
  const key = Object.keys(object ?? {}).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  )
  return key ? object[key] : undefined
}

/** Write a member while preserving the API response's original property casing. */
export function setMember(object, name, value) {
  const key =
    Object.keys(object).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    ) ?? name
  object[key] = value
}
