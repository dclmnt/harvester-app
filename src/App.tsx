import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { Download, Linkedin, Menu, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Stem {
  stem_key: string
  harvest_date: string
  stem_volume: number
  dbh?: number
  end_time?: Date
  speciesGroupKey?: string
  speciesName?: string
  speciesCategory: SpeciesCategory
}
type SpeciesCategory = 'Tall' | 'Gran' | 'Löv'

interface CalculationParams {
  maxPerTreeTime: number
  harvestingCostRate: number
  forwardingSK: number
  skiddingDistanceSA: number
  standRemovalUT: number
  k1: number
  k2: number
  c11: number
}

type CalculationConstants = Pick<CalculationParams, 'k1' | 'k2' | 'c11' | 'maxPerTreeTime'>

interface ResultRow {
  species: SpeciesCategory
  dbhClass: number
  stems: number
  totalTime: number
  totalVolume: number
  productivity: number
  harvestingCost: number
  forwardingCostPerCubicMeter: number
  pricePerCubicMeter: number
  totalCost: number
  totalPrice: number
}

interface NewTotals {
  totalStems: number
  totalVolume: number
  averagePrice: number
  totalPrice: number
  forwardingCostPerCubicMeter: number
  totalForwardingCost: number
  combinedTotal: number
}

interface LegacyTotals {
  totalStems: number
  totalVolume: number
  averageVolume: number
  averagePrice: number
  totalPrice: number
}

interface LegacyPriceEntry {
  averageVolume: number
  price: number
}

type SpeciesDivisors = Record<SpeciesCategory, Array<number | null>>
type Language = 'sv' | 'en'
type StatusInfo =
  | { kind: 'filesSelected'; count: number }
  | { kind: 'parsed'; stems: number; logs: number }
  | { kind: 'noStems' }
  | null

const normalizeSpeciesIdentifier = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()

const mapSpeciesNameToCategory = (rawName?: string): SpeciesCategory => {
  if (!rawName) return 'Löv'
  const normalized = normalizeSpeciesIdentifier(rawName)

  if (/TALL|PINE|LARK/.test(normalized)) return 'Tall'
  if (/GRAN|SPRUCE|BARKBORRE/.test(normalized)) return 'Gran'
  if (/LOV|BJORK|ASP|BOK|EK|OVR/.test(normalized)) return 'Löv'

  return 'Löv'
}

const LEGACY_AVERAGE_VOLUMES = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1]

const DBH_CLASSES = [
  80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 520, 540, 560, 580,
]

const DEFAULT_SPECIES_DIVISORS: SpeciesDivisors = {
  Tall: [2.5, 3.8, 6.2, 9.2, 12.7, 16.8, 21.1, 25.3, 29.6, 33.8, 38.1, 42, 46.6, 49.7, 53.4, 55.4, 57.2, 56.9, 60.1, 57.6, 54.7, 57.8, 54.8, 54, 57, 57.8],
  Gran: [3.4, 5.1, 7.6, 10.7, 14.1, 17.8, 21.8, 25.7, 30.3, 34.7, 38.9, 43.2, 47, 49.5, 51.8, 53.1, 54.1, 53.9, 54.2, 52.7, 52.6, 51.8, 50.4, 54.1, 48.4, 46.8],
  Löv: [2.8, 4.1, 6.1, 8.3, 11.1, 14, 16.7, 20.6, 23.2, 26.2, 28.3, 31, 33.9, 34.1, 36.1, 38.9, 39.6, 38.3, 39, 42.4, 41, 41, 41, 41, 41, 41],
}

const SUPPORTED_SPECIES: SpeciesCategory[] = ['Tall', 'Gran', 'Löv']
const SPECIES_LABELS: Record<Language, Record<SpeciesCategory, string>> = {
  en: {
    Tall: 'Pine',
    Gran: 'Spruce',
    Löv: 'Broadleaf',
  },
  sv: {
    Tall: 'Tall',
    Gran: 'Gran',
    Löv: 'Löv',
  },
}

const translations: Record<Language, {
  languageToggle: { sv: string; en: string }
  header: { openAdmin: string; backToCalculator: string }
  navigation: {
    title: string
    calculator: string
    admin: string
    toggleOpen: string
    toggleClose: string
  }
  upload: {
    title: string
    subtitle: string
    dragAndDrop: string
    or: string
    browse: string
    acceptedFormat: string
    reset: string
    fileUploadedTitle: string
    fileUploadedDescription: string
    uploadAnother: string
    resetAll: string
  }
  status: {
    filesSelected: (count: number) => string
    parsed: (stems: number, logs: number) => string
    noStems: string
  }
  settings: {
    title: string
    subtitle: string
    harvestingTitle: string
    harvestingDescription: string
    harvestingCost: string
    forwardingTitle: string
    forwardingDescription: string
    forwardingCost: string
    skiddingDistance: string
    standRemoval: string
    constantsNote: string
  }
  legacyPricing: {
    title: string
    description: string
    pasteButton: string
    pastePlaceholder: string
    pasteTip: string
    cancel: string
    apply: string
    averageStem: string
    basePrice: string
    pricePlaceholder: string
  }
  actions: {
    calculate: string
    exportSpreadsheet: string
  }
  tables: {
    pricePerDbhTitle: string
    pricePerDbhSubtitle: string
    harvestingCalculationTitle: string
    harvestingCalculationSubtitle: string
    emptyState: string
    species: string
    dbh: string
    stems: string
    volume: string
    price: string
    value: string
    noStemsMessage: string
    total: string
    allResultsSheet: string
  }
  newModel: {
    title: string
    subtitle: string
    totalStems: string
    totalVolume: string
    weightedPrice: string
    projectedValue: string
    harvestingCost: string
    forwardingCost: string
    combinedTotal: string
    forwardingRate: string
    valueBySpecies: string
    speciesSummary: (stems: number, volume: number) => string
  }
  legacyModel: {
    title: string
    subtitle: string
    averageStemVolume: string
    priceForAverageStem: string
    totalVolume: string
    legacyPayout: string
    basePriceEntries: (setCount: number, totalCount: number) => string
  }
  admin: {
    title: string
    description: string
    hideConstants: string
    showConstants: string
    resetDefaults: string
    advancedConstants: string
    advancedConstantsDescription: string
    maxPerTreeTime: string
    tallDivisor: string
    granDivisor: string
    lovDivisor: string
  }
  footer: {
    ownership: string
    project: string
    createdBy: string
    viewProfile: string
  }
}> = {
  en: {
    languageToggle: { sv: 'Swedish', en: 'English' },
    header: {
      openAdmin: 'Open admin settings',
      backToCalculator: 'Back to calculator',
    },
    navigation: {
      title: 'Navigation',
      calculator: 'Calculator',
      admin: 'Admin settings',
      toggleOpen: 'Open navigation menu',
      toggleClose: 'Collapse navigation menu',
    },
    upload: {
      title: 'File Upload',
      subtitle: 'Upload your HPR file',
      dragAndDrop: 'Drag and drop file here',
      or: 'or',
      browse: 'Browse files',
      acceptedFormat: 'Accepted format: .hpr',
      reset: 'Reset',
      fileUploadedTitle: 'File uploaded',
      fileUploadedDescription: 'Your HPR data has been loaded. Additional files will be combined into the same result.',
      uploadAnother: 'Add more files',
      resetAll: 'Reset all',
    },
    status: {
      filesSelected: (count) => `${count} files selected`,
      parsed: (stems, logs) => `Parsed ${stems} stems, ${logs} logs`,
      noStems: 'No stems detected in the uploaded files. Please verify the HPR file and try again.',
    },
    settings: {
      title: 'Cost and performance settings',
      subtitle: 'Adjust the rates used for both the old and new pricing models.',
      harvestingTitle: 'Harvesting calculation',
      harvestingDescription: 'Parameters used to determine the harvesting productivity and tariffs.',
      harvestingCost: 'Harvesting cost (kr/G15h)',
      forwardingTitle: 'Forwarding calculation',
      forwardingDescription: 'Configure the forwarding rate inputs used in the cost projections.',
      forwardingCost: 'Forwarding cost (kr/G15h)',
      skiddingDistance: 'Skidding distance (m)',
      standRemoval: 'Stand removal (m³fub/ha)',
      constantsNote:
        'Advanced harvesting and forwarding constants, including the max per-tree time and k1, k2, c11, can be adjusted from the admin panel.',
    },
    legacyPricing: {
      title: 'Input base price kr/m³fub',
      description: 'Enter the legacy price list based on average stem volume.',
      pasteButton: 'Paste prices',
      pastePlaceholder: 'Paste numbers from a spreadsheet. Example:\n0.20\t110\n0.25\t115',
      pasteTip:
        'Tip: copy both columns (average stem and price) or a single column of prices. Values are matched in order when no stem is provided.',
      cancel: 'Cancel',
      apply: 'Apply paste',
      averageStem: 'Average stem (m³)',
      basePrice: 'Base price (kr/m³fub)',
      pricePlaceholder: 'e.g. 110',
    },
    actions: {
      calculate: 'Calculate',
      exportSpreadsheet: 'Export Excel',
    },
    tables: {
      pricePerDbhTitle: 'Price per DBH',
      pricePerDbhSubtitle: 'Harvesting rate divided by your divisor table.',
      harvestingCalculationTitle: 'Harvesting Price calculation',
      harvestingCalculationSubtitle:
        'Calculated volume, price, and value per DBH class and species using your uploaded data.',
      emptyState: 'Upload an HPR file and run Calculate to see per-species pricing.',
      species: 'Species',
      dbh: 'DBH',
      stems: 'Stems (st)',
      volume: 'Volume (m³)',
      price: 'Price (kr/m³)',
      value: 'Value (kr)',
      noStemsMessage: 'No stems matched this species in the uploaded data.',
      total: 'Total',
      allResultsSheet: 'All results',
    },
    newModel: {
      title: 'New model · per-bin pricing',
      subtitle: 'Tariffs calculated from DBH + species bins.',
      totalStems: 'Total stems',
      totalVolume: 'Total volume',
      weightedPrice: 'Weighted price',
      projectedValue: 'Projected value',
      harvestingCost: 'Harvesting cost',
      forwardingCost: 'Forwarding cost',
      combinedTotal: 'Total',
      forwardingRate: 'Forwarding:',
      valueBySpecies: 'Value by species',
      speciesSummary: (stems, volume) => `${stems} stems · ${volume.toFixed(3)} m³`,
    },
    legacyModel: {
      title: 'Legacy model · single bin',
      subtitle: 'Entire stand priced with the dataset average stem.',
      averageStemVolume: 'Average stem volume',
      priceForAverageStem: 'Price for average stem',
      totalVolume: 'Total volume',
      legacyPayout: 'Legacy payout',
      basePriceEntries: (setCount, totalCount) => `Base price entries set: ${setCount}/${totalCount}`,
    },
    admin: {
      title: 'Admin: species divisor table',
      description:
        'Adjust the divisor used to convert the harvesting cost rate into SEK/m³ for each species and DBH class. Leave blank to disable pricing for a class.',
      hideConstants: 'Hide constants',
      showConstants: 'Show constants',
      resetDefaults: 'Reset to defaults',
      advancedConstants: 'Advanced constants',
      advancedConstantsDescription:
        'Coefficients that influence the harvesting cap and forwarding cost calculations. Adjust with care.',
      maxPerTreeTime: 'Max per-tree time (s)',
      tallDivisor: 'Pine divisor',
      granDivisor: 'Spruce divisor',
      lovDivisor: 'Broadleaf divisor',
    },
    footer: {
      ownership: 'This app is owned and maintained by the creators listed below.',
      project: 'Built as part of a project at Linnaeus University for the couse Team based innovation work.',
      createdBy: 'Created by',
      viewProfile: 'LinkedIn profile',
    },
  },
  sv: {
    languageToggle: { sv: 'Svenska', en: 'Engelska' },
    header: {
      openAdmin: 'Öppna admininställningar',
      backToCalculator: 'Tillbaka till kalkylatorn',
    },
    navigation: {
      title: 'Navigering',
      calculator: 'Kalkylator',
      admin: 'Admininställningar',
      toggleOpen: 'Öppna navigationsmenyn',
      toggleClose: 'Dölj navigationsmenyn',
    },
    upload: {
      title: 'Filuppladdning',
      subtitle: 'Ladda upp din HPR-fil',
      dragAndDrop: 'Dra och släpp filen här',
      or: 'eller',
      browse: 'Bläddra bland filer',
      acceptedFormat: 'Tillåtet format: .hpr',
      reset: 'Återställ',
      fileUploadedTitle: 'Fil uppladdad',
      fileUploadedDescription: 'Din HPR-data har lästs in. Ytterligare filer läggs till i samma resultat.',
      uploadAnother: 'Lägg till fler filer',
      resetAll: 'Återställ',
    },
    status: {
      filesSelected: (count) => `${count} filer valda`,
      parsed: (stems, logs) => `Bearbetade ${stems} stammar, ${logs} stockar`,
      noStems: 'Inga stammar hittades i de uppladdade filerna. Kontrollera HPR-filen och försök igen.',
    },
    settings: {
      title: 'Kostnads- och prestationsinställningar',
      subtitle: 'Justera nivåerna som används för både den gamla och den nya prismodellen.',
      harvestingTitle: 'Avverkningsberäkning',
      harvestingDescription: 'Parametrar som används för att beräkna avverkningsproduktivitet och taxor.',
      harvestingCost: 'Avverkningskostnad (kr/G15h)',
      forwardingTitle: 'Skotningsberäkning',
      forwardingDescription: 'Konfigurera indata för skotningen som används i kostnadsprognosen.',
      forwardingCost: 'Skotningskostnad (kr/G15h)',
      skiddingDistance: 'Skotningsavstånd (m)',
      standRemoval: 'Uttag i m³fub/ha',
      constantsNote:
        'Avancerade konstanter för avverkning och skotning, inklusive max tid per träd samt k1, k2 och c11, justeras i adminpanelen.',
    },
    legacyPricing: {
      title: 'Ange grundpris kr/m³fub',
      description: 'Fyll i den gamla prislistan baserad på medelstamsvolym.',
      pasteButton: 'Klistra in priser',
      pastePlaceholder: 'Klistra in tal från ett kalkylark. Exempel:\n0.20\t110\n0.25\t115',
      pasteTip:
        'Tips: kopiera båda kolumnerna (medelstam och pris) eller en enda kolumn med priser. Värden paras i ordning om ingen stam anges.',
      cancel: 'Avbryt',
      apply: 'Använd inklistring',
      averageStem: 'Medelstam (m³)',
      basePrice: 'Grundpris (kr/m³fub)',
      pricePlaceholder: 't.ex. 110',
    },
    actions: {
      calculate: 'Beräkna',
      exportSpreadsheet: 'Exportera Excel',
    },
    tables: {
      pricePerDbhTitle: 'Pris per DBH',
      pricePerDbhSubtitle: 'Avverkningskostnaden delad med din divisortabell.',
      harvestingCalculationTitle: 'Avverkningsprisberäkning',
      harvestingCalculationSubtitle:
        'Beräknad volym, pris och värde per DBH-klass och trädslag baserat på din uppladdade data.',
      emptyState: 'Ladda upp en HPR-fil och kör Beräkna för att se priser per trädslag.',
      species: 'Trädslag',
      dbh: 'DBH',
      stems: 'Stammar (st)',
      volume: 'Volym (m³)',
      price: 'Pris (kr/m³)',
      value: 'Värde (kr)',
      noStemsMessage: 'Inga stammar matchade detta trädslag i den uppladdade datan.',
      total: 'Totalt',
      allResultsSheet: 'Alla resultat',
    },
    newModel: {
      title: 'Ny modell · pris per klass',
      subtitle: 'Taxor beräknade från DBH- och trädslagklasser.',
      totalStems: 'Antal stammar',
      totalVolume: 'Total volym',
      weightedPrice: 'Viktat pris',
      projectedValue: 'Prognostiserat värde',
      harvestingCost: 'Avverkningskostnad',
      forwardingCost: 'Skotningskostnad',
      combinedTotal: 'Summa',
      forwardingRate: 'Skotning:',
      valueBySpecies: 'Värde per trädslag',
      speciesSummary: (stems, volume) => `${stems} stammar · ${volume.toFixed(3)} m³`,
    },
    legacyModel: {
      title: 'Gammal modell · enkel klass',
      subtitle: 'Hela beståndet prissätts med datamängdens medelstam.',
      averageStemVolume: 'Medelstamsvolym',
      priceForAverageStem: 'Pris för medelstam',
      totalVolume: 'Total volym',
      legacyPayout: 'Gammal ersättning',
      basePriceEntries: (setCount, totalCount) => `Grundprisposter satta: ${setCount}/${totalCount}`,
    },
    admin: {
      title: 'Admin: trädslagens divisortabell',
      description:
        'Justera divisorn som omvandlar avverkningskostnaden till kr/m³ för varje trädslag och DBH-klass. Lämna tomt för att inaktivera pris för en klass.',
      hideConstants: 'Dölj konstanter',
      showConstants: 'Visa konstanter',
      resetDefaults: 'Återställ till standard',
      advancedConstants: 'Avancerade konstanter',
      advancedConstantsDescription:
        'Koeficienter som påverkar maxkapning och skotningskostnadsberäkningen. Justera med försiktighet.',
      maxPerTreeTime: 'Max tid per träd (s)',
      tallDivisor: 'Tall-divisor',
      granDivisor: 'Gran-divisor',
      lovDivisor: 'Löv-divisor',
    },
    footer: {
      ownership: 'Denna app ägs och underhålls av skaparna som listas nedan.',
      project: 'Byggd som en del av ett projekt vid Linnéuniversitetet för kursen Teambaserat innovationsarbete.',
      createdBy: 'Skapad av',
      viewProfile: 'LinkedIn-profil',
    },
  },
}

const TEAM_MEMBERS = [
  { name: 'Daniel Clemente', linkedin: 'https://www.linkedin.com/in/danielbengevenga/' },
  { name: 'Nadia Zalika', linkedin: 'https://www.linkedin.com/in/nadia-zalika/' },
  { name: 'Daniella Lundqvist', linkedin: 'https://www.linkedin.com/in/daniella-lundqvist-859379178/' },
] as const

const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'sv'
  const stored = window.localStorage.getItem('language')
  return stored === 'en' ? 'en' : 'sv'
}

const resolveDbhClass = (dbh?: number): number | null => {
  if (dbh == null || !Number.isFinite(dbh) || dbh <= 0) return null
  for (const threshold of DBH_CLASSES) {
    if (dbh <= threshold) return threshold
  }
  return DBH_CLASSES[DBH_CLASSES.length - 1] ?? null
}

const ensureDivisorArray = (input: unknown): Array<number | null> =>
  DBH_CLASSES.map((_, index) => {
    const candidate = Array.isArray(input) ? (input as Array<unknown>)[index] : null
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate
    }
    return null
  })

const normaliseDivisors = (input: unknown): SpeciesDivisors => {
  const fallback: SpeciesDivisors = {
    Tall: ensureDivisorArray(DEFAULT_SPECIES_DIVISORS.Tall),
    Gran: ensureDivisorArray(DEFAULT_SPECIES_DIVISORS.Gran),
    Löv: ensureDivisorArray(DEFAULT_SPECIES_DIVISORS.Löv),
  }

  if (!input || typeof input !== 'object') return fallback

  return {
    Tall: ensureDivisorArray((input as Record<string, unknown>).Tall),
    Gran: ensureDivisorArray((input as Record<string, unknown>).Gran),
    Löv: ensureDivisorArray((input as Record<string, unknown>).Löv),
  }
}

const loadSpeciesDivisors = (): SpeciesDivisors => {
  if (typeof window === 'undefined') {
    return normaliseDivisors(null)
  }

  try {
    const raw = window.localStorage.getItem('speciesDivisors')
    if (!raw) return normaliseDivisors(null)
    const parsed = JSON.parse(raw)
    return normaliseDivisors(parsed)
  } catch (error) {
    console.warn('Failed to load species divisors from storage:', error)
    return normaliseDivisors(null)
  }
}
const parseNumber = (value: string | null | undefined): number => {
  if (value == null) return 0
  const normalized = value.trim().replace(/\s+/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const resolveLogVolume = (logEl: Element): number => {
  const preferredCategories = ['m3sub', 'm3 fub', 'm3fub', 'm3 (price)', 'm3ub', 'm3sob']
  const volumeNodes = Array.from(logEl.getElementsByTagNameNS('*', 'LogVolume'))

  const normaliseCategory = (value: string | null) => value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''

  for (const category of preferredCategories) {
    const node = volumeNodes.find((volumeNode) => normaliseCategory(volumeNode.getAttribute('logVolumeCategory')) === category)
    if (node) {
      const volume = parseNumber(node.textContent)
      if (volume > 0) return volume
    }
  }

  for (const node of volumeNodes) {
    const volume = parseNumber(node.textContent)
    if (volume > 0) return volume
  }

  const volumeAttributes = ['Volume', 'VolumeM3', 'VolumeUnderBark', 'VolumeOverBark'] as const
  for (const key of volumeAttributes) {
    const vol = parseNumber(logEl.getAttribute(key))
    if (vol > 0) return vol
  }

  const dm3Volume = parseNumber(logEl.getAttribute('VolumeDm3') ?? logEl.getAttribute('VolumeDM3'))
  if (dm3Volume > 0) {
    return dm3Volume / 1000
  }

  return 0
}

const ForestryHarvesterApp: React.FC = () => {
  const [stems, setStems] = useState<Stem[]>([])
  const [statusInfo, setStatusInfo] = useState<StatusInfo>(null)
  const [totalLogCount, setTotalLogCount] = useState(0)
  const [results, setResults] = useState<ResultRow[]>([])
  const [legacyPrices, setLegacyPrices] = useState<LegacyPriceEntry[]>(
    LEGACY_AVERAGE_VOLUMES.map((averageVolume) => ({ averageVolume, price: 0 })),
  )
  const [speciesDivisors, setSpeciesDivisors] = useState<SpeciesDivisors>(() => loadSpeciesDivisors())
  const [params, setParams] = useState<CalculationParams>({
    maxPerTreeTime: 600,
    harvestingCostRate: 1800,
    forwardingSK: 1500,
    skiddingDistanceSA: 300,
    standRemovalUT: 280,
    k1: 1,
    k2: 0.73,
    c11: 11.45,
  })

  const [newTotals, setNewTotals] = useState<NewTotals | null>(null)
  const [oldModelSummary, setOldModelSummary] = useState<LegacyTotals | null>(null)
  const [currentPath, setCurrentPath] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : '/'))
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showBulkPaste, setShowBulkPaste] = useState(false)
  const [bulkPriceText, setBulkPriceText] = useState('')
  const [hasUploaded, setHasUploaded] = useState(false)
  const [shouldAppend, setShouldAppend] = useState(false)
  const [language, setLanguage] = useState<Language>(() => getInitialLanguage())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('language', language)
  }, [language])

  const t = translations[language]
  const statusMessage = useMemo(() => {
    if (!statusInfo) return ''
    switch (statusInfo.kind) {
      case 'filesSelected':
        return t.status.filesSelected(statusInfo.count)
      case 'parsed':
        return t.status.parsed(statusInfo.stems, statusInfo.logs)
      case 'noStems':
        return t.status.noStems
      default:
        return ''
    }
  }, [statusInfo, t])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('speciesDivisors', JSON.stringify(speciesDivisors))
  }, [speciesDivisors])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  useEffect(() => {
    if (!isSidebarOpen) return
    if (typeof window === 'undefined') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSidebarOpen])

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [currentPath])

  const navigate = useCallback((path: string) => {
    if (typeof window === 'undefined') return
    if (window.location.pathname === path) return
    window.history.pushState({}, '', path)
    setCurrentPath(path)
  }, [])

  const isAdminRoute = currentPath.startsWith('/admin')

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((previous) => !previous)
  }, [])

  const handleNavigation = useCallback(
    (path: string) => {
      navigate(path)
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsSidebarOpen(false)
      }
    },
    [navigate],
  )

  const navItemClasses = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
      active ? 'bg-green-700 text-white shadow hover:bg-green-600' : 'text-foreground hover:bg-green-900/10'
    }`

  const speciesPriceMatrix = useMemo(() => {
    const result: Record<SpeciesCategory, number[]> = {
      Tall: [],
      Gran: [],
      Löv: [],
    }

    DBH_CLASSES.forEach((_, index) => {
      SUPPORTED_SPECIES.forEach((species) => {
        const divisor = speciesDivisors[species][index]
        const price = divisor && divisor > 0 ? params.harvestingCostRate / divisor : 0
        result[species][index] = price
      })
    })

    return result
  }, [params.harvestingCostRate, speciesDivisors])

  const resultsBySpecies = useMemo(() => {
    const grouped: Record<SpeciesCategory, ResultRow[]> = { Tall: [], Gran: [], Löv: [] }
    results.forEach((row) => {
      grouped[row.species].push(row)
    })
    SUPPORTED_SPECIES.forEach((species) => {
      grouped[species].sort((a, b) => a.dbhClass - b.dbhClass)
    })
    return grouped
  }, [results])

  const speciesSummaries = useMemo(() => {
    const summary: Record<SpeciesCategory, { stems: number; volume: number; totalPrice: number }> = {
      Tall: { stems: 0, volume: 0, totalPrice: 0 },
      Gran: { stems: 0, volume: 0, totalPrice: 0 },
      Löv: { stems: 0, volume: 0, totalPrice: 0 },
    }

    SUPPORTED_SPECIES.forEach((species) => {
      const rows = resultsBySpecies[species]
      const totals = rows.reduce(
        (acc, row) => {
          acc.stems += row.stems
          acc.volume += row.totalVolume
          acc.totalPrice += row.totalPrice
          return acc
        },
        { stems: 0, volume: 0, totalPrice: 0 },
      )
      summary[species] = totals
    })

    return summary
  }, [resultsBySpecies])


  const parseHPRFile = useCallback(async (file: File): Promise<{ stems: Stem[]; logCount: number }> => {
    const text = await file.text()
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(text, 'text/xml')

    const elementsByTag = (element: Element | Document, tag: string) =>
      Array.from(element.getElementsByTagNameNS('*', tag))

    const getFirstText = (element: Element | Document, tag: string) =>
      elementsByTag(element, tag)[0]?.textContent?.trim() ?? undefined

    const speciesNameByKey = new Map<string, string>()
    elementsByTag(xmlDoc, 'SpeciesGroupDefinition').forEach((definition) => {
      const key = getFirstText(definition, 'SpeciesGroupKey')
      const name = getFirstText(definition, 'SpeciesGroupName')
      if (key && name) {
        speciesNameByKey.set(key, name)
      }
    })

    const parsedStems: Stem[] = []
    let logCount = 0

    const stemElements = elementsByTag(xmlDoc, 'Stem')
    stemElements.forEach((stemEl, index) => {
      const stemKey = stemEl.getAttribute('StemKey') ?? `stem_${index}`
      const harvestDate = stemEl.getAttribute('HarvestDate') ?? new Date().toISOString()

      const speciesGroupKey = getFirstText(stemEl, 'SpeciesGroupKey')
      const speciesName = speciesGroupKey ? speciesNameByKey.get(speciesGroupKey) : undefined
      const speciesCategory = mapSpeciesNameToCategory(speciesName)

      const dbh = (() => {
        const attrValue = parseNumber(stemEl.getAttribute('DBH'))
        if (attrValue > 0) return attrValue

        const dbhElement =
          elementsByTag(stemEl, 'DBH')[0] ??
          elementsByTag(stemEl, 'SingleTreeProcessedStem').flatMap((node) => elementsByTag(node, 'DBH'))[0]
        const textValue = parseNumber(dbhElement?.textContent ?? null)
        return textValue > 0 ? textValue : undefined
      })()

      const stemVolumeCandidates = [
        stemEl.getAttribute('StemVolume'),
        stemEl.getAttribute('Volume'),
        stemEl.getAttribute('VolumeUnderBark'),
        stemEl.getAttribute('VolumeOverBark'),
      ] as const

      let stemVolume = 0
      for (const candidate of stemVolumeCandidates) {
        const volume = parseNumber(candidate)
        if (volume > 0) {
          stemVolume = volume
          break
        }
      }

      let aggregatedLogVolume = 0
      const logElements = elementsByTag(stemEl, 'Log')

      logElements.forEach((logEl) => {
        logCount += 1
        aggregatedLogVolume += resolveLogVolume(logEl)
      })

      const finalStemVolume = aggregatedLogVolume > 0 ? aggregatedLogVolume : stemVolume

      parsedStems.push({
        stem_key: stemKey,
        harvest_date: harvestDate,
        stem_volume: finalStemVolume,
        dbh,
        speciesGroupKey,
        speciesName,
        speciesCategory,
      })
    })

    return { stems: parsedStems, logCount }
  }, [])

  const processFiles = useCallback(
    async (selectedFiles: File[], options: { append?: boolean } = {}) => {
      const append = options.append ?? false

      if (selectedFiles.length === 0) {
        return
      }

      setStatusInfo({ kind: 'filesSelected', count: selectedFiles.length })

      let combinedStems: Stem[] = append ? [...stems] : []
      let combinedLogCount = append ? totalLogCount : 0

      for (const file of selectedFiles) {
        try {
          const { stems: fileStems, logCount } = await parseHPRFile(file)
          combinedStems = [...combinedStems, ...fileStems]
          combinedLogCount += logCount
        } catch (error) {
          console.error(`Error parsing file ${file.name}:`, error)
        }
      }

      setStems(combinedStems)
      setTotalLogCount(combinedLogCount)
      if (combinedStems.length > 0) {
        setStatusInfo({ kind: 'parsed', stems: combinedStems.length, logs: combinedLogCount })
        setHasUploaded(true)
        setShouldAppend(false)
      } else {
        setStatusInfo({ kind: 'noStems' })
        setHasUploaded(false)
      }
    },
    [parseHPRFile, stems, totalLogCount],
  )

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? [])
      await processFiles(selectedFiles, { append: shouldAppend })
      setShouldAppend(false)
      if (event.target) {
        event.target.value = ''
      }
    },
    [processFiles, shouldAppend],
  )

  const handleFileDrop = useCallback(
    async (event: React.DragEvent<HTMLLabelElement | HTMLDivElement>) => {
      event.preventDefault()
      const droppedFiles = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
        /\.hpr$/i.test(file.name) || /\.zip$/i.test(file.name),
      )
      if (droppedFiles.length > 0) {
        await processFiles(droppedFiles, { append: shouldAppend })
        setShouldAppend(false)
      }
    },
    [processFiles, shouldAppend],
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLLabelElement | HTMLDivElement>) => {
    event.preventDefault()
  }, [])

  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const applyBulkPricing = useCallback(
    (text: string) => {
      const trimmedText = text.trim()
      if (!trimmedText) {
        return false
      }

      const numericTokensForLine = (line: string) => line.match(/-?\d+(?:[.,]\d+)?/g) ?? []
      let updated = false

      setLegacyPrices((previous) => {
        const next = previous.map((entry) => ({ ...entry }))
        const assigned = new Set<number>()
        let fallbackIndex = 0

        const attemptAssign = (index: number, priceToken: string | null) => {
          if (index < 0 || index >= next.length || !priceToken) return
          const priceValue = parseNumber(priceToken)
          if (priceValue > 0) {
            next[index] = { ...next[index], price: priceValue }
            assigned.add(index)
            updated = true
          }
        }

        const lines = trimmedText.split(/\r?\n/)
        lines.forEach((rawLine) => {
          const line = rawLine.trim()
          if (!line) return

          const tokens = numericTokensForLine(line)
          if (tokens.length === 0) return

          let matchedIndex = -1
          let matchedVolume: number | null = null

          for (const token of tokens) {
            const value = parseNumber(token)
            if (value <= 0) continue
            const volumeIndex = LEGACY_AVERAGE_VOLUMES.findIndex((volume) => Math.abs(volume - value) < 1e-6)
            if (volumeIndex !== -1) {
              matchedIndex = volumeIndex
              matchedVolume = value
              break
            }
          }

          let priceToken: string | null = null

          if (matchedIndex !== -1) {
            priceToken = tokens
              .map((token) => ({ token, value: parseNumber(token) }))
              .find(({ value }) => matchedVolume == null || Math.abs(value - matchedVolume) > 1e-6)?.token ??
              tokens[tokens.length - 1]
          } else {
            while (fallbackIndex < next.length && assigned.has(fallbackIndex)) {
              fallbackIndex += 1
            }
            if (fallbackIndex >= next.length) return
            matchedIndex = fallbackIndex
            fallbackIndex += 1
            priceToken = tokens[tokens.length - 1]
          }

          if (assigned.has(matchedIndex)) {
            priceToken = tokens
              .map((token) => ({ token, value: parseNumber(token) }))
              .find(({ value }) => value > 0 && (!matchedVolume || Math.abs(value - matchedVolume) > 1e-6))?.token ??
              priceToken
          }

          attemptAssign(matchedIndex, priceToken)
        })

        return next
      })

      return updated
    },
    [setLegacyPrices],
  )

  const handleApplyBulkPricing = useCallback(() => {
    const success = applyBulkPricing(bulkPriceText)
    if (success) {
      setBulkPriceText('')
      setShowBulkPaste(false)
    }
  }, [applyBulkPricing, bulkPriceText, setBulkPriceText, setShowBulkPaste])

  const handleCancelBulkPricing = useCallback(() => {
    setBulkPriceText('')
    setShowBulkPaste(false)
  }, [setBulkPriceText, setShowBulkPaste])

  const handlePastePrices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      setShowBulkPaste(true)
      return
    }

    try {
      const clipboardText = await navigator.clipboard.readText()
      const success = applyBulkPricing(clipboardText)
      if (success) {
        setBulkPriceText('')
        setShowBulkPaste(false)
      } else {
        setBulkPriceText(clipboardText)
        setShowBulkPaste(true)
      }
    } catch (error) {
      console.error('Failed to read clipboard contents:', error)
      setShowBulkPaste(true)
    }
  }, [applyBulkPricing, setBulkPriceText, setShowBulkPaste])

  const handleReset = useCallback(() => {
    setStems([])
    setStatusInfo(null)
    setResults([])
    setOldModelSummary(null)
    setNewTotals(null)
    setTotalLogCount(0)
    setShouldAppend(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setHasUploaded(false)
  }, [])

  const handleAddMoreFiles = useCallback(() => {
    setShouldAppend(true)
    setHasUploaded(false)
  }, [])

  const aggregateBySpeciesAndDbh = useCallback(() => {
    if (stems.length === 0) return null

    const aggregated: Record<SpeciesCategory, Map<number, { stems: Stem[]; totalTime: number; totalVolume: number }>> = {
      Tall: new Map(),
      Gran: new Map(),
      Löv: new Map(),
    }

    const perStemTime = Math.min(params.maxPerTreeTime, 30)

    stems.forEach((stem) => {
      const dbhClass = resolveDbhClass(stem.dbh)
      if (!dbhClass) return

      const species = stem.speciesCategory
      const speciesMap = aggregated[species]
      const current = speciesMap.get(dbhClass) ?? { stems: [], totalTime: 0, totalVolume: 0 }

      current.stems.push(stem)
      current.totalVolume += stem.stem_volume
      current.totalTime += perStemTime

      speciesMap.set(dbhClass, current)
    })

    return aggregated
  }, [params.maxPerTreeTime, stems])

  const getLegacyPriceForVolume = useCallback(
    (volume?: number) => {
      if (!volume || volume <= 0 || legacyPrices.length === 0) return 0

      let nearest = legacyPrices[0]
      let minDiff = Math.abs(legacyPrices[0].averageVolume - volume)

      for (let i = 1; i < legacyPrices.length; i += 1) {
        const entry = legacyPrices[i]
        const diff = Math.abs(entry.averageVolume - volume)
        if (diff < minDiff) {
          nearest = entry
          minDiff = diff
        }
      }

      return nearest?.price ?? 0
    },
    [legacyPrices],
  )



  const calculateResults = useCallback(() => {
    const aggregated = aggregateBySpeciesAndDbh()
    if (!aggregated) return

    const baseResults: ResultRow[] = []

    const standRemoval = params.standRemovalUT
    const forwardingTimeFactor =
      standRemoval > 0
        ? (params.k1 * (5.7 + params.k2 * standRemoval + params.c11 * Math.sqrt(standRemoval))) / standRemoval
        : 0
    const forwardingCostPerCubicMeter =
      (forwardingTimeFactor / 60) * params.forwardingSK + (params.skiddingDistanceSA / 100) * 4

    SUPPORTED_SPECIES.forEach((species) => {
      const speciesData = aggregated[species]
      const sortedDbhs = Array.from(speciesData.keys()).sort((a, b) => a - b)

      sortedDbhs.forEach((dbhClass) => {
        const data = speciesData.get(dbhClass)
        if (!data) return

        const totalTime = data.totalTime
        const totalVolume = data.totalVolume
        const stemsCount = data.stems.length
        const productivity = totalTime > 0 ? totalVolume / (totalTime / 3600) : 0
        const harvestingCost =
          totalVolume > 0 ? (totalTime / totalVolume) * (params.harvestingCostRate / 3600) : 0

        const classIndex = DBH_CLASSES.indexOf(dbhClass)
        const divisor = classIndex >= 0 ? speciesDivisors[species]?.[classIndex] ?? null : null
        const pricePerCubicMeter = divisor && divisor > 0 ? params.harvestingCostRate / divisor : 0
        const totalPrice = pricePerCubicMeter * totalVolume
        const totalCost = harvestingCost + forwardingCostPerCubicMeter - pricePerCubicMeter

        baseResults.push({
          species,
          dbhClass,
          stems: stemsCount,
          totalTime,
          totalVolume,
          productivity,
          harvestingCost,
          forwardingCostPerCubicMeter,
          pricePerCubicMeter,
          totalCost,
          totalPrice,
        })
      })
    })

    baseResults.sort((a, b) => {
      if (a.species === b.species) {
        return a.dbhClass - b.dbhClass
      }
      return SUPPORTED_SPECIES.indexOf(a.species) - SUPPORTED_SPECIES.indexOf(b.species)
    })

    const totalStems = baseResults.reduce((sum, row) => sum + row.stems, 0)
    const totalVolume = baseResults.reduce((sum, row) => sum + row.totalVolume, 0)
    const totalPrice = baseResults.reduce((sum, row) => sum + row.totalPrice, 0)
    const averagePrice = totalVolume > 0 ? totalPrice / totalVolume : 0
    const averageVolumePerStem = totalStems > 0 ? totalVolume / totalStems : 0
    const totalForwardingCost = forwardingCostPerCubicMeter * totalVolume
    const combinedTotal = totalPrice + totalForwardingCost

    const legacyPrice = getLegacyPriceForVolume(averageVolumePerStem)

    setOldModelSummary({
      totalStems,
      totalVolume,
      averageVolume: averageVolumePerStem,
      averagePrice: legacyPrice,
      totalPrice: legacyPrice * totalVolume,
    })
    setNewTotals({
      totalStems,
      totalVolume,
      averagePrice,
      totalPrice,
      forwardingCostPerCubicMeter,
      totalForwardingCost,
      combinedTotal,
    })
    setResults(baseResults)
  }, [aggregateBySpeciesAndDbh, getLegacyPriceForVolume, params, speciesDivisors])

  useEffect(() => {
    if (stems.length > 0) {
      calculateResults()
    }
  }, [stems, calculateResults])

  const downloadResults = useCallback(() => {
    if (results.length === 0) return

    const escapeXml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

    const createCell = (value: string | number | null, type: 'String' | 'Number' = 'String') => {
      if (value === null || value === undefined || value === '') {
        return '<Cell/>'
      }
      if (type === 'Number') {
        return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
      }
      return `<Cell><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`
    }

    const createRow = (cells: Array<{ value: string | number | null; type?: 'String' | 'Number' }>) =>
      `<Row>${cells.map((cell) => createCell(cell.value, cell.type)).join('')}</Row>`

    const buildWorksheet = (name: string, rows: string[]) =>
      `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows.join('')}</Table></Worksheet>`

    const headerCells = [
      { value: t.tables.species },
      { value: t.tables.dbh },
      { value: t.tables.stems },
      { value: t.tables.volume },
      { value: t.tables.price },
      { value: t.tables.value },
    ]

    const formatRow = (row: ResultRow) => [
      { value: SPECIES_LABELS[language][row.species] },
      { value: row.dbhClass, type: 'Number' as const },
      { value: row.stems, type: 'Number' as const },
      { value: Number(row.totalVolume.toFixed(3)), type: 'Number' as const },
      { value: Number(row.pricePerCubicMeter.toFixed(2)), type: 'Number' as const },
      { value: Number(row.totalPrice.toFixed(2)), type: 'Number' as const },
    ]

    const totals = results.reduce(
      (acc, row) => {
        acc.stems += row.stems
        acc.volume += row.totalVolume
        acc.totalPrice += row.totalPrice
        return acc
      },
      { stems: 0, volume: 0, totalPrice: 0 },
    )

    const allWorksheetRows = [
      createRow(headerCells),
      ...results.map((row) => createRow(formatRow(row))),
      createRow([
        { value: t.tables.total },
        { value: null },
        { value: totals.stems, type: 'Number' },
        { value: Number(totals.volume.toFixed(3)), type: 'Number' },
        { value: null },
        { value: Number(totals.totalPrice.toFixed(2)), type: 'Number' },
      ]),
    ]

    const worksheets: string[] = [buildWorksheet(t.tables.allResultsSheet, allWorksheetRows)]

    SUPPORTED_SPECIES.forEach((species) => {
      const rows = resultsBySpecies[species]
      if (rows.length === 0) return

      const summary = speciesSummaries[species]
      const worksheetRows = [
        createRow(headerCells),
        ...rows.map((row) => createRow(formatRow(row))),
        createRow([
          { value: t.tables.total },
          { value: null },
          { value: summary.stems, type: 'Number' },
          { value: Number(summary.volume.toFixed(3)), type: 'Number' },
          { value: null },
          { value: Number(summary.totalPrice.toFixed(2)), type: 'Number' },
        ]),
      ]

      worksheets.push(buildWorksheet(SPECIES_LABELS[language][species], worksheetRows))
    })

    const workbookXml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">${worksheets.join('')}</Workbook>`

    const blob = new Blob([workbookXml], {
      type: 'application/vnd.ms-excel',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'hpr_class_costs.xls'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [language, results, resultsBySpecies, speciesSummaries, t])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="inline-flex border-green-900/30 bg-background/60 text-green-700 hover:bg-green-900/10"
              onClick={toggleSidebar}
              aria-expanded={isSidebarOpen}
              aria-controls="sidebar-navigation"
              aria-label={isSidebarOpen ? t.navigation.toggleClose : t.navigation.toggleOpen}
              aria-pressed={isSidebarOpen}
            >
              <Menu className="size-5" />
            </Button>
            <img src="/sodra-logo.png" alt="Södra logo" className="h-12 w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-md border border-green-900/40 bg-background/60 p-1">
              <Button
                type="button"
                size="sm"
                variant={language === 'sv' ? 'default' : 'ghost'}
                onClick={() => setLanguage('sv')}
                aria-pressed={language === 'sv'}
              >
                {t.languageToggle.sv}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={language === 'en' ? 'default' : 'ghost'}
                onClick={() => setLanguage('en')}
                aria-pressed={language === 'en'}
              >
                {t.languageToggle.en}
              </Button>
            </div>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col gap-6 md:flex-row md:items-start md:gap-12">
          {isSidebarOpen ? (
            <div
              className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setIsSidebarOpen(false)}
              aria-hidden="true"
            />
          ) : null}

          <aside
            id="sidebar-navigation"
            className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col gap-6 border border-green-900/40 bg-background/95 p-4 shadow-lg transition-transform duration-200 md:sticky md:top-6 md:h-fit md:w-64 md:rounded-xl md:bg-background/70 md:shadow-none ${
              isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
            }`}
          >
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-green-700">
                {t.navigation.title}
              </h2>
              <nav className="mt-3 flex flex-col gap-2">
                <a
                  href="/"
                  onClick={(event) => {
                    event.preventDefault()
                    handleNavigation('/')
                  }}
                  className={navItemClasses(!isAdminRoute)}
                  aria-current={!isAdminRoute ? 'page' : undefined}
                >
                  {t.navigation.calculator}
                </a>
                <a
                  href="/admin"
                  onClick={(event) => {
                    event.preventDefault()
                    handleNavigation('/admin')
                  }}
                  className={navItemClasses(isAdminRoute)}
                  aria-current={isAdminRoute ? 'page' : undefined}
                >
                  {t.navigation.admin}
                </a>
              </nav>
            </div>
          </aside>

          <main className="flex-1 mt-6 md:mt-0">
            {isAdminRoute ? (
              <AdminPage
                divisors={speciesDivisors}
                onChange={(next) => setSpeciesDivisors(next)}
                onReset={() => setSpeciesDivisors(normaliseDivisors(DEFAULT_SPECIES_DIVISORS))}
                constants={{ k1: params.k1, k2: params.k2, c11: params.c11, maxPerTreeTime: params.maxPerTreeTime }}
                onConstantChange={(key, value) => setParams((prev) => ({ ...prev, [key]: value }))}
                language={language}
              />
            ) : (
              <div className="space-y-12">
            {!hasUploaded ? (
              <Card className="border border-green-900/70 bg-background/60 p-6">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-green-700">{t.upload.title}</h2>
                    <p className="text-sm text-muted-foreground">{t.upload.subtitle}</p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={triggerFileDialog}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        triggerFileDialog()
                      }
                    }}
                    onDragOver={handleDragOver}
                    onDrop={handleFileDrop}
                    className="relative flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-green-900/70 bg-green-900/10 text-center transition hover:border-green-700 hover:bg-green-900/15 focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2 focus:ring-offset-background"
                  >
                    <Upload className="size-10 text-green-300" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-700">{t.upload.dragAndDrop}</p>
                      <p className="text-xs text-muted-foreground">{t.upload.or}</p>
                    </div>
                    <Button type="button" variant="default" onClick={triggerFileDialog} className="bg-green-700 hover:bg-green-600">
                      {t.upload.browse}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".hpr,.zip"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t.upload.acceptedFormat}</span>
                    <Button onClick={handleReset} variant="outline" size="sm">
                      <X className="mr-2 size-4" />
                      {t.upload.reset}
                    </Button>
                  </div>
                  {statusMessage ? <p className="text-xs text-muted-foreground">{statusMessage}</p> : null}
                </div>
              </Card>
            ) : (
              <Card className="border border-green-900/70 bg-background/60 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-green-700">{t.upload.fileUploadedTitle}</h2>
                    <p className="text-sm text-muted-foreground">{statusMessage || t.upload.fileUploadedDescription}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleAddMoreFiles}>
                      {t.upload.uploadAnother}
                    </Button>
                    <Button variant="ghost" onClick={handleReset}>
                      <X className="mr-2 size-4" />
                      {t.upload.resetAll}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <Card className="bg-background/60 p-6 shadow-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-green-700">{t.settings.title}</h2>
                  <p className="text-sm text-muted-foreground">{t.settings.subtitle}</p>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4 rounded-lg border border-green-900/30 bg-green-900/5 p-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-green-700">
                        {t.settings.harvestingTitle}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t.settings.harvestingDescription}
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-1">
                      <div className="space-y-2">
                        <Label htmlFor="harvestingCostRate" className="text-xs uppercase tracking-wide text-green-700">
                          {t.settings.harvestingCost}
                        </Label>
                        <Input
                          id="harvestingCostRate"
                          type="number"
                          value={params.harvestingCostRate}
                          onChange={(event) =>
                            setParams((prev) => ({ ...prev, harvestingCostRate: parseFloat(event.target.value) || 0 }))
                          }
                          className="bg-background/60"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-lg border border-green-900/30 bg-green-900/5 p-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-green-700">
                        {t.settings.forwardingTitle}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t.settings.forwardingDescription}
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="forwardingSK" className="text-xs uppercase tracking-wide text-green-700">
                          {t.settings.forwardingCost}
                        </Label>
                        <Input
                          id="forwardingSK"
                          type="number"
                          value={params.forwardingSK}
                          onChange={(event) =>
                            setParams((prev) => ({ ...prev, forwardingSK: parseFloat(event.target.value) || 0 }))
                          }
                          className="bg-background/60"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="skiddingDistanceSA" className="text-xs uppercase tracking-wide text-green-700">
                          {t.settings.skiddingDistance}
                        </Label>
                        <Input
                          id="skiddingDistanceSA"
                          type="number"
                          value={params.skiddingDistanceSA}
                          onChange={(event) =>
                            setParams((prev) => ({ ...prev, skiddingDistanceSA: parseFloat(event.target.value) || 0 }))
                          }
                          className="bg-background/60"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="standRemovalUT" className="text-xs uppercase tracking-wide text-green-700">
                          {t.settings.standRemoval}
                        </Label>
                        <Input
                          id="standRemovalUT"
                          type="number"
                          value={params.standRemovalUT}
                          onChange={(event) =>
                            setParams((prev) => ({ ...prev, standRemovalUT: parseFloat(event.target.value) || 0 }))
                          }
                          className="bg-background/60"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{t.settings.constantsNote}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-green-700">{t.legacyPricing.title}</h3>
                      <p className="text-xs text-muted-foreground">{t.legacyPricing.description}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handlePastePrices}>
                      {t.legacyPricing.pasteButton}
                    </Button>
                  </div>

                  {showBulkPaste ? (
                    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-3">
                      <textarea
                        value={bulkPriceText}
                        onChange={(event) => setBulkPriceText(event.target.value)}
                        placeholder={t.legacyPricing.pastePlaceholder}
                        className="h-28 w-full resize-y rounded-md border border-border/40 bg-background/70 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                      />
                      <p className="text-xs text-muted-foreground">{t.legacyPricing.pasteTip}</p>
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={handleCancelBulkPricing}>
                          {t.legacyPricing.cancel}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleApplyBulkPricing}
                          className="bg-green-700 hover:bg-green-600"
                          disabled={!bulkPriceText.trim()}
                        >
                          {t.legacyPricing.apply}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border/40">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-green-900/20 text-green-100 text-sm">
                          <TableHead className="py-2">{t.legacyPricing.averageStem}</TableHead>
                          <TableHead className="py-2">{t.legacyPricing.basePrice}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {legacyPrices.map((entry, index) => (
                          <TableRow key={entry.averageVolume} className="text-sm">
                            <TableCell className="py-1.5 font-medium">{entry.averageVolume.toFixed(2)}</TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                type="number"
                                step="0.01"
                                value={entry.price}
                                onChange={(event) => {
                                  const newPrice = parseFloat(event.target.value) || 0
                                  setLegacyPrices((prev) =>
                                    prev.map((pricing, i) => (i === index ? { ...pricing, price: newPrice } : pricing)),
                                  )
                                }}
                                placeholder={t.legacyPricing.pricePlaceholder}
                                className="bg-background/60"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button onClick={calculateResults} disabled={stems.length === 0} className="bg-green-700 hover:bg-green-600">
                    {t.actions.calculate}
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="bg-background/60 p-6 shadow-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-green-700">{t.tables.pricePerDbhTitle}</h2>
                  <p className="text-sm text-muted-foreground">{t.tables.pricePerDbhSubtitle}</p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/40">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-emerald-500/10 text-emerald-100">
                        <TableHead>{t.tables.dbh}</TableHead>
                        {DBH_CLASSES.map((dbh) => (
                          <TableHead
                            key={dbh}
                            >
                            {dbh}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {SUPPORTED_SPECIES.map((species) => (
                        <TableRow key={species}>
                          <TableCell className="font-semibold text-green-700">{SPECIES_LABELS[language][species]}</TableCell>
                          {DBH_CLASSES.map((dbh, index) => {
                            const value = speciesPriceMatrix[species][index] ?? 0
                            const display = value > 0 ? value.toFixed(1) : '–'
                            return (
                              <TableCell
                                key={`${species}-${dbh}`}
                                className="text-center text-sm"
                              >
                                {display}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

              </div>
            </Card>

            <Card className="bg-background/60 p-6 shadow-sm">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-green-700">{t.tables.harvestingCalculationTitle}</h2>
                    <p className="text-sm text-muted-foreground">{t.tables.harvestingCalculationSubtitle}</p>
                  </div>
                  <Button onClick={downloadResults} variant="outline" disabled={results.length === 0}>
                    <Download className="mr-2 size-4" />
                    {t.actions.exportSpreadsheet}
                  </Button>
                </div>

                {results.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-emerald-500/40 p-6 text-center text-sm text-muted-foreground">
                    {t.tables.emptyState}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {SUPPORTED_SPECIES.map((species) => {
                      const speciesRows = resultsBySpecies[species]
                      return (
                        <div key={species} className="space-y-3">
                          <h3 className="flex items-center gap-2 text-base font-semibold text-green-700">
                            {SPECIES_LABELS[language][species]}
                          </h3>
                          <div className="overflow-x-auto rounded-lg border border-border/40">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-emerald-500/10 text-emerald-100">
                                  <TableHead>{t.tables.dbh}</TableHead>
                                  <TableHead>{t.tables.stems}</TableHead>
                                  <TableHead>{t.tables.volume}</TableHead>
                                  <TableHead>{t.tables.price}</TableHead>
                                  <TableHead>{t.tables.value}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {speciesRows.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                                      {t.tables.noStemsMessage}
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  <>
                                    {speciesRows.map((row) => (
                                      <TableRow key={`${species}-${row.dbhClass}`}>
                                        <TableCell className="font-medium">{row.dbhClass}</TableCell>
                                        <TableCell>{row.stems}</TableCell>
                                      <TableCell>{row.totalVolume.toFixed(3)}</TableCell>
                                        <TableCell>{row.pricePerCubicMeter.toFixed(2)}</TableCell>
                                        <TableCell>{row.totalPrice.toFixed(2)}</TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow className="bg-green-900/15 font-semibold">
                                      <TableCell>{t.tables.total}</TableCell>
                                      <TableCell>{speciesSummaries[species].stems}</TableCell>
                                      <TableCell>{speciesSummaries[species].volume.toFixed(3)}</TableCell>
                                      <TableCell />
                                      <TableCell>{speciesSummaries[species].totalPrice.toFixed(2)}</TableCell>
                                    </TableRow>
                                  </>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {results.length > 0 && newTotals && oldModelSummary ? (
                  <div className="grid gap-4 rounded-lg border border-border/40 p-4 md:grid-cols-2">
                    <div className="flex h-full flex-col gap-4 rounded-lg border border-green-900/40 bg-background/70 p-4">
                      <div>
                        <h3 className="text-sm uppercase tracking-wide text-green-700">{t.newModel.title}</h3>
                        <p className="text-xs text-muted-foreground">{t.newModel.subtitle}</p>
                      </div>
                      <div className="grid gap-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.newModel.totalStems}</span>
                          <span className="font-semibold text-green-800">{newTotals.totalStems}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.newModel.totalVolume}</span>
                          <span className="font-semibold text-green-800">{newTotals.totalVolume.toFixed(3)} m³</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.newModel.weightedPrice}</span>
                          <span className="font-semibold text-green-800">{newTotals.averagePrice.toFixed(2)} kr/m³</span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-green-700/40 bg-green-900/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-green-600 text-center">{t.newModel.projectedValue}</p>
                        <dl className="mt-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between text-green-800">
                            <dt className="text-muted-foreground">{t.newModel.harvestingCost}</dt>
                            <dd className="font-semibold">{newTotals.totalPrice.toFixed(2)} kr</dd>
                          </div>
                          <div className="flex items-center justify-between text-green-800">
                            <dt className="text-muted-foreground">{t.newModel.forwardingCost}</dt>
                            <dd className="font-semibold">{newTotals.totalForwardingCost.toFixed(2)} kr</dd>
                          </div>
                        </dl>
                        <div className="mt-3 rounded-md border border-green-700/30 bg-green-900/10 px-3 py-2 text-center">
                          <p className="text-[11px] uppercase tracking-wide text-green-600">{t.newModel.combinedTotal}</p>
                          <p className="text-xl font-semibold text-green-700">{newTotals.combinedTotal.toFixed(2)} kr</p>
                        </div>
                        <p className="mt-2 text-center text-[11px] text-muted-foreground">
                          {t.newModel.forwardingRate} {newTotals.forwardingCostPerCubicMeter.toFixed(2)} kr/m³
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-green-700">{t.newModel.valueBySpecies}</p>
                        <div className="mt-2 grid gap-3 sm:grid-cols-3">
                          {SUPPORTED_SPECIES.map((species) => (
                            <div key={`${species}-summary`} className="rounded-md border border-green-900/30 bg-green-900/10 p-3 text-center">
                              <p className="text-[11px] uppercase tracking-wide text-green-600">{SPECIES_LABELS[language][species]}</p>
                              <p className="text-lg font-semibold text-green-700">
                                {speciesSummaries[species].totalPrice.toFixed(2)} kr
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t.newModel.speciesSummary(
                                  speciesSummaries[species].stems,
                                  speciesSummaries[species].volume,
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex h-full flex-col gap-4 rounded-lg border border-green-900/40 bg-background/70 p-4">
                      <div>
                        <h3 className="text-sm uppercase tracking-wide text-green-700">{t.legacyModel.title}</h3>
                        <p className="text-xs text-muted-foreground">{t.legacyModel.subtitle}</p>
                      </div>
                      <div className="grid gap-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.legacyModel.averageStemVolume}</span>
                          <span className="font-semibold text-green-800">{oldModelSummary.averageVolume.toFixed(3)} m³</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.legacyModel.priceForAverageStem}</span>
                          <span className="font-semibold text-green-800">{oldModelSummary.averagePrice.toFixed(2)} kr/m³</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{t.legacyModel.totalVolume}</span>
                          <span className="font-semibold text-green-800">{oldModelSummary.totalVolume.toFixed(3)} m³</span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-green-700/40 bg-green-900/20 px-4 py-3 text-center">
                        <p className="text-[11px] uppercase tracking-wide text-green-600">{t.legacyModel.legacyPayout}</p>
                        <p className="text-2xl font-semibold text-green-700">{oldModelSummary.totalPrice.toFixed(2)} kr</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t.legacyModel.basePriceEntries(
                          legacyPrices.filter((entry) => entry.price > 0).length,
                          legacyPrices.length,
                        )}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        )}
          </main>
        </div>
        <footer className="mt-10 border-t border-green-900/20 bg-background/80">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-muted-foreground lg:px-8">
            <p>{t.footer.ownership}</p>
            <p>{t.footer.project}</p>
            <div>
              <p className="font-semibold uppercase tracking-wide text-green-700">{t.footer.createdBy}</p>
              <ul className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                {TEAM_MEMBERS.map((member) => (
                  <li key={member.name} className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{member.name}</span>
                    <a
                      href={member.linkedin}
                      className="inline-flex items-center text-green-700 transition hover:text-green-600"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <Linkedin aria-hidden="true" className="h-4 w-4" />
                      <span className="sr-only">{t.footer.viewProfile}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </footer>
      </div>
      <Analytics />
    </div>
  )
}

interface AdminPageProps {
  divisors: SpeciesDivisors
  onChange: (next: SpeciesDivisors) => void
  onReset: () => void
  constants: CalculationConstants
  onConstantChange: (key: keyof CalculationConstants, value: number) => void
  language: Language
}

const AdminPage: React.FC<AdminPageProps> = ({ divisors, onChange, onReset, constants, onConstantChange, language }) => {
  const [showConstants, setShowConstants] = useState(false)
  const t = translations[language]

  const updateConstant = (key: keyof CalculationConstants, raw: string) => {
    const parsed = Number.parseFloat(raw)
    onConstantChange(key, Number.isFinite(parsed) ? parsed : 0)
  }

  const updateDivisor = (species: SpeciesCategory, index: number, raw: string) => {
    const trimmed = raw.trim()
    let parsedValue: number | null = null
    if (trimmed !== '') {
      const candidate = Number(trimmed.replace(',', '.'))
      if (Number.isFinite(candidate) && candidate > 0) {
        parsedValue = candidate
      }
    }

    const next: SpeciesDivisors = {
      Tall: [...divisors.Tall],
      Gran: [...divisors.Gran],
      Löv: [...divisors.Löv],
    }
    next[species][index] = parsedValue
    onChange(next)
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t.admin.title}</h2>
          <p className="text-sm text-muted-foreground">{t.admin.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowConstants((prev) => !prev)}>
            {showConstants ? t.admin.hideConstants : t.admin.showConstants}
          </Button>
          <Button variant="outline" size="sm" onClick={onReset}>
            {t.admin.resetDefaults}
          </Button>
        </div>
      </div>

      {showConstants ? (
        <div className="space-y-4 rounded-lg border border-green-900/30 bg-green-900/5 p-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-green-700">{t.admin.advancedConstants}</h3>
            <p className="text-xs text-muted-foreground">{t.admin.advancedConstantsDescription}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="constant-maxPerTreeTime" className="text-xs uppercase tracking-wide text-green-700">
                {t.admin.maxPerTreeTime}
              </Label>
              <Input
                id="constant-maxPerTreeTime"
                type="number"
                value={constants.maxPerTreeTime}
                onChange={(event) => updateConstant('maxPerTreeTime', event.target.value)}
                className="bg-background/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="constant-k1" className="text-xs uppercase tracking-wide text-green-700">
                k1
              </Label>
              <Input
                id="constant-k1"
                type="number"
                step="0.01"
                value={constants.k1}
                onChange={(event) => updateConstant('k1', event.target.value)}
                className="bg-background/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="constant-k2" className="text-xs uppercase tracking-wide text-green-700">
                k2
              </Label>
              <Input
                id="constant-k2"
                type="number"
                step="0.01"
                value={constants.k2}
                onChange={(event) => updateConstant('k2', event.target.value)}
                className="bg-background/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="constant-c11" className="text-xs uppercase tracking-wide text-green-700">
                c11
              </Label>
              <Input
                id="constant-c11"
                type="number"
                step="0.01"
                value={constants.c11}
                onChange={(event) => updateConstant('c11', event.target.value)}
                className="bg-background/60"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>DBH (mm)</TableHead>
              <TableHead>{t.admin.tallDivisor}</TableHead>
              <TableHead>{t.admin.granDivisor}</TableHead>
              <TableHead>{t.admin.lovDivisor}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DBH_CLASSES.map((dbh, index) => (
              <TableRow key={dbh}>
                <TableCell className="font-medium">{dbh}</TableCell>
                {SUPPORTED_SPECIES.map((species) => (
                  <TableCell key={`${species}-${dbh}`}>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={divisors[species][index] ?? ''}
                      onChange={(event) => updateDivisor(species, index, event.target.value)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

export default ForestryHarvesterApp
