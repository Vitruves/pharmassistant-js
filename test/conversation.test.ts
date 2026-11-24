import { describe, expect, it } from "vitest";

import { Conversation } from "../src/index.js";
import { Serveur, clarification, client, fluxComplet, reponseAsk } from "./outils.js";

describe("conversation locale", () => {
  it("porte l'historique, sans repères", async () => {
    const serveur = new Serveur(reponseAsk({ answer: "R1.[S1]" }), reponseAsk({ answer: "R2." }));
    const conv = client(serveur).startConversation({ mode: "detailed" });
    expect(conv).toBeInstanceOf(Conversation);
    await conv.ask("Q1 ?");
    await conv.ask("Q2 ?");
    expect(await serveur.corps(0)).toEqual({ question: "Q1 ?", mode: "detailed" });
    expect((await serveur.corps(1)).history).toEqual([
      { role: "user", content: "Q1 ?" }, { role: "assistant", content: "R1." }]);
    expect(conv.id).toBeNull();
    expect(conv.history).toHaveLength(4);
  });

  it("borne l'historique", async () => {
    const conv = client(new Serveur(reponseAsk({ answer: "R." }))).startConversation({ maxHistoryTurns: 2 });
    for (let i = 0; i < 5; i += 1) await conv.ask(`Q${i} ?`);
    expect(conv.history).toHaveLength(4);
    expect(conv.history[0]!.content).toBe("Q3 ?");
  });

  it("garde la demande de précision dans l'historique", async () => {
    const serveur = new Serveur(clarification(), reponseAsk());
    const conv = client(serveur).startConversation();
    const r = await conv.ask("Collyre pour l'oeille ?");
    await conv.ask(r.correctedQuestion("œil"));
    expect((await serveur.corps(1)).question).toBe("Collyre pour l'œil ?");
    expect(((await serveur.corps(1)).history as Array<{ content: string }>)[1]!.content).toBe("Vouliez-vous dire :");
  });

  it("reset repart de zéro", async () => {
    const serveur = new Serveur(reponseAsk());
    const conv = client(serveur).startConversation();
    await conv.ask("Q ?");
    conv.reset();
    await conv.ask("Q ?");
    expect(await serveur.corps()).not.toHaveProperty("history");
  });

  it("refuse les options qu'elle gère", async () => {
    const c = client(new Serveur(reponseAsk()));
    const conv = c.startConversation();
    for (const cle of ["store", "history", "conversationId"]) {
      await expect(conv.ask("Q ?", { [cle]: true } as never)).rejects.toThrow(TypeError);
    }
    expect(() => c.startConversation({ history: [] } as never)).toThrow(TypeError);
  });
});

describe("conversation gardée", () => {
  it("s'ouvre puis se poursuit par son id", async () => {
    const serveur = new Serveur(reponseAsk({ conversation_id: "conv_7" }), reponseAsk({ conversation_id: "conv_7" }));
    const conv = client(serveur).startConversation({ store: true });
    await conv.ask("Q1 ?");
    expect(conv.id).toBe("conv_7");
    await conv.ask("Q2 ?", { citations: "inline" });
    expect(await serveur.corps(1)).toEqual({ question: "Q2 ?", conversation_id: "conv_7", citations: "inline" });
  });

  it("se reprend et s'efface", async () => {
    const serveur = new Serveur(reponseAsk({ conversation_id: "conv_3" }), { id: "conv_3", deleted: true });
    const conv = client(serveur).resumeConversation("conv_3");
    await conv.ask("Suite ?");
    await conv.delete();
    expect(serveur.requetes[1]!.method).toBe("DELETE");
    expect(serveur.requetes[1]!.url.endsWith("/v1/conversations/conv_3")).toBe(true);
    expect(conv.id).toBeNull();
  });

  it("le flux met la conversation à jour", async () => {
    const serveur = new Serveur(fluxComplet(reponseAsk({ conversation_id: "conv_8" })), reponseAsk());
    const conv = client(serveur).startConversation({ store: true });
    await conv.askStream("Q1 ?").finalAnswer();
    expect(conv.id).toBe("conv_8");
    await conv.ask("Q2 ?");
    expect((await serveur.corps(1)).conversation_id).toBe("conv_8");
  });
});
