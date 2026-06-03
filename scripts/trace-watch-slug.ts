/**
 * Trace watch URL / slug for a lead. Usage: npx tsx scripts/trace-watch-slug.ts <leadId>
 */
import "dotenv/config";
import { getVideoIndex, getLeads, getLeadResult } from "../lib/session";
import { watchPageUrl } from "../lib/app-url";
import { ensureWebRedisConnected } from "../lib/redis";
import { slugKey } from "../lib/lead-slug";

const leadId = process.argv[2];
if (!leadId) {
  console.error("Usage: npx tsx scripts/trace-watch-slug.ts <leadId>");
  process.exit(1);
}

async function main() {
  const index = await getVideoIndex(leadId);
  console.log("=== VideoIndex ===");
  console.log(JSON.stringify(index, null, 2));

  if (index) {
    console.log(
      "watchPageUrl({id, slug}):",
      watchPageUrl({ id: index.leadId || leadId, slug: index.slug }),
    );
    console.log("stored shortUrl:", index.shortUrl);

    const leads = await getLeads(index.sessionId);
    const lead = leads.find((l) => l.id === leadId);
    console.log("=== Session lead ===");
    console.log(JSON.stringify(lead, null, 2));

    const result = await getLeadResult(index.sessionId, leadId);
    console.log("=== LeadResult (after repair) ===");
    console.log(
      JSON.stringify(
        { id: result?.id, slug: result?.slug, shortUrl: result?.shortUrl },
        null,
        2,
      ),
    );

    if (lead?.slug) {
      const redis = await ensureWebRedisConnected();
      const mapped = await redis.get(slugKey(lead.slug));
      console.log("slug mapping", lead.slug, "->", mapped);
    }
  } else {
    console.log("No VideoIndex for", leadId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
