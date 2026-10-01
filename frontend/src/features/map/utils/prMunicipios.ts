// ──────────────────────────────────────────────────────────────────────────
// Town-center coordinates for Puerto Rico's 78 municipios. Used to fly the
// map near the farmer's land right after farm creation — the alternative
// was an island-wide satellite view and a farmer hunting for their town,
// which is where oversized boundaries and abandoned onboardings began.
// Accuracy is plaza-level (±2 km) — plenty for a town-zoom starting view.
// ──────────────────────────────────────────────────────────────────────────

const MUNICIPIOS: Record<string, [number, number]> = {
  'adjuntas': [18.163, -66.723],
  'aguada': [18.380, -67.188],
  'aguadilla': [18.428, -67.154],
  'aguas buenas': [18.257, -66.103],
  'aibonito': [18.140, -66.266],
  'anasco': [18.283, -67.140],
  'arecibo': [18.472, -66.716],
  'arroyo': [17.966, -66.061],
  'barceloneta': [18.451, -66.539],
  'barranquitas': [18.187, -66.306],
  'bayamon': [18.398, -66.156],
  'cabo rojo': [18.087, -67.146],
  'caguas': [18.234, -66.049],
  'camuy': [18.484, -66.845],
  'canovanas': [18.375, -65.900],
  'carolina': [18.381, -65.957],
  'catano': [18.441, -66.118],
  'cayey': [18.111, -66.166],
  'ceiba': [18.264, -65.649],
  'ciales': [18.336, -66.469],
  'cidra': [18.176, -66.161],
  'coamo': [18.080, -66.358],
  'comerio': [18.219, -66.226],
  'corozal': [18.341, -66.317],
  'culebra': [18.303, -65.301],
  'dorado': [18.459, -66.268],
  'fajardo': [18.326, -65.652],
  'florida': [18.363, -66.561],
  'guanica': [17.972, -66.908],
  'guayama': [17.984, -66.114],
  'guayanilla': [18.019, -66.792],
  'guaynabo': [18.361, -66.110],
  'gurabo': [18.254, -65.973],
  'hatillo': [18.486, -66.825],
  'hormigueros': [18.140, -67.128],
  'humacao': [18.150, -65.827],
  'isabela': [18.501, -67.024],
  'jayuya': [18.219, -66.592],
  'juana diaz': [18.053, -66.507],
  'juncos': [18.227, -65.921],
  'lajas': [18.050, -67.059],
  'lares': [18.295, -66.877],
  'las marias': [18.251, -66.992],
  'las piedras': [18.183, -65.866],
  'loiza': [18.431, -65.880],
  'luquillo': [18.372, -65.717],
  'manati': [18.427, -66.492],
  'maricao': [18.181, -66.980],
  'maunabo': [18.007, -65.899],
  'mayaguez': [18.201, -67.140],
  'moca': [18.395, -67.113],
  'morovis': [18.326, -66.407],
  'naguabo': [18.212, -65.735],
  'naranjito': [18.301, -66.245],
  'orocovis': [18.227, -66.391],
  'patillas': [18.004, -66.016],
  'penuelas': [18.056, -66.722],
  'ponce': [18.012, -66.614],
  'quebradillas': [18.474, -66.939],
  'rincon': [18.340, -67.250],
  'rio grande': [18.380, -65.831],
  'sabana grande': [18.078, -66.960],
  'salinas': [17.977, -66.298],
  'san german': [18.081, -67.041],
  'san juan': [18.466, -66.106],
  'san lorenzo': [18.190, -65.961],
  'san sebastian': [18.337, -66.990],
  'santa isabel': [17.966, -66.405],
  'toa alta': [18.388, -66.248],
  'toa baja': [18.444, -66.254],
  'trujillo alto': [18.355, -66.007],
  'utuado': [18.266, -66.700],
  'vega alta': [18.412, -66.331],
  'vega baja': [18.444, -66.388],
  'vieques': [18.425, -65.833],
  'villalba': [18.128, -66.492],
  'yabucoa': [18.050, -65.879],
  'yauco': [18.035, -66.850],
}

// Longest names first so "sabana grande" wins over a hypothetical "grande".
const NAMES_BY_LENGTH = Object.keys(MUNICIPIOS).sort((a, b) => b.length - a.length)

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents: Bayamón → bayamon
    .replace(/[^a-z\s]/g, ' ')       // drop punctuation ("Gurabo, PR")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Coordinates of the municipio mentioned in a free-text location
    ("Gurabo, PR", "Bo. Caniaco, Utuado"), or null if none matches. */
export function municipioLatLng(location: string | null | undefined): { lat: number; lng: number } | null {
  if (!location) return null
  const norm = ` ${normalize(location)} `
  for (const name of NAMES_BY_LENGTH) {
    if (norm.includes(` ${name} `)) {
      const [lat, lng] = MUNICIPIOS[name]
      return { lat, lng }
    }
  }
  return null
}
