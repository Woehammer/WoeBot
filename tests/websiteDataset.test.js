import test from "node:test";
import assert from "node:assert/strict";

import { websiteGamesToLegacyRows } from "../src/engine/fetch/dataset.js";

test("website games are grouped into legacy tournament rows", () => {
  const games = [
    {
      event: "Test GT",
      date: "46213",
      country: "United Kingdom",
      round: 2,
      player: "Example Player",
      faction: "Gloomspite Gits",
      formation: "Squigalanche",
      result: "L",
      battleplan: "Battle Two",
      elo: 510,
      closingElo: 505,
      expected: 0.6,
    },
    {
      event: "Test GT",
      date: "46213",
      country: "United Kingdom",
      round: 1,
      player: "Example Player",
      faction: "Gloomspite Gits",
      formation: "Squigalanche",
      result: "W",
      battleplan: "Battle One",
      elo: 500,
      closingElo: 510,
      expected: 0.55,
    },
  ];
  const lists = [{
    event: "Test GT",
    player: "Example Player",
    faction: "Gloomspite Gitz",
    formation: "Squigalanche",
    list: "General's Regiment\nMonsta-Killaz (120)\n• Reinforced",
    source: "Website",
  }];

  const rows = websiteGamesToLegacyRows(games, lists, "July 2026 Battlescroll");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].Faction, "Gloomspite Gitz");
  assert.equal(rows[0].Played, 2);
  assert.equal(rows[0].Won, 1);
  assert.equal(rows[0].Lost, 1);
  assert.equal(rows[0]["Starting Elo"], 500);
  assert.equal(rows[0]["Closing Elo"], 505);
  assert.equal(rows[0].BP1, "Battle One");
  assert.equal(rows[0].R1, "W");
  assert.match(rows[0]["Refined List"], /Monsta-Killaz/);
});

test("website spellings are canonicalised", () => {
  const rows = websiteGamesToLegacyRows([{
    event: "Test GT",
    player: "Luis Mendoza",
    faction: "Hedonites of Slanesh",
    round: 1,
    result: "W",
  }], [], "Current");

  assert.equal(rows[0].Player, "Luis Mendoza Jr");
  assert.equal(rows[0].Faction, "Hedonites of Slaanesh");
});
