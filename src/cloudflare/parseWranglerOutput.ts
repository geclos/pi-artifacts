export interface WranglerPublishParseResult {
  url?: string;
  claimUrl?: string;
  account?: string;
}

export function parseWranglerOutput(output: string): WranglerPublishParseResult {
  const claimUrl = output.match(/https:\/\/dash\.cloudflare\.com\/claim-preview\?[^\s)]+/)?.[0];
  const urls = Array.from(output.matchAll(/https:\/\/[^\s)]+\.workers\.dev\b[^\s)]*/g)).map((m) => m[0]);
  const account = output.match(/Account:\s*([^\n]+)/)?.[1]?.trim();
  return { url: urls.at(-1), claimUrl, account };
}
