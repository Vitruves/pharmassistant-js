// Le paquet construit, chargé par require.
const { PharmAssistant, PharmAssistantError, VERSION } = require("../dist/index.cjs");

const client = new PharmAssistant("pa_fumee_0123456789", {
  fetch: async () => new Response(JSON.stringify({ id: "req_1", status: "ok", answer: "R." })),
});
client.ask("Q ?").then((r) => {
  if (r.answer !== "R." || !(new PharmAssistantError("x") instanceof Error)) throw new Error("cjs");
  console.log(`fumée CJS correcte : ${VERSION}`);
});
