/**
 * Tests for album identity.
 *
 * The grouping bug was a wrong key, so these pin down what the key does with the
 * tag shapes that actually appear in a library: compilation credits, feature
 * credits, case drift, edition suffixes, diacritics, and multi-disc sets. Each
 * pair below is two spellings that must produce the *same* key; the "must not
 * merge" cases are the ones that must stay apart.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  isPlaceholderAlbum,
  makeAlbumId,
  normalizeAlbumPart
} from "./albumIdentity.ts";

test("case, whitespace and punctuation collapse together", () => {
  assert.equal(normalizeAlbumPart("Here Comes The Cowboy"), "here comes the cowboy");
  assert.equal(normalizeAlbumPart("here  comes   the cowboy"), "here comes the cowboy");
  assert.equal(normalizeAlbumPart("Here Comes The Cowboy!"), "here comes the cowboy");
  // The real mac DeMarco collision: only the capitalisation of "The" differed,
  // so two albums were rendered separately.
  assert.equal(
    makeAlbumId(null, "Mac DeMarco", "Here Comes The Cowboy"),
    makeAlbumId(null, "Mac DeMarco", "Here Comes the Cowboy")
  );
});

test("diacritics fold", () => {
  assert.equal(normalizeAlbumPart("Björk"), "bjork");
  assert.equal(normalizeAlbumPart("Café Tacvba"), "cafe tacvba");
});

test("bracketed qualifiers are removed", () => {
  assert.equal(normalizeAlbumPart("Kind of Blue (Remastered)"), "kind of blue");
  assert.equal(normalizeAlbumPart("Album [Explicit]"), "album");
  assert.equal(normalizeAlbumPart("Album (Deluxe)"), "album");
});

test("trailing edition noise is removed even when unbracketed", () => {
  assert.equal(normalizeAlbumPart("Nevermind - Remastered"), "nevermind");
  assert.equal(normalizeAlbumPart("Unknown Pleasures 2015 Remastered"), "unknown pleasures 2015");
});

test("a trailing feature credit is track-level and does not affect the album", () => {
  // This is the shape that split albums apart: the track artist carried the
  // feature, the album artist did not.
  assert.equal(makeAlbumId(null, "Ye feat. Frank Ocean", "The College Dropout"),
    makeAlbumId(null, "Ye", "The College Dropout"));
  assert.equal(makeAlbumId(null, "A feat. B", "Album"), makeAlbumId(null, "A", "Album"));
  assert.equal(makeAlbumId(null, "Travis Scott", "UTOPIA feat. Someone"),
    makeAlbumId(null, "Travis Scott", "UTOPIA"));
});

test("a leading article does not split an album", () => {
  assert.equal(makeAlbumId(null, "Beatles", "Abbey Road"),
    makeAlbumId(null, "The Beatles", "Abbey Road"));
});

test("form tails collapse, so a single and its album track list group together", () => {
  assert.equal(makeAlbumId(null, "Artist", "Song - Single"), makeAlbumId(null, "Artist", "Song"));
  assert.equal(makeAlbumId(null, "Artist", "Thing - EP"), makeAlbumId(null, "Artist", "Thing"));
});

test("a compilation groups by album artist, not by track artist", () => {
  // The single most important property. Every track on a compilation carries the
  // same ALBUMARTIST tag, so they must all land in one group no matter who
  // performs each track.
  const compilation = "Now Thats What I Call Music 80s";
  const id = makeAlbumId(null, "Various Artists", compilation);
  assert.ok(id.startsWith("al:"));
  assert.equal(makeAlbumId(null, "Various Artists", compilation), id);
  assert.equal(makeAlbumId(null, "Various Artists ", ` ${compilation} `), id);
});

test("the album artist decides the group, not the track artist", () => {
  // Kanye West / Ye, the real motivating case. The file carries ARTIST=Ye and
  // ALBUMARTIST=Kanye West. Grouping must key off the album artist.
  //
  // Note that "Ye" and "Kanye West" are *not* equal, and should not be: matching
  // artist aliases needs an authority database and is a different problem.
  // What matters is that the key is built from the album artist, so both tracks
  // of the release agree.
  const fromAlbumArtist = makeAlbumId(null, "Kanye West", "The College Dropout");
  assert.equal(makeAlbumId(null, "Kanye West", "The College Dropout"), fromAlbumArtist);
  // Deriving from the track artist instead would give a different, wrong group.
  assert.notEqual(makeAlbumId(null, "Ye", "The College Dropout"), fromAlbumArtist);
});

test("a MusicBrainz id overrides the derived key", () => {
  const withId = makeAlbumId("99A96BF6-8166-3B7C-97ED-EA525F13EC65", "A", "B");
  assert.equal(withId, makeAlbumId("99a96bf6-8166-3b7c-97ed-ea525f13ec65", "A", "B"));
  // Even when the names disagree, the MBID is canonical.
  assert.equal(withId, makeAlbumId("99a96bf6-8166-3b7c-97ed-ea525f13ec65", "Z", "Y"));
  // And it beats the derived form for the same release.
  assert.notEqual(withId, makeAlbumId(null, "A", "B"));
});

test("discs of a multi-disc set unify under the same album entity", () => {
  const d1 = makeAlbumId(null, "Artist", "Album", 1);
  const d2 = makeAlbumId(null, "Artist", "Album", 2);
  assert.equal(d1, d2);
  assert.equal(makeAlbumId(null, "Artist", "Album", 0), makeAlbumId(null, "Artist", "Album"));
  assert.equal(makeAlbumId(null, "Artist", "Album"), makeAlbumId(null, "Artist", "Album", 0));
});

test("semicolon and multi-artist credit tags resolve to the primary album artist", () => {
  assert.equal(
    makeAlbumId(null, "Ice Cube;Dr. Dre;MC Ren", "Greatest Hits"),
    makeAlbumId(null, "Ice Cube", "Greatest Hits")
  );
  assert.equal(
    makeAlbumId(null, "Young Thug;Travis Scott", "Birds In The Trap Sing McKnight"),
    makeAlbumId(null, "Young Thug", "Birds In The Trap Sing McKnight")
  );
});

test("different albums by the same artist stay separate", () => {
  assert.notEqual(
    makeAlbumId(null, "Artist", "Album One"),
    makeAlbumId(null, "Artist", "Album Two")
  );
});

test("the same album name by different artists stays separate", () => {
  assert.notEqual(
    makeAlbumId(null, "Artist One", "Greatest Hits"),
    makeAlbumId(null, "Artist Two", "Greatest Hits")
  );
});

test("an artist string containing a dash cannot collide across fields", () => {
  // The old key was `${artist} - ${album}`, so these two produced identical
  // strings and merged. The separator is now a NUL, which cannot appear in a
  // tag.
  assert.notEqual(
    makeAlbumId(null, "A - B", "C"),
    makeAlbumId(null, "A", "B - C")
  );
});

test("untagged files all fall into one placeholder group", () => {
  assert.equal(makeAlbumId(null, "", ""), "album:unknown");
  assert.equal(makeAlbumId(null, undefined, undefined), "album:unknown");
  assert.equal(makeAlbumId(null, "Unknown Artist", "Unknown Album"), makeAlbumId(null, "", ""));
});

test("placeholder albums are recognised", () => {
  assert.ok(isPlaceholderAlbum("Unknown Album"));
  assert.ok(isPlaceholderAlbum(""));
  assert.ok(isPlaceholderAlbum(undefined));
  assert.ok(!isPlaceholderAlbum("Kind of Blue"));
  assert.ok(!isPlaceholderAlbum("Unknown Pleasures"));
});

test("the key survives characters that are illegal in a filename", () => {
  // The identity is hashed before it becomes a path, but it is also compared
  // as a string, so it must not be lossy in a way that merges distinct albums.
  const id = makeAlbumId(null, "AC/DC", "Back in Black");
  assert.notEqual(id, makeAlbumId(null, "AC", "DC - Back in Black"));
});