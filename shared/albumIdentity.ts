/**
 * Album identity.
 *
 * The library had no notion of an album at all. Groups were built from a raw
 * `` `${artist} - ${album}` `` concatenation of two strings straight off the
 * tags, which fails in several ways at once:
 *
 *   - `ARTIST` is the *track* artist, so a compilation or any album whose
 *     tracks carry per-track credits splits into one album per credit.
 *   - Nothing normalises case, so "Here Comes The Cowboy" and "Here Comes the
 *     Cowboy" are two albums.
 *   - Nothing normalises edition suffixes, so the same album tagged
 *     "(Remastered)" in one rip and bare in another becomes two albums.
 *   - Nothing normalises whitespace or Unicode, so "Blue" and "Blue " or
 *     "Björk" vs "Bjork" are two albums.
 *
 * The fix is an explicit, stable key. When MusicBrainz has tagged the release
 * its ID is used verbatim, because that is canonical and edition-aware. When
 * it has not, the key is derived from the *album* artist plus the album title
 * plus the disc number, each normalised through the same function.
 *
 * This module is shared by the server (which stamps `albumId` onto every
 * track) and the client (which groups on it), so both sides are guaranteed to
 * agree. It has to stay dependency-free: the server bundles it with esbuild
 * for the native build, and the client imports it through Vite.
 */

/**
 * Release-suffix noise that appears in album titles and should not affect
 * identity. These are the strings taggers and rippers add for the *same*
 * album. A deluxe edition is a genuinely different release and does not belong
 * here, because it has different tracks and different artwork.
 */
const EDITION_NOISE = [
  "remastered",
  "remaster",
  "remastered edition",
  "remaster version",
  "bonus tracks",
  "bonus track edition",
  "anniversary edition",
  "expanded edition",
  "special edition",
  "standard edition",
  "original recording",
  "digitally remastered"
];

/**
 * Trailing form descriptors, e.g. "Album - Single", "Album - EP".
 *
 * These are not edition noise: a single and an album of the same name are
 * different releases with different track lists. They are stripped here only
 * for *matching*, never for display.
 */
const FORM_TAIL = [
  "- single",
  "- ep",
  "- maxi single",
  "- album",
  "- lp",
  "- mixtape"
];

const FEAT_CREDIT = /\b(feat|ft|featuring|with)\.?\s+.*$/i;

/**
 * Extract the primary artist name from a credit string.
 *
 * Strips feature credits ("A feat. B" -> "A"), semicolon-delimited lists
 * ("A; B; C" -> "A"), and slash-delimited lists ("A / B" -> "A").
 */
export function extractPrimaryArtist(input: string | undefined | null): string {
  if (!input) return "";
  let s = String(input).trim();
  s = s.replace(FEAT_CREDIT, "").trim();
  if (s.includes(";")) s = s.split(";")[0].trim();
  if (s.includes(" / ")) s = s.split(" / ")[0].trim();
  return s;
}

/**
 * Collapse one tag value to a comparable form.
 *
 * The steps, in order: strip diacritics so "Björk" and "Bjork" agree; drop
 * bracketed qualifiers such as "(Remastered)" or "[Explicit]"; drop trailing
 * "feat." credits, which is how a track-level artist string becomes an
 * album-level one; strip form tails; drop leading articles so "The Beatles"
 * and "Beatles" agree; then collapse all whitespace and lower-case.
 *
 * Note that the bracketed-qualifier step runs before the article step, so
 * "Kind of Blue (Remastered)" reduces to "kind of blue" rather than leaving
 * the parenthesis behind.
 */
export function normalizeAlbumPart(input: string | undefined | null): string {
  if (!input) return "";
  let s = String(input);

  // Diacritics: Björk -> Bjork, Café -> Cafe. Decompose then drop the marks.
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  // Bracketed qualifiers. Non-greedy so "(a) (b)" both come off.
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");

  // A trailing feature credit or multi-artist list belongs to the track, not the album.
  s = s.replace(FEAT_CREDIT, " ");
  s = s.replace(/;.*$/, " ");
  s = s.replace(/\s+\/\s+.*$/, " ");

  s = s.toLowerCase();

  // Bracketed qualifiers can contain edition noise that was not bracketed,
  // e.g. "Album - Remastered 2011". Trim those trailing words.
  let changed = true;
  while (changed) {
    changed = false;
    for (const tail of [...EDITION_NOISE, ...FORM_TAIL]) {
      if (s.endsWith(` ${tail}`)) {
        s = s.slice(0, -(tail.length + 1)).trim();
        changed = true;
      }
    }
  }

  // Punctuation to spaces, then collapse. Apostrophes go too, so "Guns N'
  // Roses" and "Guns N Roses" agree.
  s = s.replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ");

  // Leading article. Only "the" — "A" and "An" are far too ambiguous
  // ("A Day in the Life" vs "Day in the Life") to treat as interchangeable.
  s = s.replace(/^the\s+/, "");

  return s.replace(/\s+/g, " ").trim();
}

/**
 * Leading article as it should be *displayed*, preserved separately.
 *
 * Kept so the UI can present the album in its original form while grouping on
 * the normalised one. Without this, an album whose tags differ only by
 * capitalisation gets grouped correctly but rendered with whichever variant
 * happened to be scanned first.
 */
export function albumDisplayName(input: string | undefined | null): string {
  if (!input) return "";
  return String(input).trim();
}

/**
 * Canonical album key.
 *
 * @param musicbrainzAlbumId  MUSICBRAINZ_ALBUMID when the file carries one.
 * @param albumArtist  ALBUMARTIST, falling back to the track artist.
 * @param album  The ALBUM tag.
 * @param _discNumber  Optional disc number (unified into album release key).
 */
export function makeAlbumId(
  musicbrainzAlbumId: string | undefined | null,
  albumArtist: string | undefined | null,
  album: string | undefined | null,
  _discNumber?: string | number | null
): string {
  const mb = (musicbrainzAlbumId || "").trim();
  if (mb) return `mb:${mb.toLowerCase()}`;

  const primary = extractPrimaryArtist(albumArtist);
  const artist = isPlaceholderValue(primary) ? "" : normalizeAlbumPart(primary);
  const title = isPlaceholderValue(album) ? "" : normalizeAlbumPart(album);

  if (!artist && !title) return "album:unknown";
  return `al:${artist}\u0000${title}`;
}

const PLACEHOLDER_NAMES = new Set(["unknown", "unknown album", "unknown artist", "various"]);

/**
 * Whether a tag value is a placeholder the user never actually supplied.
 *
 * "Various" is in the list because `Various Artists` as an *album* artist is a
 * genuine compilation credit and must group those tracks together, so it is not
 * treated as missing here.
 */
function isPlaceholderValue(input: string | undefined | null): boolean {
  const n = normalizeAlbumPart(input);
  return n === "" || PLACEHOLDER_NAMES.has(n);
}

/**
 * Whether an album group name is a placeholder the user never tagged.
 *
 * Used so the UI can sort untagged albums to the bottom instead of letting
 * "Unknown Album" scatter through the library.
 */
export function isPlaceholderAlbum(album: string | undefined | null): boolean {
  return isPlaceholderValue(album);
}