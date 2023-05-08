import { getNameColor, getNameAbbr } from "./naming";

const getSVGTemplate = (args: { backgroundColor: string; foregroundColor: string; avatarAbbreviation: string; minFontSize?: string }) => {
  const { avatarAbbreviation, minFontSize = '12', backgroundColor, foregroundColor } = args
  const res = /(?<size>\d+)(?<unit>\w+)/.exec(minFontSize)
  const baseSize = Number(res?.groups?.size || '12')
  const unit = res?.groups?.unit || ''
  const width = 32
  const height = 32
  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" x="0"  y="0" rx="4" fill="${backgroundColor}" fill-opacity="1" />
  <text x="${width / 2}" y="${
    (height - baseSize) / 2 + 1
  }" fill="${foregroundColor}" text-anchor="middle" dominant-baseline="central" font-weight="700" font-size="${baseSize}${unit}">
     ${avatarAbbreviation.toUpperCase()}
  </text>
</svg>
`
}

export const generateAvatarDataURI = (args: {
  name?: string
  backgroundColor?: string
  foregroundColor?: string
}) => {
  const { name, foregroundColor = fallbackColor.foregroundColor, backgroundColor = fallbackColor.backgroundColor } = args
  const fallbackColor = getNameColor(args.name)
  let avatarAbbreviation = getNameAbbr(args.name) || name?.[0] || ''
  avatarAbbreviation = avatarAbbreviation
    .replace(/&/g, '')
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/"/g, '')
    .replace(/'/g, '') || ''
  const template = getSVGTemplate({
    backgroundColor,
    foregroundColor,
    avatarAbbreviation,
    minFontSize: '14',
  })
  return `data:image/svg+xml;utf8,${encodeURIComponent(template)}`
}
