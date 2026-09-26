import type { Brand, BrandDoc, BrandProfile, SourceEmail } from "@/lib/types";

/** Shape of GET /api/brands/[id]. */
export interface BrandData {
  brand: Brand;
  sources: SourceEmail[];
  docs: BrandDoc[];
  writingDocs: { chars: number; truncated: boolean };
  profile: BrandProfile | null;
  versions: Omit<BrandProfile, "profile">[];
  finalsSinceProfile: number;
}
