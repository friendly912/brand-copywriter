import type { Brand, BrandProfile, SourceEmail } from "@/lib/types";

/** Shape of GET /api/brands/[id]. */
export interface BrandData {
  brand: Brand;
  sources: SourceEmail[];
  profile: BrandProfile | null;
  versions: Omit<BrandProfile, "profile">[];
  finalsSinceProfile: number;
}
