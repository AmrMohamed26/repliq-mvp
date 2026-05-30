/** Read width/height from a PNG buffer (IHDR). */
export function getPngDimensions(
  buf: Buffer,
): { width: number; height: number } | null {
  if (buf.length < 24 || buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}
