import rawStrings from './data/strings.ko.json' with { type: 'json' }

export type IpMode = 'conti' | 'own'
export type StringTable = Readonly<Record<string, string>>

const tables: Readonly<Record<IpMode, StringTable>> = rawStrings
export const IP_MODE_DEFAULT: IpMode = 'own'
const IS_PRODUCTION = import.meta.env?.PROD === true

export function resolveIpMode(ipMode: IpMode = IP_MODE_DEFAULT, production = IS_PRODUCTION): IpMode {
  return production ? 'own' : ipMode
}

export function getStrings(ipMode: IpMode = IP_MODE_DEFAULT): StringTable {
  return tables[resolveIpMode(ipMode)]
}

export function t(key: string, ipMode: IpMode = IP_MODE_DEFAULT): string {
  const resolvedMode = resolveIpMode(ipMode)
  const value = tables[resolvedMode][key]
  if (value === undefined) throw new Error(`missing translation: ${resolvedMode}.${key}`)
  return value
}
