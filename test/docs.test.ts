import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { transform } from "esbuild";
import { describe, expect, it } from "vitest";

import * as paquet from "../src/index.js";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(RACINE, "docs");
const DEPOT = "https://github.com/Vitruves/pharmassistant-js/blob/main/";
const pages = [join(RACINE, "README.md"), ...readdirSync(DOCS).filter((f) => f.endsWith(".md")).map((f) => join(DOCS, f))];
const lire = (chemin: string) => readFileSync(chemin, "utf8");

function ancre(titre: string): string {
  return titre.trim().toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
}

function ancres(chemin: string): Set<string> {
  return new Set([...lire(chemin).matchAll(/^#+ (.+)$/gm)].map((m) => ancre(m[1]!)));
}

describe("documentation", () => {
  it("chaque exemple de code est valide", async () => {
    for (const page of pages) {
      for (const [, langue, code] of lire(page).matchAll(/```(ts|js)\n([\s\S]*?)```/g)) {
        await expect(transform(code!, { loader: langue as "ts" | "js", format: "esm" }), `${page}\n${code}`)
          .resolves.toBeDefined();
      }
    }
  });

  it("chaque lien interne mène à une page et à une ancre existantes", () => {
    for (const page of pages) {
      const texte = lire(page);
      const liens = [
        ...[...texte.matchAll(/\]\((?!https?:|mailto:)([^)]+)\)/g)].map((m) => join(dirname(page), m[1]!)),
        ...[...texte.matchAll(new RegExp(`(?:\\]\\(|href=")${DEPOT.replace(/[.]/g, "\\.")}([^)"]+)`, "g"))]
          .map((m) => join(RACINE, m[1]!)),
      ];
      for (const lien of liens) {
        const [fichier, cible] = lien.split("#") as [string, string | undefined];
        const chemin = existsSync(fichier) && statSync(fichier).isDirectory() ? page : fichier;
        expect(existsSync(chemin), `${page} → ${lien}`).toBe(true);
        if (cible) expect(ancres(chemin), `${page} → ${lien}`).toContain(decodeURIComponent(cible));
      }
    }
  });

  it("le sommaire couvre chaque page", () => {
    const sommaire = lire(join(DOCS, "README.md"));
    for (const f of readdirSync(DOCS).filter((f) => f.endsWith(".md") && f !== "README.md")) {
      expect(sommaire, f).toContain(`](${f})`);
    }
  });

  it("chaque code et chaque exception sont documentés", () => {
    const erreurs = lire(join(DOCS, "erreurs.md"));
    for (const code of Object.keys(paquet.CODES)) expect(erreurs, code).toContain(`\`${code}\``);
    for (const nom of Object.keys(paquet).filter((n) => n.endsWith("Error"))) expect(erreurs, nom).toContain(nom);
  });

  it("typographie sans tiret de ponctuation", () => {
    for (const page of pages) expect(lire(page), page).not.toMatch(/—| – /);
  });

  it("une seule version, partout", () => {
    const { version } = JSON.parse(lire(join(RACINE, "package.json"))) as { version: string };
    expect(paquet.VERSION).toBe(version);
    expect(lire(join(RACINE, "CHANGELOG.md"))).toContain(`## ${version}`);
  });
});
