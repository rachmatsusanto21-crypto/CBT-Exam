/**
 * Formats image URLs so that external links (Google Drive, Dropbox, direct web URLs)
 * render reliably in <img> tags, print/PDF views, and Word exports without CORS or referrer blocks.
 */
export function formatImageUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Data URLs (base64) are already self-contained direct image streams
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  // Google Drive sharing link conversion:
  // Examples:
  // - https://drive.google.com/file/d/1A2B3C4D5E.../view?usp=sharing
  // - https://drive.google.com/open?id=1A2B3C4D5E...
  // - https://drive.google.com/uc?id=1A2B3C4D5E...
  // - https://drive.google.com/file/d/1A2B3C4D5E.../preview
  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch && driveFileMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}`;
  }

  const driveIdMatch = trimmed.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
  }

  // Dropbox share link conversion: change dl=0 to raw=1
  if (trimmed.includes("dropbox.com") && trimmed.includes("dl=0")) {
    return trimmed.replace("dl=0", "raw=1");
  }

  // GitHub raw link conversion
  if (trimmed.includes("github.com") && trimmed.includes("/blob/")) {
    return trimmed.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
  }

  return trimmed;
}

/**
 * Returns safe image attributes for <img> JSX elements to prevent browser referrer blocking.
 */
export function getSafeImageProps(src?: string | null, alt: string = "") {
  return {
    src: formatImageUrl(src),
    alt,
    referrerPolicy: "no-referrer" as const,
    crossOrigin: "anonymous" as const,
  };
}
