import rawStrings from './data/strings.ko.json' with { type: 'json' }

export type IpMode = 'conti' | 'own'
export type StringTable = Readonly<Record<string, string>>

const tables: Readonly<Record<IpMode, StringTable>> = rawStrings

export function getStrings(ipMode: IpMode): StringTable {
  return tables[ipMode]
}

export function t(key: string, ipMode: IpMode = 'conti'): string {
  const value = tables[ipMode][key]
  if (value === undefined) throw new Error(`missing translation: ${ipMode}.${key}`)
  return value
}
