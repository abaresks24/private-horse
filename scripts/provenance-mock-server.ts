// Controllable provenance mock for the demo. Three "independent" sources (taint / OFAC / hacks).
// Flip an address clean<->dirty live on stage: curl -X POST localhost:8787/flip?address=<addr>&source=hacks
//
// The point on stage: make TWO sources disagree about one address, then show the DON consensus
// (quorum) decide, exclude it from the ASP root, and the withdrawal proof fail — while ragequit
// still lets it exit publicly.

import http from "node:http";

// address -> set of sources currently flagging it as dirty
const flags = new Map<string, Set<string>>();
const dirty = (addr: string, src: string) => flags.get(addr)?.has(src) ?? false;

function verdict(addr: string, src: string) {
  const isDirty = dirty(addr, src);
  return { clean: !isDirty, reason: isDirty ? `${src}: traced to illicit origin` : `${src}: clean` };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const address = url.searchParams.get("address") ?? "";
  res.setHeader("content-type", "application/json");

  if (url.pathname === "/flip" && req.method === "POST") {
    const source = url.searchParams.get("source") ?? "hacks";
    if (!flags.has(address)) flags.set(address, new Set());
    const s = flags.get(address)!;
    s.has(source) ? s.delete(source) : s.add(source);
    console.log(`🔀 ${address} now dirty-on: [${[...s].join(", ") || "none"}]`);
    return res.end(JSON.stringify({ address, dirtyOn: [...s] }));
  }

  // Each source endpoint returns its own verdict for the address.
  const src =
    url.pathname === "/ofac" ? "ofac" : url.pathname === "/hacks" ? "hacks" : "taint";
  res.end(JSON.stringify(verdict(address, src)));
});

const PORT = 8787;
server.listen(PORT, () => console.log(`🧪 provenance mock on http://localhost:${PORT}  (/trace /ofac /hacks /flip)`));
