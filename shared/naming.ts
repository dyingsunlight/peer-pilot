
const HSLToRGB = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))]
}

const simpleHash = (str, hashLength = 4, range = 26) => {
  let buffer = new TextEncoder().encode(str)
  if (buffer.byteLength < hashLength) {
    const newBuffer = new Uint8Array(hashLength)
    for (let i = 0; i < hashLength; i++) {
      newBuffer[i] = buffer[i] || buffer[0]
    }
    buffer = newBuffer
  }
  const result: number[] = []
  const segments = Math.floor(buffer.byteLength / hashLength)
  for (let i = 0; i < hashLength; i++) {
    let mod = 0
    for (let j = i * segments; j < (i + 1) * segments; j++) {
      mod = (mod + buffer[j]) % range
    }
    result.push(mod)
  }
  return result
}

export const getNameColor = (name?: string) => {
  if (name) {
    const hash = simpleHash(name, 2, 100)
    const h = (hash[0] / 100) * 360
    const s = Math.max(0.8, Math.min(0.4, hash[1] / 100))
    const l = 0.5
    const [r, g, b] = HSLToRGB(h, s, l)
    const backgroundColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    const foregroundColor = '#FFF'
    return {
      foregroundColor,
      backgroundColor,
    }
  } else {
    const h = Math.random() * 360
    const s = Math.max(0.8, Math.min(0.4, Math.random()))
    const l = 0.5
    const [r, g, b] = HSLToRGB(h, s, l)
    const backgroundColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    const foregroundColor = '#FFF'
    return {
      foregroundColor,
      backgroundColor,
    }
  }
}

const preset = {
  adjective: [
    "Awesome",
    "Fantastic",
    "Amazing",
    "Incredible",
    "Spectacular",
    "Fabulous",
    "Terrific",
    "Wonderful",
    "Marvelous",
    "Brilliant",
    "Delightful",
    "Charming",
    "Enchanting",
    "Captivating",
    "Exquisite",
    "Splendid",
    "Glorious",
    "Majestic",
    "Radiant",
    "Sparkling"
  ],
  noun: [
    "Huskies",
    "Panda",
    "Kingfisher",
    "Sparrow",
    "Parrot",
    "Magpie",
    "Bluejay",
    "Jaybird",
    "Kingfisher",
    "Hummingbird",
    "Starling",
    "Chickadee",
    "Goldfinch",
    "Robin",
    "Wren",
    "Pigeon",
    "Dove",
    "Crow",
    "Raven",
    "Finch",
    "Oriole",
    "Swallow",
    "Seagull",
    "Pelican",
    "Stork",
    "Crane",
    "Eagle",
    "Falcon",
    "Phoenix",
    "Owl",
    "Woodpecker",
    "Kestrel",
    "Toucan",
    "Penguin"
  ]
}
export const getRandomName = () => {
  const adjective = preset.adjective[Math.floor(Math.random() * preset.adjective.length - 1)]
  const noun = preset.noun[Math.floor(Math.random() * preset.adjective.length - 1)]
  return `${adjective} ${noun}`
}

export const getNameAbbr = (fullname: string) => {
  return (fullname || "").split(' ').filter(Boolean).map(item => item[0]).join('')
}
