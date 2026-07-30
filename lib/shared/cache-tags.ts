/**
 * Tag carried by every unstable_cache data read on the public pages (`/`, `/companies`,
 * `/analysis`), so a single revalidateTag(DATA_CACHE_TAG) from POST /api/revalidate refreshes
 * them all at once after a data write. The per-URL ISR pages (`/j/[id]`, `/e/[id]`) are not
 * tagged; the route refreshes those with revalidatePath instead.
 */
export const DATA_CACHE_TAG = "db-data"
