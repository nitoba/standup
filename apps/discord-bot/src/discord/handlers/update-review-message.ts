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
 * For modal submits triggered from buttons, `editReply` may not always reflect
 * the original message reliably. When `interaction.message` is available,
 * we also edit it directly to guarantee components are removed.
 */
export async function updateReviewMessage(
  interaction: ReviewMessageInteraction,
  payload: ReviewMessagePayload,
): Promise<void> {
  await interaction.editReply(payload)

  if (!interaction.message) return

  await interaction.message.edit(payload)
}
