/** Build deep-link / universal import URL for VPN clients */

export interface VpnAppLink {
  name: string;
  url: string;
  scheme?: string;
}

const DEFAULT_SCHEMES: Record<string, string> = {
  android: "v2rayng://install-sub?url=",
  ios: "streisand://import/",
};

export function buildImportUrl(subUrl: string, platform?: string, customScheme?: string): string {
  const encoded = encodeURIComponent(subUrl);
  const scheme =
    customScheme ||
    (platform ? DEFAULT_SCHEMES[platform] : undefined) ||
    `sub://${encoded}`;
  if (scheme.includes("{url}")) {
    return scheme.replace("{url}", encoded);
  }
  if (scheme.endsWith("=") || scheme.endsWith("/")) {
    return `${scheme}${encoded}`;
  }
  return `${scheme}${subUrl}`;
}

export function parseAppLinksJson(raw?: string): Record<string, VpnAppLink[]> {
  if (!raw?.trim()) return {};
  try {
    const data = JSON.parse(raw);
    if (typeof data !== "object" || !data) return {};
    const out: Record<string, VpnAppLink[]> = {};
    for (const [platform, links] of Object.entries(data)) {
      if (!Array.isArray(links)) continue;
      out[platform] = links
        .filter((l) => l && typeof l === "object" && l.name && l.url)
        .map((l) => ({
          name: String(l.name),
          url: String(l.url),
          scheme: l.scheme ? String(l.scheme) : undefined,
        }));
    }
    return out;
  } catch {
    return {};
  }
}
