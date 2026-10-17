/** An AI feature asked for a key: the AI services page shows a notice, focuses the key and can send the learner back. */
export interface KeyRequest {
  /** Changes with every request, so asking again while already on the page focuses the field again. */
  id: number;
  /** Where the learner was (a route hash), or null when they were already in Settings. */
  returnTo: string | null;
}
