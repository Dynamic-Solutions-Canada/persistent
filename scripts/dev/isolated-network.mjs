/** Reject disposable Docker subnets that overlap an existing IPv4 route or network. */
export function assertUnusedIpv4Subnet(subnet, occupied) {
  const candidate = ipv4Range(subnet)
  if (candidate.prefix < 24 || candidate.prefix > 30 || !subnet.startsWith('10.')) {
    throw new Error('Use a small explicitly selected private 10.x IPv4 subnet.')
  }
  for (const value of occupied) {
    if (!value || value === 'default' || value === '0.0.0.0/0' || value.includes(':')) continue
    const range = ipv4Range(value.includes('/') ? value : `${value}/32`)
    if (candidate.start <= range.end && range.start <= candidate.end) {
      throw new Error('Selected disposable subnet overlaps an existing route or Docker network.')
    }
  }
}

/** Return the inclusive numeric address range represented by a validated IPv4 CIDR. */
function ipv4Range(cidr) {
  const match = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/)
  if (!match) throw new Error('Invalid IPv4 CIDR.')
  const octets = match.slice(1, 5).map(Number)
  const prefix = Number(match[5])
  if (octets.some((octet) => octet > 255) || prefix > 32) throw new Error('Invalid IPv4 CIDR.')
  const address = octets.reduce((total, octet) => total * 256 + octet, 0)
  const size = 2 ** (32 - prefix)
  const start = Math.floor(address / size) * size
  return { start, end: start + size - 1, prefix }
}
