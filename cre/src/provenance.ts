// Multi-source provenance tracing. This is WHY the DON is load-bearing: the inputs are off-chain,
// mutable, and can DISAGREE. No single source is trusted — a deposit is "clean" only if >= quorum
// independent sources trace its funds to a non-illicit origin. One source lying/down cannot
// unilaterally censor (or whitelist) a deposit.

export interface ProvenanceSource {
  name: string;
  url: string; // address is appended
}

export interface SourceVerdict {
  source: string;
  clean: boolean;
  reason: string;
}

/**
 * Query every source for one address. Each DON node runs this independently; consensus is reached
 * on the resulting clean-set downstream. `httpGet` is injected so it can be the CRE http capability
 * (in-workflow, consensus-wrapped) or plain fetch (in the mock/test harness).
 */
export async function traceAddress(
  address: string,
  sources: ProvenanceSource[],
  httpGet: (url: string) => Promise<any>
): Promise<SourceVerdict[]> {
  return Promise.all(
    sources.map(async (s): Promise<SourceVerdict> => {
      try {
        const res = await httpGet(`${s.url}${address}`);
        // Expected shape: { clean: boolean, reason: string } — normalize taint APIs to this.
        return { source: s.name, clean: Boolean(res?.clean), reason: String(res?.reason ?? "") };
      } catch (e) {
        // A source being DOWN is treated as "no clean signal" — fail closed, never fail open.
        return { source: s.name, clean: false, reason: `source-error:${(e as Error).message}` };
      }
    })
  );
}

/** k-of-n decision. Clean iff at least `quorum` sources independently say clean. */
export function isClean(verdicts: SourceVerdict[], quorum: number): boolean {
  return verdicts.filter((v) => v.clean).length >= quorum;
}

/** Surfaces disagreement — the thing to show on stage ("two sources disagree, consensus decides"). */
export function disagreement(verdicts: SourceVerdict[]): boolean {
  const clean = verdicts.filter((v) => v.clean).length;
  return clean > 0 && clean < verdicts.length;
}
