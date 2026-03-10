interface ReviewMessagePayload {
  content: string
  components: []
}

interface ReviewMessageInteraction {
  editReply: (payload: ReviewMessagePayload) => Promise<unknown>
  message?: {
    edit: (payload: ReviewMessagePayload) => Promise<unknown>
  } | null
}

/**
 * Updates the feedback message for a review action and removes action buttons.
 *
 * Uses `editReply` only — it patches the original deferred message via the
 * interaction webhook, which works for both guild and DM contexts without
 * requiring the channel to be present in the client cache.
 *
 * NOTE: `interaction.message.edit()` was removed because it causes
 * "Could not find the channel in the cache" errors when the modal originates
 * from a DM (DM channels are not auto-cached by discord.js).
 */
export async function updateReviewMessage(
  interaction: ReviewMessageInteraction,
  payload: ReviewMessagePayload,
): Promise<void> {
  await interaction.editReply(payload)
}
