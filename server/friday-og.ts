const PARTY_GIFS = [
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/5xaOcLGvzHxDKjufnLW/giphy.gif",
  "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif",
  "https://media.giphy.com/media/l4FGni1RBAR2OWsGk/giphy.gif",
  "https://media.giphy.com/media/l3q2Z6S6n38zjPswo/giphy.gif",
  "https://media.giphy.com/media/3o7TKSxdQJIoiRXHl6/giphy.gif",
  "https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif",
  "https://media.giphy.com/media/l0HlKrB02QY0f1mbm/giphy.gif",
];

export function getGifUrlFromQuery(gifParam: string | null | undefined): string {
  if (gifParam !== null && gifParam !== undefined) {
    const parsed = parseInt(gifParam, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < PARTY_GIFS.length) {
      return PARTY_GIFS[parsed];
    }
  }
  return PARTY_GIFS[0];
}

export function injectFridayOgTags(html: string, gifUrl: string): string {
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="It's Friday! - FridayReport.AI" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="Celebrate another productive week! Share the Friday feeling with your team." />`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${gifUrl}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="https://fridayreport.ai/friday" />`
  );

  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="It's Friday! - FridayReport.AI" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="Celebrate another productive week! Share the Friday feeling with your team." />`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${gifUrl}" />`
  );

  return html;
}
