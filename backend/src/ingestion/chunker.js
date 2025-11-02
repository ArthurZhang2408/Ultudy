import crypto from 'node:crypto';

const DEFAULT_CHUNK_SIZE_TOKENS = 900;
const DEFAULT_OVERLAP_RATIO = 0.1;
const APPROX_CHARS_PER_TOKEN = 4;

function normalizeText(input) {
  if (!input) {
    return '';
  }

  return input
    .replace(/\r\n/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function estimateTokens(text) {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function findPageRange(boundaries, start, end) {
  let startPage = boundaries.length > 0 ? boundaries[boundaries.length - 1].page : 1;
  let endPage = startPage;

  for (const boundary of boundaries) {
    if (boundary.end > start && startPage === boundaries[boundaries.length - 1].page) {
      startPage = boundary.page;
    }

    if (boundary.start < end) {
      endPage = boundary.page;
    }
  }

  return { startPage, endPage };
}

function buildBoundaries(pages) {
  const boundaries = [];
  let cursor = 0;

  const normalizedPages = pages
    .map((page) => ({ page: page.page, text: normalizeText(page.text) }))
    .filter((page) => page.text.length > 0);

  normalizedPages.forEach((page, index) => {
    const start = cursor;
    cursor += page.text.length;
    boundaries.push({ page: page.page, start, end: cursor });

    if (index < normalizedPages.length - 1) {
      cursor += 2; // account for double newline between pages
    }
  });

  return {
    combinedText: normalizedPages.map((page) => page.text).join('\n\n'),
    boundaries
  };
}

export function chunkPages(pages, options = {}) {
  const chunkSizeTokens = options.chunkSizeTokens ?? DEFAULT_CHUNK_SIZE_TOKENS;
  const overlapTokens = options.overlapTokens ?? Math.round(chunkSizeTokens * DEFAULT_OVERLAP_RATIO);

  if (chunkSizeTokens <= 0) {
    throw new Error('chunkSizeTokens must be greater than 0');
  }

  if (overlapTokens >= chunkSizeTokens) {
    throw new Error('overlapTokens must be smaller than chunkSizeTokens');
  }

  const { combinedText, boundaries } = buildBoundaries(pages);

  if (!combinedText) {
    return [];
  }

  const chunkSizeChars = chunkSizeTokens * APPROX_CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * APPROX_CHARS_PER_TOKEN;

  const chunks = [];
  let cursor = 0;
  const textLength = combinedText.length;

  while (cursor < textLength) {
    let chunkStart = cursor;
    let chunkEnd = Math.min(chunkStart + chunkSizeChars, textLength);

    if (chunkEnd < textLength) {
      const lastWhitespace = combinedText.lastIndexOf(' ', chunkEnd);
      if (lastWhitespace > chunkStart + chunkSizeChars * 0.6) {
        chunkEnd = lastWhitespace;
      }
    }

    let chunkText = combinedText.slice(chunkStart, chunkEnd).trim();

    if (!chunkText) {
      const nextWhitespace = combinedText.indexOf(' ', chunkEnd + 1);
      if (nextWhitespace === -1) {
        chunkText = combinedText.slice(chunkStart).trim();
        chunkEnd = textLength;
      } else {
        chunkEnd = Math.min(nextWhitespace, textLength);
        chunkText = combinedText.slice(chunkStart, chunkEnd).trim();
      }
    }

    if (!chunkText) {
      break;
    }

    while (estimateTokens(chunkText) > chunkSizeTokens) {
      chunkEnd -= Math.max(Math.floor(chunkSizeChars * 0.1), 1);
      chunkText = combinedText.slice(chunkStart, chunkEnd).trim();

      if (chunkEnd <= chunkStart) {
        break;
      }
    }

    const trimmedStart = combinedText.indexOf(chunkText, chunkStart);
    const trimmedEnd = trimmedStart + chunkText.length;

    const { startPage, endPage } = findPageRange(boundaries, trimmedStart, trimmedEnd);

    chunks.push({
      pageStart: startPage,
      pageEnd: endPage,
      text: chunkText,
      tokenCount: estimateTokens(chunkText)
    });

    if (chunkEnd >= textLength) {
      break;
    }

    cursor = Math.max(chunkEnd - overlapChars, 0);
  }

  return chunks;
}

export function deterministicChunkId(chunk) {
  const hash = crypto.createHash('sha1');
  hash.update(`${chunk.pageStart}-${chunk.pageEnd}-${chunk.text}`);
  return hash.digest('hex');
}

export default chunkPages;
